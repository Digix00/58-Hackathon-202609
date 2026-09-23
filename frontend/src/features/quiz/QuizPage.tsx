import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
import { useStackLift } from '../../shared/hooks/useStackLift'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import { answerDemoQuiz, demoQuiz, useDemoState, type DemoQuizResult } from '../demo/demoStore'
import { CoverArt } from './CoverArt'
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
/**
 * めくっている最中の1枚。
 * 最初の1枚は手紙ではなく表紙なので、めくる相手にも表紙が入る。
 */
type TurningState =
  | { kind: 'cover'; startAngle: number }
  | { kind: 'letter'; letter: Letter; personId?: string; startAngle: number; direction: 1 | -1 }

type QuizStep = 'letters' | 'submitting' | 'results'
type QuizState = {
  step: QuizStep
  index: number
  answers: Answers
  /** 表紙を押し上げている最中か。紙束が上がりきってからめくりはじめる。 */
  coverLifting: boolean
  /** 表紙をめくり終えたか。最初の1枚は手紙ではなく表紙。 */
  coverOpened: boolean
}
type QuizAction =
  | { type: 'coverLifting' }
  | { type: 'coverTurned' }
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
/**
 * 回答済みの人が開いたときは、表紙を挟まない。
 * これから3通を読みはじめる人のための一枚なので、読むものが結果に変わったあとは、
 * 同じ紙が「まだ始まっていない」という誤った合図になる。
 */
function createInitialState(answered: boolean): QuizState {
  return {
    step: 'letters',
    index: 0,
    answers: {},
    coverLifting: false,
    coverOpened: answered,
  }
}

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
    case 'coverLifting':
      // まだ表紙のまま。ふもとの表紙操作が消える準備をして、紙束を上げる。
      return { ...state, coverLifting: true }
    case 'coverTurned':
      // 表紙はここで開く。去っていく表紙だけがめくられて残る。
      return { ...state, coverLifting: false, coverOpened: true }
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

/** しおりの面。切り欠きと同じ型紙で描き、条件をしおりの中に表示する。 */
function TagFace({ label }: { label: string }) {
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
        {label}
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

/**
 * 表紙。
 *
 * 最初の1枚を手紙ではなく表紙にして、読みはじめを「ノートを開く」動作にする。
 * 手紙そのものが読む気持ちを作るという原則は変えないので、ここに置くのは
 * 題字と短い一言、そしてクレヨンの絵だけにする。誰が書いたのか、どんな条件が
 * 出てくるのかを、めくる前に予告するものは置かない。
 */
function QuizCover() {
  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      <CoverArt />
      <p className={styles.coverTitle}>きょうの手紙</p>
      <p className={styles.coverLead}>
        3通、届きました。
        <br />
        書いたのは、どんな人だろう。
      </p>
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
              <TagFace label={writer.attributes} />
            </span>
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
              <TagFace label={fitted.attributes} />
            </span>
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
  coverOpened,
  coverLifting,
  showingResults,
  canGoNext,
  complete,
  submitting,
  score,
  onNext,
  onOpenCover,
  onSubmit,
}: {
  coverOpened: boolean
  /** 表紙を押し上げている最中か。押し上げが始まった時点で、この操作は消える。 */
  coverLifting: boolean
  showingResults: boolean
  canGoNext: boolean
  complete: boolean
  submitting: boolean
  score: number | undefined
  onNext: () => void
  onOpenCover: () => void
  onSubmit: () => void
}) {
  if (!coverOpened) {
    // 表紙の中身は静かに保ち、読みはじめる操作だけを紙の外に置く。
    return (
      <div className={styles.actions}>
        {coverLifting ? null : (
          <button
            type="button"
            className={`${actionStyles.primary} ${styles.nextButton}`}
            onClick={onOpenCover}
          >
            手紙をひらく <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    )
  }

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
  const [state, dispatch] = useReducer(quizReducer, Boolean(quizResult), createInitialState)
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<TurningState | null>(null)

  const letters = demoQuiz.letters
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? quizResult.answers : state.answers
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = demoQuiz.people.filter((person) => !answeredPersonIds.has(person.id))
  const complete = remaining.length === 0
  const canGoNext = state.coverOpened && state.index < letters.length - 1 && !turning
  const canGoPrev = state.coverOpened && state.index > 0 && !turning
  /** 表紙を開きはじめたか。ここから先、ふもとに表紙を開く操作は置かない。 */
  const coverOpening = state.coverLifting || state.coverOpened

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

  const { stackRef, rememberStackPosition } = useStackLift(coverOpening, () => {
    // 紙束が上がりきった。ここでようやく表紙に手をかける。
    if (!state.coverLifting) return
    setTurning({ kind: 'cover', startAngle: 0 })
    dispatch({ type: 'coverTurned' })
  })

  /**
   * 表紙を開く。
   *
   * ボタンから開くときは、まず紙束を押し上げる。表紙を開く操作が消えたぶん、
   * 紙束の置き場所が変わるためで、めくるのはそれが落ち着いてから。
   * 指がもう紙を起こしはじめているなら、その続きとしてそのままめくる。
   * 待たせると、せっかく起こした角度が寝てしまう。
   */
  const openCover = useCallback(
    (startAngle = 0) => {
      if (state.coverOpened) return
      if (prefersReducedMotion()) {
        dispatch({ type: 'coverTurned' })
        return
      }
      if (startAngle !== 0) {
        if (!state.coverLifting) rememberStackPosition()
        setTurning({ kind: 'cover', startAngle })
        dispatch({ type: 'coverTurned' })
        return
      }
      if (state.coverLifting) return
      rememberStackPosition()
      dispatch({ type: 'coverLifting' })
    },
    [rememberStackPosition, state.coverLifting, state.coverOpened],
  )

  const go = useCallback(
    (direction: 1 | -1, startAngle = 0) => {
      cancelSettle()
      if (turning) return
      // 表紙が残っているうちは、めくる相手は手紙ではなく表紙。
      if (!state.coverOpened) {
        if (direction === 1) openCover(startAngle)
        return
      }
      const index = state.index + direction
      if (index < 0 || index >= letters.length) return
      if (prefersReducedMotion()) {
        setTurning(null)
        dispatch({ type: 'go', direction })
        return
      }

      if (direction === 1) {
        // 進むときは、いま見ている紙をめくって下の紙を出す。
        setTurning({
          kind: 'letter',
          letter,
          personId: answers[letter.id],
          startAngle,
          direction: 1,
        })
        dispatch({ type: 'go', direction })
      } else {
        // 戻るときは、伏せていた前の紙を同じ共有アニメーションで拾い上げる。
        const previous = letters[index]
        setTurning({
          kind: 'letter',
          letter: previous,
          personId: answers[previous.id],
          startAngle: 0,
          direction: -1,
        })
      }
    },
    [answers, cancelSettle, letter, letters, openCover, state.coverOpened, state.index, turning],
  )

  function fit(personId: string) {
    if (!state.coverOpened || showingResults || state.step === 'submitting') return
    if (turning || answers[letter.id]) return
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
        setTurning({ kind: 'letter', letter: placed, personId, startAngle: 0, direction: 1 })
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
    if (turning?.kind === 'letter' && turning.direction === -1) {
      dispatch({ type: 'go', direction: -1 })
    }
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
    coverOpening,
    stackRef,
    turning,
    go,
    openCover,
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
            <TagFace label={person.attributes} />
          </span>
        </button>
      ))}
    </div>
  )
}

/** 表紙の裏。手紙の紙とは違う色を当て、いま開いたのが表紙だと分かるようにする。 */
const COVER_BACK_COLOR = '#c2a98b'

/** 手紙の裏。どの紙も同じ色にして、裏面が回答を示さないようにする。 */
const PAGE_BACK_COLOR = '#e4d9c2'

/** めくり終えた紙をリング左側に残すときの、文字のない裏面。 */
const TURNED_BACK_COLOR = 'var(--color-surface)'

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: TurningState, index: number) {
  return turning.kind === 'cover'
    ? 'cover'
    : `${turning.letter.id}-${turning.personId ?? ''}-${index}`
}

type QuizSwipe = ReturnType<typeof useNotebookSwipe>

function QuizStage({
  stateIndex,
  letter,
  answers,
  turning,
  showingResults,
  coverOpened,
  coverOpening,
  stackRef,
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
  coverOpened: boolean
  coverOpening: boolean
  stackRef: RefObject<HTMLDivElement | null>
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
      <div
        ref={stackRef}
        className={`${styles.stack} ${!coverOpened ? styles.stackCover : ''} ${
          coverOpening ? styles.stackOpening : ''
        }`}
        style={notebookBindingStyle}
      >
        <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
        <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
        <NotebookBinding part="rear" />
        {/* めくり終えた表紙は捨てず、最終フレームの姿勢のままリング左側に残す。 */}
        {coverOpened ? (
          <div className={turnStyles.turned} aria-hidden="true">
            <div
              className={`${turnStyles.back} ${crayonStyles.edge}`}
              style={{ '--turn-back-color': TURNED_BACK_COLOR } as CSSProperties}
            >
              <NotebookBinding part="holes" back />
            </div>
          </div>
        ) : null}
        {turning ? (
          <NotebookBinding key={turningKey(turning, stateIndex)} part="rear" between />
        ) : null}
        {turning ? (
          <NotebookTurn
            key={turningKey(turning, stateIndex)}
            variant={turning.kind === 'cover' ? 'cover' : 'page'}
            startAngle={turning.startAngle}
            backColor={turning.kind === 'cover' ? COVER_BACK_COLOR : PAGE_BACK_COLOR}
            direction={turning.kind === 'cover' ? 1 : turning.direction}
            onFinish={onTurnFinish}
          >
            {turning.kind === 'cover' ? (
              <QuizCover />
            ) : (
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
            )}
          </NotebookTurn>
        ) : null}
        {/*
         * 表紙が開くまでは、表紙が一番上の紙。1通目の手紙はその下に控えている。
         * 控えている紙は、表紙が開くまで読ませない。切り欠きも息をさせない。
         */}
        {coverOpened ? (
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
        ) : (
          <>
            <div className={`${styles.enter} ${styles.coverUnderlay}`} aria-hidden="true">
              <Paper>
                <QuizPaperBody
                  target={letter}
                  personId={undefined}
                  interactive={false}
                  showingResults={false}
                  body={bodyOf(letter)}
                  slotRef={slotRef}
                  dragOver={false}
                  onPull={onPull}
                />
              </Paper>
            </div>
            <div className={styles.coverLayer}>
              <QuizCover />
            </div>
          </>
        )}
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
      <TagFace label={dragged.attributes} />
    </span>
  )
}

export function QuizPage() {
  const { concerns, quizResult } = useDemoState()
  const quiz = useQuizNavigation(quizResult)
  const { drag, slotRef, startDrag } = useQuizDrag(quiz.fit)
  const swipe = useNotebookSwipe({
    // 表紙が残っているうちは、左へ払う先が手紙ではなく表紙になる。
    canGoNext: !quiz.state.coverOpened || quiz.canGoNext,
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
        {!quiz.showingResults && quiz.state.coverOpened ? (
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
          coverOpened={quiz.state.coverOpened}
          coverOpening={quiz.coverOpening}
          stackRef={quiz.stackRef}
          swipe={swipe}
          dragOver={Boolean(drag?.over)}
          slotRef={slotRef}
          bodyOf={bodyOf}
          onTurnFinish={quiz.finishTurn}
          onPull={quiz.pull}
        />

        <QuizActions
          coverOpened={quiz.state.coverOpened}
          coverLifting={quiz.state.coverLifting}
          showingResults={quiz.showingResults}
          canGoNext={quiz.canGoNext}
          complete={quiz.complete}
          submitting={quiz.state.step === 'submitting'}
          score={quizResult?.score}
          onNext={() => quiz.go(1)}
          onOpenCover={() => quiz.openCover()}
          onSubmit={() => void quiz.submit()}
        />

        <QuizDragGhost drag={drag} dragged={dragged} />

        <p className={styles.srOnly} aria-live="polite">
          {quiz.state.coverOpened && (quiz.canGoPrev || quiz.canGoNext)
            ? `${quiz.state.index + 1}通目の手紙`
            : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
