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
 * 表紙は開くとき（1）だけでなく、読み終えて閉じるとき（-1）にも動く。
 */
type TurningState =
  | { kind: 'cover'; startAngle: number; direction: 1 | -1 }
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
  /**
   * 3通ぜんぶに挟み終えて、ノートを閉じたか。
   * 閉じたあとは、表紙の上に出た付箋だけが手がかりになる。
   */
  closed: boolean
}
type QuizAction =
  | { type: 'coverLifting' }
  | { type: 'coverTurned' }
  | { type: 'close' }
  | { type: 'reopen'; index: number }
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
    closed: false,
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
    case 'close':
      /*
       * 3通ぜんぶに挟み終えた。読み終えたノートとして閉じる。
       * 閉じても回答はそのままなので、表紙の上に出た付箋が控えの役をする。
       */
      return { ...state, coverOpened: false, closed: true }
    case 'reopen':
      // 付箋から開き直す。押された付箋の手紙をそのまま開く。
      return { ...state, coverOpened: true, closed: false, index: action.index }
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
      // 結果は1通目から読む。閉じていたなら、ここで開いたままにする。
      return { ...state, step: 'results', index: 0, coverOpened: true, closed: false }
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
 * 付箋の持ち場。紙の幅を通の数で割り、手紙ごとに違う場所へ置く。
 *
 * どの紙でも同じ位置に挟むと、閉じたノートでは3枚が1枚に重なり、
 * どれがどの手紙の付箋なのかが分からなくなる。挟む場所そのものを
 * 「何通目か」にしておけば、閉じたあとも並びがそのまま目次になる。
 */
function tabSlotStyle(slot: number) {
  return {
    '--tab-count': demoQuiz.letters.length,
    '--tab-slot': slot + 1,
  } as CSSProperties
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
function QuizCover({ answered = false }: { answered?: boolean }) {
  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      {/*
        読み終えて閉じたノートからは、飛んできた紙飛行機を降ろす。
        届いたことを告げる絵なので、読み終えたあとも飛んでいると、
        まだ次が届くという誤った合図になる。上辺も付箋に明け渡す。
      */}
      <CoverArt arrived={!answered} />
      <p className={styles.coverTitle}>きょうの手紙</p>
      {answered ? (
        <p className={styles.coverLead}>
          3通ぜんぶに、しおりを挟みました。
          <br />
          付箋を押すと、その手紙へ戻れます。
        </p>
      ) : (
        <p className={styles.coverLead}>
          3通、届きました。
          <br />
          書いたのは、どんな人だろう。
        </p>
      )}
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
  /** この手紙の付箋の持ち場。結果でも同じ場所に残す。 */
  const slot = demoQuiz.letters.findIndex((letter) => letter.id === target.id)

  if (showingResults && writer) {
    const correct = personId === target.correctPerson
    return (
      <>
        <div className={styles.fit}>
          {/* 結果でも、書き手の条件を、この手紙の持ち場に残す。 */}
          <div className={styles.tabRow} style={tabSlotStyle(slot)}>
            <span className={styles.choice}>
              <span className={styles.tag} style={tagStyle(writer.id)}>
                <TagFace label={writer.attributes} />
              </span>
            </span>
          </div>
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
        <div className={styles.tabRow} style={tabSlotStyle(slot)}>
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
        </div>
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
  closed,
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
  /** 読み終えて閉じたか。閉じたノートには、もう一度開く操作を置かない。 */
  closed: boolean
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
  if (!coverOpened && !closed) {
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

/**
 * Intent: クイズの回答状態と、そこから導ける表示状態を局所化する。
 * Boundary: 初期結果を受け取り、状態・表示用の値・reducer dispatchだけを返す。
 * State modeling: 依存する状態遷移をquizReducerに集約し、無効な組み合わせを画面側で作らない。
 */
function useQuizState(quizResult: DemoQuizResult | null) {
  const [state, dispatch] = useReducer(quizReducer, Boolean(quizResult), createInitialState)
  const letters = demoQuiz.letters
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? quizResult.answers : state.answers
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = demoQuiz.people.filter((person) => !answeredPersonIds.has(person.id))
  const complete = remaining.length === 0

  return { state, dispatch, letters, letter, answers, remaining, complete, showingResults }
}

/**
 * Intent: 紙送りのアニメーションと、回答後に次の紙へ移る待ち時間を局所化する。
 * Boundary: 表紙の状態を受け取り、紙束参照・紙送り操作・settle待ち操作だけを返す。
 * Hidden complexity: アニメーション中の紙とsettle timerを同時に一つだけ保持し、unmount時に待ち時間を破棄する。
 */
function useQuizAnimation(coverOpening: boolean, coverLifting: boolean, onCoverLifted: () => void) {
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<TurningState | null>(null)

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

  const beginTurn = useCallback((next: TurningState) => setTurning(next), [])
  const clearTurning = useCallback(() => setTurning(null), [])

  const scheduleSettle = useCallback(
    (onSettled: () => void) => {
      cancelSettle()
      settle.current = window.setTimeout(() => {
        settle.current = null
        onSettled()
      }, SETTLE_MS)
    },
    [cancelSettle],
  )

  const handleCoverLifted = useCallback(() => {
    // 紙束が上がりきった。ここでようやく表紙に手をかける。
    if (!coverLifting) return
    beginTurn({ kind: 'cover', startAngle: 0, direction: 1 })
    onCoverLifted()
  }, [beginTurn, coverLifting, onCoverLifted])

  const { stackRef, rememberStackPosition } = useStackLift(coverOpening, handleCoverLifted)

  return {
    turning,
    stackRef,
    rememberStackPosition,
    beginTurn,
    clearTurning,
    cancelSettle,
    scheduleSettle,
  }
}

function useQuizNavigation(quizResult: DemoQuizResult | null) {
  const { state, dispatch, letters, letter, answers, remaining, complete, showingResults } =
    useQuizState(quizResult)
  /** 表紙を開きはじめたか。ここから先、ふもとに表紙を開く操作は置かない。 */
  const coverOpening = state.coverLifting || state.coverOpened
  const onCoverLifted = useCallback(() => dispatch({ type: 'coverTurned' }), [dispatch])
  const animation = useQuizAnimation(coverOpening, state.coverLifting, onCoverLifted)
  const {
    turning,
    stackRef,
    rememberStackPosition,
    beginTurn,
    clearTurning,
    cancelSettle,
    scheduleSettle,
  } = animation
  const canGoNext = state.coverOpened && state.index < letters.length - 1 && !turning
  const canGoPrev = state.coverOpened && state.index > 0 && !turning

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
        beginTurn({ kind: 'cover', startAngle, direction: 1 })
        dispatch({ type: 'coverTurned' })
        return
      }
      if (state.coverLifting) return
      rememberStackPosition()
      dispatch({ type: 'coverLifting' })
    },
    [beginTurn, dispatch, rememberStackPosition, state.coverLifting, state.coverOpened],
  )

  /**
   * 閉じたノートを、その付箋の手紙で開き直す。
   *
   * 出す前ならいつでも挟み替えられるので、確かめるのも選び直すのも、
   * 付箋を押すというひとつの操作から始める。
   */
  const reopen = useCallback(
    (index: number, startAngle = 0) => {
      if (!state.closed || turning) return
      if (prefersReducedMotion()) {
        dispatch({ type: 'reopen', index })
        return
      }
      beginTurn({ kind: 'cover', startAngle, direction: 1 })
      dispatch({ type: 'reopen', index })
    },
    [beginTurn, dispatch, state.closed, turning],
  )

  const go = useCallback(
    (direction: 1 | -1, startAngle = 0) => {
      cancelSettle()
      if (turning) return
      // 表紙が残っているうちは、めくる相手は手紙ではなく表紙。
      if (!state.coverOpened) {
        if (direction !== 1) return
        // 閉じたノートは、最後に見ていた手紙から開く。
        if (state.closed) reopen(state.index, startAngle)
        else openCover(startAngle)
        return
      }
      const index = state.index + direction
      if (index < 0 || index >= letters.length) return
      if (prefersReducedMotion()) {
        clearTurning()
        dispatch({ type: 'go', direction })
        return
      }

      if (direction === 1) {
        // 進むときは、いま見ている紙をめくって下の紙を出す。
        beginTurn({
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
        beginTurn({
          kind: 'letter',
          letter: previous,
          personId: answers[previous.id],
          startAngle: 0,
          direction: -1,
        })
      }
    },
    [
      answers,
      beginTurn,
      cancelSettle,
      clearTurning,
      dispatch,
      letter,
      letters,
      openCover,
      reopen,
      state.closed,
      state.coverOpened,
      state.index,
      turning,
    ],
  )

  function fit(personId: string) {
    if (!state.coverOpened || showingResults || state.step === 'submitting') return
    if (turning || answers[letter.id]) return
    const next = placeAnswer(state.answers, letter.id, personId)
    const open = firstOpenIndex(next)
    const placed = letter
    dispatch({ type: 'fit', letterId: letter.id, personId })
    if (open === state.index) return

    cancelSettle()
    /*
     * すぐにはめくらない。挟まったしおりを一拍だけ見せる。
     * その間に「ちがった」と気づいたら、しおりを押せば手元へ戻り、
     * 紙もその場に留まる（cancelSettle）。
     */
    scheduleSettle(() => {
      if (open === -1) {
        /*
         * 空いている手紙はもうない。読み終えたノートとして閉じる。
         * 閉じた表紙には挟んだ付箋だけが出るので、見直す先はそこから選ぶ。
         */
        if (prefersReducedMotion()) dispatch({ type: 'close' })
        else beginTurn({ kind: 'cover', startAngle: 0, direction: -1 })
        return
      }
      if (!prefersReducedMotion()) {
        beginTurn({ kind: 'letter', letter: placed, personId, startAngle: 0, direction: 1 })
      }
      dispatch({ type: 'openLetter', index: open })
    })
  }

  const submit = async () => {
    dispatch({ type: 'submitStarted' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    answerDemoQuiz(state.answers)
    if (state.closed && !prefersReducedMotion()) {
      beginTurn({ kind: 'cover', startAngle: 0, direction: 1 })
    }
    dispatch({ type: 'showResults' })
  }

  const finishTurn = useCallback(() => {
    if (turning?.kind === 'letter' && turning.direction === -1) {
      dispatch({ type: 'go', direction: -1 })
    }
    // 表紙が戻りきってから閉じる。先に閉じると、めくる表紙が二重に見える。
    if (turning?.kind === 'cover' && turning.direction === -1) {
      dispatch({ type: 'close' })
    }
    clearTurning()
  }, [clearTurning, dispatch, turning])

  const pull = useCallback(
    (letterId: string) => {
      // 抜いたなら、めくるのはやめる。選び直す紙が目の前から消えてしまう。
      cancelSettle()
      dispatch({ type: 'pull', letterId })
    },
    [cancelSettle, dispatch],
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
    reopen,
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
    ? `cover-${turning.direction}-${index}`
    : `${turning.letter.id}-${turning.personId ?? ''}-${index}`
}

/**
 * 閉じたノートの上に出ている付箋。
 *
 * 挟んだときと同じ持ち場に、同じ高さで並ぶ。場所が変わらないので、
 * 表紙の上の1枚が、さっき自分がその手紙に挟んだ1枚だと分かる。
 * 押せばその手紙が開き、確かめるのも挟み替えるのも、そこから続けられる。
 */
function QuizTabs({ answers, onReopen }: { answers: Answers; onReopen: (index: number) => void }) {
  return (
    <div className={`${styles.tabRow} ${styles.tabs}`} style={tabSlotStyle(0)}>
      {demoQuiz.letters.map((target, index) => {
        const fitted = personById(answers[target.id])
        if (!fitted) return null
        return (
          <button
            key={target.id}
            type="button"
            className={`${styles.choice} ${styles.tab}`}
            style={{ '--tab-slot': index + 1 } as CSSProperties}
            onClick={() => onReopen(index)}
            aria-label={`${index + 1}通目の手紙。条件は${fitted.attributes}。開いて見直す`}
          >
            <span className={styles.tag} style={tagStyle(fitted.id)}>
              <TagFace label={fitted.attributes} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

type QuizSwipe = ReturnType<typeof useNotebookSwipe>

function QuizTurnedCover({ coverOpened }: { coverOpened: boolean }) {
  if (!coverOpened) return null

  return (
    <div className={turnStyles.turned} aria-hidden="true">
      <div
        className={`${turnStyles.back} ${crayonStyles.edge}`}
        style={{ '--turn-back-color': TURNED_BACK_COLOR } as CSSProperties}
      >
        <NotebookBinding part="holes" back />
      </div>
    </div>
  )
}

function QuizTurnLayer({
  turning,
  stateIndex,
  showingResults,
  answeredCover,
  slotRef,
  dragOver,
  bodyOf,
  onTurnFinish,
  onPull,
}: {
  turning: TurningState | null
  stateIndex: number
  showingResults: boolean
  /** 表紙に描くのが、読み終えたあとの一枚か。 */
  answeredCover: boolean
  slotRef: React.RefObject<HTMLSpanElement | null>
  dragOver: boolean
  bodyOf: (target: Letter) => string | undefined
  onTurnFinish: () => void
  onPull: (letterId: string) => void
}) {
  if (!turning) return null

  const key = turningKey(turning, stateIndex)
  const isCover = turning.kind === 'cover'

  return (
    <>
      <NotebookBinding key={key} part="rear" between />
      <NotebookTurn
        key={key}
        variant={isCover ? 'cover' : 'page'}
        startAngle={turning.startAngle}
        backColor={isCover ? COVER_BACK_COLOR : PAGE_BACK_COLOR}
        direction={turning.direction}
        onFinish={onTurnFinish}
      >
        {isCover ? (
          <QuizCover answered={answeredCover} />
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
    </>
  )
}

function QuizFrontPage({
  coverOpened,
  closed,
  letter,
  answers,
  stateIndex,
  showingResults,
  swipe,
  slotRef,
  dragOver,
  bodyOf,
  onPull,
  onReopen,
}: {
  coverOpened: boolean
  /** 読み終えて閉じたか。表紙の上には、挟んだ付箋だけが出る。 */
  closed: boolean
  letter: Letter
  answers: Answers
  stateIndex: number
  showingResults: boolean
  swipe: QuizSwipe
  slotRef: React.RefObject<HTMLSpanElement | null>
  dragOver: boolean
  bodyOf: (target: Letter) => string | undefined
  onPull: (letterId: string) => void
  onReopen: (index: number) => void
}) {
  if (coverOpened) {
    return (
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
    )
  }

  return (
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
        <QuizCover answered={closed} />
      </div>
      {closed ? <QuizTabs answers={answers} onReopen={onReopen} /> : null}
    </>
  )
}

function QuizStage({
  stateIndex,
  letter,
  answers,
  turning,
  showingResults,
  coverOpened,
  coverOpening,
  closed,
  complete,
  stackRef,
  swipe,
  dragOver,
  slotRef,
  bodyOf,
  onTurnFinish,
  onPull,
  onReopen,
}: {
  stateIndex: number
  letter: Letter
  answers: Answers
  turning: TurningState | null
  showingResults: boolean
  coverOpened: boolean
  coverOpening: boolean
  /** 読み終えて閉じたか。表紙の上には、挟んだ付箋だけが出る。 */
  closed: boolean
  /** 3通ぜんぶに挟み終えたか。表紙の絵と一言は、ここで読み終えたものに変わる。 */
  complete: boolean
  stackRef: RefObject<HTMLDivElement | null>
  swipe: QuizSwipe
  dragOver: boolean
  slotRef: React.RefObject<HTMLSpanElement | null>
  bodyOf: (target: Letter) => string | undefined
  onTurnFinish: () => void
  onPull: (letterId: string) => void
  onReopen: (index: number) => void
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
      {/*
        小さく置くのは、まだ読みはじめていない表紙だけにする。
        読み終えて閉じたノートには付箋が並ぶので、そこで縮めると条件の字が読めない。
      */}
      <div
        ref={stackRef}
        className={`${styles.stack} ${!coverOpened && !closed ? styles.stackCover : ''} ${
          coverOpening ? styles.stackOpening : ''
        }`}
        style={notebookBindingStyle}
      >
        <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
        <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
        <NotebookBinding part="rear" />
        {/* めくり終えた表紙は捨てず、最終フレームの姿勢のままリング左側に残す。 */}
        <QuizTurnedCover coverOpened={coverOpened} />
        <QuizTurnLayer
          turning={turning}
          stateIndex={stateIndex}
          showingResults={showingResults}
          answeredCover={complete}
          slotRef={slotRef}
          dragOver={dragOver}
          bodyOf={bodyOf}
          onTurnFinish={onTurnFinish}
          onPull={onPull}
        />
        {/*
         * 表紙が開くまでは、表紙が一番上の紙。1通目の手紙はその下に控えている。
         * 控えている紙は、表紙が開くまで読ませない。切り欠きも息をさせない。
         */}
        <QuizFrontPage
          coverOpened={coverOpened}
          closed={closed}
          letter={letter}
          answers={answers}
          stateIndex={stateIndex}
          showingResults={showingResults}
          swipe={swipe}
          slotRef={slotRef}
          dragOver={dragOver}
          bodyOf={bodyOf}
          onPull={onPull}
          onReopen={onReopen}
        />
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
        {!quiz.showingResults && (quiz.state.coverOpened || quiz.state.closed) ? (
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
          closed={quiz.state.closed}
          complete={quiz.complete}
          stackRef={quiz.stackRef}
          swipe={swipe}
          dragOver={Boolean(drag?.over)}
          slotRef={slotRef}
          bodyOf={bodyOf}
          onTurnFinish={quiz.finishTurn}
          onPull={quiz.pull}
          onReopen={(index) => quiz.reopen(index)}
        />

        <QuizActions
          coverOpened={quiz.state.coverOpened}
          closed={quiz.state.closed}
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
          {quiz.state.closed
            ? '3通ぜんぶに、しおりを挟みました。ノートを閉じました。付箋を押すと、その手紙へ戻れます'
            : quiz.state.coverOpened && (quiz.canGoPrev || quiz.canGoNext)
              ? `${quiz.state.index + 1}通目の手紙`
              : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
