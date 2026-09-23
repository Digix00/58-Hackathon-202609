import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { Link } from 'react-router'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { answerDemoQuiz, demoQuiz, useDemoState } from '../demo/demoStore'
import styles from './QuizPage.module.css'

type Person = (typeof demoQuiz.people)[number]
type Letter = (typeof demoQuiz.letters)[number]
type Answers = Record<string, string>

type QuizStep = 'letters' | 'submitting' | 'results'
type QuizState = {
  step: QuizStep
  index: number
  /** 直前の移動の向き。戻ったときだけ、紙が綴じ側から降りてくる。 */
  direction: 1 | -1
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
const TAG_PATH = 'M3 3 H97 V75 L50 63 L3 75 Z'
/** とじリングの本数。紙の高さに合わせて等間隔に置く。 */
const RING_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7]
/** 切り欠きの外でも、これだけ近ければ差し込んだことにする。 */
const DROP_PAD = 22
/** つまんで運んだとみなす距離。これ未満なら、押しただけとして扱う。 */
const TAP_SLOP = 8
/** 指を離したときに次の手紙へ送る距離。これ未満なら手元へ戻す。 */
const SWIPE_THRESHOLD = 56
/** 縦スクロールか横めくりかを決めるまでの遊び。 */
const SWIPE_SLOP = 8

const initialState: QuizState = { step: 'letters', index: 0, direction: 1, answers: {} }

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
    case 'fit': {
      const answers = placeAnswer(state.answers, action.letterId, action.personId)
      const open = firstOpenIndex(answers)
      // 挟んだ紙はめくれ、まだ空いている手紙が現れる。
      return { ...state, answers, direction: 1, index: open === -1 ? state.index : open }
    }
    case 'pull': {
      const answers = { ...state.answers }
      delete answers[action.letterId]
      return { ...state, answers }
    }
    case 'go': {
      const index = state.index + action.direction
      if (index < 0 || index >= demoQuiz.letters.length) return state
      return { ...state, index, direction: action.direction }
    }
    case 'submitStarted':
      return { ...state, step: 'submitting' }
    case 'showResults':
      return { ...state, step: 'results', index: 0, direction: 1 }
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
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${
        dragX !== 0 ? styles.dragging : ''
      }`}
      style={{ transform: `translateX(${dragX * 0.72}px) rotate(${dragX * 0.016}deg)` }}
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <span className={styles.holes} aria-hidden="true">
        {RING_SLOTS.map((slot) => (
          <span key={slot} className={styles.hole} />
        ))}
      </span>
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

export function QuizPage() {
  const { concerns, quizResult } = useDemoState()
  const [state, dispatch] = useReducer(quizReducer, initialState)
  const [dragX, setDragX] = useState(0)
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
  const [turning, setTurning] = useState<{ letter: Letter; personId?: string } | null>(null)
  const slotRef = useRef<HTMLSpanElement | null>(null)
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)

  const letters = demoQuiz.letters
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? quizResult.answers : state.answers
  const bodyOf = (target: Letter) => concerns.find((concern) => concern.id === target.id)?.body
  const remaining = demoQuiz.people.filter((person) => !Object.values(answers).includes(person.id))
  const complete = remaining.length === 0
  const canGoNext = state.index < letters.length - 1
  const canGoPrev = state.index > 0

  const go = useCallback(
    (direction: 1 | -1) => {
      const index = state.index + direction
      if (index < 0 || index >= letters.length) return
      // 進むときは、いま見ている紙がめくれて去る。戻るときに去る紙はない。
      setTurning(
        direction === 1 && !prefersReducedMotion()
          ? { letter, personId: answers[letter.id] }
          : null,
      )
      dispatch({ type: 'go', direction })
    },
    [answers, letter, letters.length, state.index],
  )

  // 指と同じ感覚で、キーボードからも前後へ送れるようにする。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go])

  function fit(personId: string) {
    if (showingResults || state.step === 'submitting' || answers[letter.id]) return
    const next = placeAnswer(state.answers, letter.id, personId)
    const open = firstOpenIndex(next)
    // 空いている手紙が別にあるときだけ、この紙はめくれて去る。
    if (open !== -1 && open !== state.index && !prefersReducedMotion()) {
      setTurning({ letter, personId })
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

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    swipe.current = { x: touch.clientX, y: touch.clientY, active: false }
  }

  function handleTouchMove(event: TouchEvent) {
    const start = swipe.current
    if (!start) return
    const touch = event.touches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!start.active) {
      if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return
      // 縦に動かし始めたなら、それはスクロール。横めくりには使わない。
      if (Math.abs(dy) >= Math.abs(dx)) {
        swipe.current = null
        return
      }
      start.active = true
    }
    setDragX(dx)
  }

  function handleTouchEnd() {
    const start = swipe.current
    const dx = dragX
    swipe.current = null
    setDragX(0)
    if (!start?.active) return
    if (dx <= -SWIPE_THRESHOLD) go(1)
    else if (dx >= SWIPE_THRESHOLD) go(-1)
  }

  const submit = async () => {
    dispatch({ type: 'submitStarted' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    answerDemoQuiz(state.answers)
    dispatch({ type: 'showResults' })
  }

  function paperBody(target: Letter, personId: string | undefined, interactive: boolean) {
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
          <p className={styles.letter}>{bodyOf(target)}</p>
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
              onClick={() => interactive && dispatch({ type: 'pull', letterId: target.id })}
              aria-label={`${fitted.label}・${fitted.attributes}。この声から外す`}
            >
              <TagFace person={fitted} />
            </button>
          ) : (
            <span
              ref={interactive ? slotRef : undefined}
              className={`${styles.tag} ${styles.slot} ${drag?.over ? styles.over : ''}`}
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
        <p className={styles.letter}>{bodyOf(target)}</p>
      </>
    )
  }

  const dragged = personById(drag?.personId)

  return (
    <DemoBoundary
      emptyTitle="今日のクイズはまだありません"
      emptyDescription="新しいクイズが届くまでお待ちください。"
    >
      <div className={styles.page}>
        <section
          className={styles.stage}
          aria-labelledby="quiz-title"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <h1 id="quiz-title" className={styles.srOnly}>
            きょうの3つの手紙。書いた人のしおりを結ぶ
          </h1>
          <div className={styles.stack}>
            <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
            <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
            {/* とじリング。紙ではなくバインダー側にあるので、めくっても動かない。 */}
            <span className={styles.rings} aria-hidden="true">
              {RING_SLOTS.map((slot) => (
                <span key={slot} className={styles.ring} />
              ))}
            </span>
            {turning ? (
              <div
                key={`${turning.letter.id}-${turning.personId ?? ''}-${state.index}`}
                className={styles.turning}
                aria-hidden="true"
                // 影の animationend も上がってくるので、紙そのものの終わりだけを見る。
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget) setTurning(null)
                }}
              >
                <div className={styles.face}>
                  <Paper>{paperBody(turning.letter, turning.personId, false)}</Paper>
                </div>
                <div className={`${styles.back} ${crayonStyles.edge}`} />
              </div>
            ) : null}
            <div
              key={`${letter.id}-${state.index}`}
              className={`${styles.enter} ${state.direction < 0 ? styles.fromLeft : ''}`}
            >
              <Paper dragX={dragX} onNext={canGoNext ? () => go(1) : undefined}>
                {paperBody(letter, answers[letter.id], true)}
              </Paper>
            </div>
          </div>
        </section>

        <div className={styles.actions}>
          {showingResults ? (
            canGoNext ? (
              <button
                type="button"
                className={`${actionStyles.primary} ${styles.nextButton}`}
                onClick={() => go(1)}
              >
                つぎの手紙へ <span aria-hidden="true">→</span>
              </button>
            ) : (
              <>
                {quizResult ? (
                  <p className={styles.score}>
                    3つのうち{quizResult.score}つ、言葉から見つけられました。
                  </p>
                ) : null}
                <Link className={actionStyles.primary} to="/history">
                  履歴を見る
                </Link>
              </>
            )
          ) : complete ? (
            <button
              type="button"
              className={`${actionStyles.primary} ${styles.nextButton}`}
              onClick={() => void submit()}
              disabled={state.step === 'submitting'}
            >
              {state.step === 'submitting' ? '出しています…' : 'これで出す'}
            </button>
          ) : (
            <div className={styles.tray}>
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
          )}
        </div>

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
