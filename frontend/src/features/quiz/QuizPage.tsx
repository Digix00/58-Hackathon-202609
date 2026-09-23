import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { notebookBindingStyle } from '../../shared/components/notebookBindingLayout'
import {
  notebookAngleForDrag,
  prefersReducedMotion,
  useNotebookSwipe,
} from '../../shared/hooks/useNotebookSwipe'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import { answerDemoQuiz, demoQuiz, useDemoState, type DemoQuizResult } from '../demo/demoStore'
import styles from './QuizPage.module.css'

type Letter = (typeof demoQuiz.letters)[number]
type Person = (typeof demoQuiz.people)[number]
type Answers = Record<string, string>
type DragState = {
  personId: string
  x: number
  y: number
  over: boolean
  width: number
  height: number
}
type TurningState = {
  letter: Letter
  personId?: string
  startAngle: number
  direction: 1 | -1
}

type QuizStep = 'letters' | 'submitting' | 'results'
type QuizState = {
  step: QuizStep
  index: number
  answers: Answers
}
type QuizAction =
  | { type: 'fit'; letterId: string; personId: string }
  | { type: 'openLetter'; index: number }
  | { type: 'pull'; letterId: string }
  | { type: 'go'; direction: 1 | -1 }
  | { type: 'submitStarted' }
  | { type: 'showResults' }

/**
 * しおりの色。条件ごとに固定し、どの紙に挟んでも同じ選択肢だと分かるようにする。
 * 正誤を示す色ではないので、回答の前後で変えない。
 */
const PIECE_COLORS: Record<string, string> = {
  a: '#f9e7ac',
  b: '#cde5dc',
  c: '#e3dafa',
}
/** しおりと切り欠きの型紙。同じ形を使うことで、片方が片方に収まると分かる。 */
const TAG_PATH = 'M3 3 L50 15 L97 3 V75 H3 Z'
/** 切り欠きの外でも、これだけ近ければ差し込んだことにする。 */
const DROP_PAD = 22
/** つまんで運んだとみなす距離。これ未満なら、押しただけとして扱う。 */
const TAP_SLOP = 8
/**
 * 差し込んでから紙がめくれるまでの間。
 * 挟まったしおりを目に留める時間であり、ちがったと気づいて
 * 手を戻すための時間でもある。
 */
const SETTLE_MS = 600
const initialState: QuizState = { step: 'letters', index: 0, answers: {} }

function personById(id: string | undefined) {
  return demoQuiz.people.find((person) => person.id === id)
}

/**
 * しおりは1人1枚しかない。別の紙に挟んであれば、そちらから抜けてくる。
 * 重複は起こりようがないので、選び直しを促す文言は要らない。
 */
function placeAnswer(answers: Answers, letterId: string, personId: string): Answers {
  const next: Answers = {}
  for (const [id, value] of Object.entries(answers)) {
    if (value !== personId) next[id] = value
  }
  next[letterId] = personId
  return next
}

/** まだしおりが挟まっていない、いちばん手前の手紙。すべて埋まっていれば -1。 */
function firstOpenIndex(answers: Answers) {
  return demoQuiz.letters.findIndex((letter) => !answers[letter.id])
}

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'fit':
      /*
       * 挟むだけ。紙はその場に残す。
       * 差した瞬間に次の手紙へ移ると、自分が何を選んだのかを見ないまま
       * 紙が去ってしまう。めくるのは一拍おいてから（QuizPage の fit）。
       */
      return { ...state, answers: placeAnswer(state.answers, action.letterId, action.personId) }
    case 'openLetter':
      return { ...state, index: action.index }
    case 'pull': {
      const answers = { ...state.answers }
      delete answers[action.letterId]
      return { ...state, answers }
    }
    case 'go': {
      const index = state.index + action.direction
      if (index < 0 || index >= demoQuiz.letters.length) return state
      return { ...state, index }
    }
    case 'submitStarted':
      return { ...state, step: 'submitting' }
    case 'showResults':
      return { ...state, step: 'results', index: 0 }
  }
}

/**
 * 合っていた手紙にだけ引く、まる。
 * 記号の ○ を置くと、この画面の中でここだけ定規で引いた線に見えるので、
 * フィードのハートと同じように、左右を揃えない一筆で描く。
 * 横幅は判定の文字に合わせて伸びるため、線の太さだけは伸縮させない。
 */
function CorrectRing() {
  return (
    <svg
      className={styles.ring}
      viewBox="0 0 200 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M128 5.5C78 1.5 16 9 8 28c-6 16 36 30.5 92 31 58 .5 96-13 93-30C190 13 142 4.5 92 6c-16 .5-32 2.5-44 5.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** しおりの面。切り欠きと同じ型紙で描き、落ち影を別の紙片として下に敷く。 */
function TagFace() {
  return (
    <>
      <svg
        className={styles.shape}
        viewBox="0 0 100 78"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className={styles.tagShadow} d={TAG_PATH} transform="translate(2.5 3)" />
        <path className={styles.tagFace} d={TAG_PATH} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.tagLabel} aria-hidden="true">
        条件
      </span>
    </>
  )
}

function tagStyle(personId: string) {
  return { '--piece': PIECE_COLORS[personId] } as CSSProperties
}

/**
 * 紙の一枚。本文と、その下に置くもの（切り欠き、または結果）を受け取る。
 * 前後の手紙へは左右のスワイプと矢印キーで移動する。
 */
function Paper({
  children,
  dragX = 0,
  className = '',
}: {
  children: ReactNode
  dragX?: number
  /** 紙の中身に合わせた行送り。結果の紙だけ、判定のメモのぶん余白を取り直す。 */
  className?: string
}) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${className} ${
        turnStyles.page
      } ${dragX !== 0 ? turnStyles.pageDragging : ''}`}
      style={{
        transform: dragX < 0 ? `rotateY(${notebookAngleForDrag(dragX)}deg)` : undefined,
      }}
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      {children}
    </article>
  )
}

function QuizPaperBody({
  target,
  personId,
  interactive,
  showingResults,
  body,
  slotRef,
  dragOver,
  onPull,
}: {
  target: Letter
  personId: string | undefined
  interactive: boolean
  showingResults: boolean
  body: string | undefined
  slotRef: React.RefObject<HTMLSpanElement | null>
  dragOver: boolean
  onPull: (letterId: string) => void
}) {
  const writer = personById(target.correctPerson)
  const fitted = personById(personId)

  if (showingResults && writer) {
    const correct = personId === target.correctPerson
    return (
      <>
        <div className={styles.fit}>
          {/* 結果でも、書き手の条件を手紙の上端に残す。 */}
          <span className={styles.choice}>
            <span className={styles.tag} style={tagStyle(writer.id)}>
              <TagFace />
            </span>
            <span className={styles.attributes}>{writer.attributes}</span>
          </span>
          {/* 問いかけと同じ位置に、そのまま答えを置く。 */}
          <p className={styles.ask}>この声の条件</p>
        </div>
        <div className={styles.letterSheet}>
          <p className={styles.letter}>{body}</p>
        </div>
        <div className={styles.verdict} role="status">
          <p className={styles.judge}>
            {correct ? <CorrectRing /> : null}
            {correct ? '合っていました' : 'ちがいました'}
            {/*
              書いた条件はすぐ上のしおりに出ているので、目では読み返せる。
              読み上げでは紙の上端まで戻れないので、ここで言葉にして添える。
            */}
            {correct ? null : (
              <span className={styles.srOnly}>。書いた条件は{writer.attributes}</span>
            )}
          </p>
          <p className={styles.note}>{target.explanation}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={styles.fit}>
        {fitted ? (
          <button
            type="button"
            className={`${styles.choice} ${styles.fitted}`}
            onClick={() => interactive && onPull(target.id)}
            aria-label={`条件は${fitted.attributes}。この声から外す`}
          >
            <span className={styles.tag} style={tagStyle(fitted.id)}>
              <TagFace />
            </span>
            <span className={styles.attributes}>{fitted.attributes}</span>
          </button>
        ) : (
          <span
            ref={interactive ? slotRef : undefined}
            className={`${styles.tag} ${styles.slot} ${dragOver ? styles.over : ''}`}
            aria-hidden="true"
          >
            <svg
              className={styles.shape}
              viewBox="0 0 100 78"
              preserveAspectRatio="none"
              focusable="false"
            >
              <path className={styles.tagHollow} d={TAG_PATH} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className={styles.tagLabel}>ここへ</span>
          </span>
        )}
        {/* 問いかけの場所は動かさない。挟んだあとは、やり直し方をここで伝える。 */}
        <p className={styles.ask}>{fitted ? 'ちがったら、しおりを押す' : 'この声は、どの条件？'}</p>
      </div>
      <div className={styles.letterSheet}>
        <p className={styles.letter}>{body}</p>
      </div>
    </>
  )
}

function QuizActions({
  showingResults,
  canGoNext,
  complete,
  submitting,
  score,
  onNext,
  onSubmit,
}: {
  showingResults: boolean
  canGoNext: boolean
  complete: boolean
  submitting: boolean
  score: number | undefined
  onNext: () => void
  onSubmit: () => void
}) {
  if (showingResults) {
    return (
      <div className={styles.actions}>
        {canGoNext ? (
          <button
            type="button"
            className={`${actionStyles.primary} ${styles.nextButton}`}
            onClick={onNext}
          >
            つぎの手紙へ <span aria-hidden="true">→</span>
          </button>
        ) : (
          <>
            {score !== undefined ? (
              <p className={styles.score}>
                3つのうち<strong>{score}</strong>つ、
                <br />
                言葉から見つけられました。
              </p>
            ) : null}
            <Link className={actionStyles.primary} to="/history">
              履歴を見る
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.actions}>
      {complete ? (
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.nextButton}`}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '出しています…' : 'これで出す'}
        </button>
      ) : null}
    </div>
  )
}

function useQuizNavigation(quizResult: DemoQuizResult | null) {
  const [state, dispatch] = useReducer(quizReducer, initialState)
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<TurningState | null>(null)

  const letters = demoQuiz.letters
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? quizResult.answers : state.answers
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = demoQuiz.people.filter((person) => !answeredPersonIds.has(person.id))
  const complete = remaining.length === 0
  const canGoNext = state.index < letters.length - 1 && !turning
  const canGoPrev = state.index > 0 && !turning

  /**
   * 差し込んでから紙がめくれるまでの、待ちの札。
   * 待っている間に自分でめくったり、しおりを抜いたりしたら、この札は破る。
   */
  const settle = useRef<number | null>(null)
  const cancelSettle = useCallback(() => {
    if (settle.current === null) return
    window.clearTimeout(settle.current)
    settle.current = null
  }, [])

  useEffect(() => cancelSettle, [cancelSettle])

  const go = useCallback(
    (direction: 1 | -1, startAngle = 0) => {
      cancelSettle()
      if (turning) return
      const index = state.index + direction
      if (index < 0 || index >= letters.length) return
      if (prefersReducedMotion()) {
        setTurning(null)
        dispatch({ type: 'go', direction })
        return
      }

      if (direction === 1) {
        // 進むときは、いま見ている紙をめくって下の紙を出す。
        setTurning({ letter, personId: answers[letter.id], startAngle, direction: 1 })
        dispatch({ type: 'go', direction })
      } else {
        // 戻るときは、伏せていた前の紙を同じ共有アニメーションで拾い上げる。
        const previous = letters[index]
        setTurning({
          letter: previous,
          personId: answers[previous.id],
          startAngle: 0,
          direction: -1,
        })
      }
    },
    [answers, cancelSettle, letter, letters, state.index, turning],
  )

  function fit(personId: string) {
    if (showingResults || state.step === 'submitting' || turning || answers[letter.id]) return
    const next = placeAnswer(state.answers, letter.id, personId)
    const open = firstOpenIndex(next)
    const placed = letter
    dispatch({ type: 'fit', letterId: letter.id, personId })
    // 空いている手紙が別にあるときだけ、この紙はめくれて去る。
    if (open === -1 || open === state.index) return

    cancelSettle()
    /*
     * すぐにはめくらない。挟まったしおりを一拍だけ見せる。
     * その間に「ちがった」と気づいたら、しおりを押せば手元へ戻り、
     * 紙もその場に留まる（cancelSettle）。
     */
    settle.current = window.setTimeout(() => {
      settle.current = null
      if (!prefersReducedMotion()) {
        setTurning({ letter: placed, personId, startAngle: 0, direction: 1 })
      }
      dispatch({ type: 'openLetter', index: open })
    }, SETTLE_MS)
  }

  const submit = async () => {
    dispatch({ type: 'submitStarted' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    answerDemoQuiz(state.answers)
    dispatch({ type: 'showResults' })
  }

  const finishTurn = useCallback(() => {
    if (turning?.direction === -1) dispatch({ type: 'go', direction: -1 })
    setTurning(null)
  }, [turning])

  const pull = useCallback(
    (letterId: string) => {
      // 抜いたなら、めくるのはやめる。選び直す紙が目の前から消えてしまう。
      cancelSettle()
      dispatch({ type: 'pull', letterId })
    },
    [cancelSettle],
  )

  return {
    state,
    letter,
    answers,
    remaining,
    complete,
    showingResults,
    canGoNext,
    canGoPrev,
    turning,
    go,
    fit,
    submit,
    finishTurn,
    pull,
  }
}

function useQuizDrag(fit: (personId: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const slotRef = useRef<HTMLSpanElement | null>(null)

  function isOverSlot(x: number, y: number) {
    const rect = slotRef.current?.getBoundingClientRect()
    if (!rect) return false
    return (
      x >= rect.left - DROP_PAD &&
      x <= rect.right + DROP_PAD &&
      y >= rect.top - DROP_PAD &&
      y <= rect.bottom + DROP_PAD
    )
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, personId: string) {
    if (event.button !== 0) return
    const tag = event.currentTarget.querySelector<HTMLElement>(`.${styles.tag}`)
    const rect = tag?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const from = { x: event.clientX, y: event.clientY }
    const size = { width: rect.width, height: rect.height }
    setDrag({ personId, x: rect.left, y: rect.top, over: false, ...size })

    function move(moveEvent: PointerEvent) {
      setDrag({
        personId,
        x: moveEvent.clientX - offsetX,
        y: moveEvent.clientY - offsetY,
        over: isOverSlot(moveEvent.clientX, moveEvent.clientY),
        ...size,
      })
    }

    function end(endEvent: PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      const moved =
        Math.abs(endEvent.clientX - from.x) + Math.abs(endEvent.clientY - from.y) > TAP_SLOP
      // 切り欠きの上で離したとき、または運ばずに押しただけのときに差し込む。
      if (!moved || isOverSlot(endEvent.clientX, endEvent.clientY)) fit(personId)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return { drag, slotRef, startDrag }
}

function QuizTray({
  remaining,
  drag,
  onStartDrag,
  onFit,
}: {
  remaining: Person[]
  drag: DragState | null
  onStartDrag: (event: ReactPointerEvent<HTMLButtonElement>, personId: string) => void
  onFit: (personId: string) => void
}) {
  return (
    <div className={styles.tray} role="group" aria-label="手元のしおり">
      {remaining.map((person) => (
        <button
          key={person.id}
          type="button"
          className={`${styles.choice} ${styles.piece} ${
            drag?.personId === person.id ? styles.held : ''
          }`}
          onPointerDown={(event) => onStartDrag(event, person.id)}
          // キーボードから押されたときだけ、ここで差し込む。
          // 指やマウスは pointerup で扱い、二重に置かないようにする。
          onClick={(event) => {
            if (event.detail === 0) onFit(person.id)
          }}
          aria-label={`条件は${person.attributes}。この声のしおりにする`}
        >
          <span className={styles.tag} style={tagStyle(person.id)}>
            <TagFace />
          </span>
          <span className={styles.attributes}>{person.attributes}</span>
        </button>
      ))}
    </div>
  )
}

type QuizSwipe = ReturnType<typeof useNotebookSwipe>

function QuizStage({
  stateIndex,
  letter,
  answers,
  turning,
  showingResults,
  swipe,
  dragOver,
  slotRef,
  bodyOf,
  onTurnFinish,
  onPull,
}: {
  stateIndex: number
  letter: Letter
  answers: Answers
  turning: TurningState | null
  showingResults: boolean
  swipe: QuizSwipe
  dragOver: boolean
  slotRef: React.RefObject<HTMLSpanElement | null>
  bodyOf: (target: Letter) => string | undefined
  onTurnFinish: () => void
  onPull: (letterId: string) => void
}) {
  return (
    <section
      className={styles.stage}
      aria-labelledby="quiz-title"
      onTouchStart={swipe.handleTouchStart}
      onTouchMove={swipe.handleTouchMove}
      onTouchEnd={swipe.handleTouchEnd}
      onTouchCancel={swipe.handleTouchCancel}
    >
      <h1 id="quiz-title" className={styles.srOnly}>
        きょうの3つの手紙。条件のしおりを結ぶ
      </h1>
      <div className={styles.stack} style={notebookBindingStyle}>
        <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
        <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
        <NotebookBinding part="rear" />
        {turning ? <NotebookBinding part="rear" between /> : null}
        {turning ? (
          <NotebookTurn
            key={`${turning.letter.id}-${turning.personId ?? ''}-${stateIndex}`}
            startAngle={turning.startAngle}
            backColor="#e4d9c2"
            direction={turning.direction}
            onFinish={onTurnFinish}
          >
            <Paper className={showingResults ? styles.resultCard : ''}>
              <QuizPaperBody
                target={turning.letter}
                personId={turning.personId}
                interactive={false}
                showingResults={showingResults}
                body={bodyOf(turning.letter)}
                slotRef={slotRef}
                dragOver={dragOver}
                onPull={onPull}
              />
            </Paper>
          </NotebookTurn>
        ) : null}
        <div key={`${letter.id}-${stateIndex}`} className={styles.enter}>
          <Paper className={showingResults ? styles.resultCard : ''} dragX={swipe.dragX}>
            <QuizPaperBody
              target={letter}
              personId={answers[letter.id]}
              interactive
              showingResults={showingResults}
              body={bodyOf(letter)}
              slotRef={slotRef}
              dragOver={dragOver}
              onPull={onPull}
            />
          </Paper>
        </div>
        <NotebookBinding part="front" />
      </div>
    </section>
  )
}

function QuizDragGhost({ drag, dragged }: { drag: DragState | null; dragged: Person | undefined }) {
  if (!drag || !dragged) return null

  return (
    <span
      className={`${styles.tag} ${styles.ghost}`}
      aria-hidden="true"
      style={
        {
          ...tagStyle(dragged.id),
          width: `${drag.width}px`,
          height: `${drag.height}px`,
          transform: `translate(${drag.x}px, ${drag.y}px) rotate(-3deg)`,
        } as CSSProperties
      }
    >
      <TagFace />
    </span>
  )
}

export function QuizPage() {
  const { concerns, quizResult } = useDemoState()
  const quiz = useQuizNavigation(quizResult)
  const { drag, slotRef, startDrag } = useQuizDrag(quiz.fit)
  const swipe = useNotebookSwipe({
    canGoNext: quiz.canGoNext,
    canGoPrevious: quiz.canGoPrev,
    onNext: (startAngle) => quiz.go(1, startAngle),
    onPrevious: () => quiz.go(-1),
  })
  const dragged = personById(drag?.personId)
  const bodyOf = (target: Letter) => concerns.find((concern) => concern.id === target.id)?.body

  return (
    <DemoBoundary
      emptyTitle="今日のクイズはまだありません"
      emptyDescription="新しいクイズが届くまでお待ちください。"
    >
      <div className={styles.page}>
        {/*
          ぜんぶ挟んでも棚は残す。棚ごと消すと版面が跳ね上がり、
          いま差したばかりの紙から目が外れてしまう。空いた棚は「もう手元にない」
          ことをそのまま表す。
        */}
        {!quiz.showingResults ? (
          <QuizTray
            remaining={quiz.remaining}
            drag={drag}
            onStartDrag={startDrag}
            onFit={quiz.fit}
          />
        ) : null}
        <QuizStage
          stateIndex={quiz.state.index}
          letter={quiz.letter}
          answers={quiz.answers}
          turning={quiz.turning}
          showingResults={quiz.showingResults}
          swipe={swipe}
          dragOver={Boolean(drag?.over)}
          slotRef={slotRef}
          bodyOf={bodyOf}
          onTurnFinish={quiz.finishTurn}
          onPull={quiz.pull}
        />

        <QuizActions
          showingResults={quiz.showingResults}
          canGoNext={quiz.canGoNext}
          complete={quiz.complete}
          submitting={quiz.state.step === 'submitting'}
          score={quizResult?.score}
          onNext={() => quiz.go(1)}
          onSubmit={() => void quiz.submit()}
        />

        <QuizDragGhost drag={drag} dragged={dragged} />

        <p className={styles.srOnly} aria-live="polite">
          {quiz.canGoPrev || quiz.canGoNext ? `${quiz.state.index + 1}通目の手紙` : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
