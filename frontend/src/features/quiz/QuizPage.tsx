import {
  useCallback,
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
import { answerDemoQuiz, demoQuiz, useDemoState } from '../demo/demoStore'
import styles from './QuizPage.module.css'

type Person = (typeof demoQuiz.people)[number]
type Letter = (typeof demoQuiz.letters)[number]
type Answers = Record<string, string>

type QuizStep = 'letters' | 'submitting' | 'results'
type QuizState = {
  step: QuizStep
  index: number
  answers: Answers
}
type QuizAction =
  | { type: 'fit'; letterId: string; personId: string }
  | { type: 'pull'; letterId: string }
  | { type: 'go'; direction: 1 | -1 }
  | { type: 'submitStarted' }
  | { type: 'showResults' }

/**
 * しおりの色。人物ごとに固定し、どの紙に挟んでも同じ人だと分かるようにする。
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
    case 'fit': {
      const answers = placeAnswer(state.answers, action.letterId, action.personId)
      const open = firstOpenIndex(answers)
      // 挟んだ紙はめくれ、まだ空いている手紙が現れる。
      return { ...state, answers, index: open === -1 ? state.index : open }
    }
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

/** しおりの面。切り欠きと同じ型紙で描き、落ち影を別の紙片として下に敷く。 */
function TagFace({ person }: { person: Person }) {
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
      <span className={styles.tagLabel}>
        <strong>{person.label}</strong>
        <span>{person.attributes}</span>
      </span>
    </>
  )
}

function tagStyle(personId: string) {
  return { '--piece': PIECE_COLORS[personId] } as CSSProperties
}

/**
 * 紙の一枚。本文と、その下に置くもの（切り欠き、または結果）を受け取る。
 * 右下のめくれた角は、次の手紙があることを示す絵であり、そのまま進むボタンでもある。
 */
function Paper({
  children,
  dragX = 0,
  onNext,
}: {
  children: ReactNode
  dragX?: number
  onNext?: () => void
}) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${turnStyles.page} ${
        dragX !== 0 ? turnStyles.pageDragging : ''
      }`}
      style={{
        transform: dragX < 0 ? `rotateY(${notebookAngleForDrag(dragX)}deg)` : undefined,
      }}
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      {children}
      {/* すぐ下のボタンと同じ操作なので、読み上げには重ねて出さない。 */}
      {onNext ? (
        <button
          type="button"
          className={styles.corner}
          onClick={onNext}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
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
          {/* 結果でも、書いた人のしおりは手紙の上端に貼ったまま見せる。 */}
          <span className={styles.tag} style={tagStyle(writer.id)}>
            <TagFace person={writer} />
          </span>
        </div>
        <p className={styles.letter}>{body}</p>
        <div className={styles.verdict} role="status">
          <p className={styles.judge}>
            {correct ? '合っていました' : `ちがいました。書いたのは${writer.label}`}
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
            className={`${styles.tag} ${styles.fitted}`}
            style={tagStyle(fitted.id)}
            onClick={() => interactive && onPull(target.id)}
            aria-label={`${fitted.label}・${fitted.attributes}。この声から外す`}
          >
            <TagFace person={fitted} />
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
        <p className={styles.ask}>この声は、だれから？</p>
      </div>
      <p className={styles.letter}>{body}</p>
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
              <p className={styles.score}>3つのうち{score}つ、言葉から見つけられました。</p>
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

export function QuizPage() {
  const { concerns, quizResult } = useDemoState()
  const [state, dispatch] = useReducer(quizReducer, initialState)
  /** 指についてくるしおり。運んでいる間だけ描く。 */
  const [drag, setDrag] = useState<{
    personId: string
    x: number
    y: number
    over: boolean
    width: number
    height: number
  } | null>(null)
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<{
    letter: Letter
    personId?: string
    startAngle: number
    direction: 1 | -1
  } | null>(null)
  const slotRef = useRef<HTMLSpanElement | null>(null)

  const letters = demoQuiz.letters
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? quizResult.answers : state.answers
  const bodyOf = (target: Letter) => concerns.find((concern) => concern.id === target.id)?.body
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = demoQuiz.people.filter((person) => !answeredPersonIds.has(person.id))
  const complete = remaining.length === 0
  const canGoNext = state.index < letters.length - 1 && !turning
  const canGoPrev = state.index > 0 && !turning

  const go = useCallback(
    (direction: 1 | -1, startAngle = 0) => {
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
    [answers, letter, letters, state.index, turning],
  )

  const swipe = useNotebookSwipe({
    canGoNext,
    canGoPrevious: canGoPrev,
    onNext: (startAngle) => go(1, startAngle),
    onPrevious: () => go(-1),
  })

  function fit(personId: string) {
    if (showingResults || state.step === 'submitting' || turning || answers[letter.id]) return
    const next = placeAnswer(state.answers, letter.id, personId)
    const open = firstOpenIndex(next)
    // 空いている手紙が別にあるときだけ、この紙はめくれて去る。
    if (open !== -1 && open !== state.index && !prefersReducedMotion()) {
      setTurning({ letter, personId, startAngle: 0, direction: 1 })
    }
    dispatch({ type: 'fit', letterId: letter.id, personId })
  }

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
    const rect = event.currentTarget.getBoundingClientRect()
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

  const submit = async () => {
    dispatch({ type: 'submitStarted' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    answerDemoQuiz(state.answers)
    dispatch({ type: 'showResults' })
  }

  const dragged = personById(drag?.personId)

  return (
    <DemoBoundary
      emptyTitle="今日のクイズはまだありません"
      emptyDescription="新しいクイズが届くまでお待ちください。"
    >
      <div className={styles.page}>
        {!showingResults && !complete ? (
          <div className={styles.tray} role="group" aria-label="手元のしおり">
            {remaining.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`${styles.tag} ${styles.piece} ${
                  drag?.personId === person.id ? styles.held : ''
                }`}
                style={tagStyle(person.id)}
                onPointerDown={(event) => startDrag(event, person.id)}
                // キーボードから押されたときだけ、ここで差し込む。
                // 指やマウスは pointerup で扱い、二重に置かないようにする。
                onClick={(event) => {
                  if (event.detail === 0) fit(person.id)
                }}
                aria-label={`${person.label}・${person.attributes}。この声のしおりにする`}
              >
                <TagFace person={person} />
              </button>
            ))}
          </div>
        ) : null}
        <section
          className={styles.stage}
          aria-labelledby="quiz-title"
          onTouchStart={swipe.handleTouchStart}
          onTouchMove={swipe.handleTouchMove}
          onTouchEnd={swipe.handleTouchEnd}
          onTouchCancel={swipe.handleTouchCancel}
        >
          <h1 id="quiz-title" className={styles.srOnly}>
            きょうの3つの手紙。書いた人のしおりを結ぶ
          </h1>
          <div className={styles.stack} style={notebookBindingStyle}>
            <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
            <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
            <NotebookBinding part="rear" />
            {turning ? <NotebookBinding part="rear" between /> : null}
            {turning ? (
              <NotebookTurn
                key={`${turning.letter.id}-${turning.personId ?? ''}-${state.index}`}
                startAngle={turning.startAngle}
                backColor="#e4d9c2"
                direction={turning.direction}
                onFinish={() => {
                  if (turning.direction === -1) dispatch({ type: 'go', direction: -1 })
                  setTurning(null)
                }}
              >
                <Paper>
                  <QuizPaperBody
                    target={turning.letter}
                    personId={turning.personId}
                    interactive={false}
                    showingResults={showingResults}
                    body={bodyOf(turning.letter)}
                    slotRef={slotRef}
                    dragOver={Boolean(drag?.over)}
                    onPull={(letterId) => dispatch({ type: 'pull', letterId })}
                  />
                </Paper>
              </NotebookTurn>
            ) : null}
            <div key={`${letter.id}-${state.index}`} className={styles.enter}>
              <Paper dragX={swipe.dragX} onNext={canGoNext ? () => go(1) : undefined}>
                <QuizPaperBody
                  target={letter}
                  personId={answers[letter.id]}
                  interactive
                  showingResults={showingResults}
                  body={bodyOf(letter)}
                  slotRef={slotRef}
                  dragOver={Boolean(drag?.over)}
                  onPull={(letterId) => dispatch({ type: 'pull', letterId })}
                />
              </Paper>
            </div>
            <NotebookBinding part="front" />
          </div>
        </section>

        <QuizActions
          showingResults={showingResults}
          canGoNext={canGoNext}
          complete={complete}
          submitting={state.step === 'submitting'}
          score={quizResult?.score}
          onNext={() => go(1)}
          onSubmit={() => void submit()}
        />

        {drag && dragged ? (
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
            <TagFace person={dragged} />
          </span>
        ) : null}

        <p className={styles.srOnly} aria-live="polite">
          {canGoPrev || canGoNext ? `${state.index + 1}通目の手紙` : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
