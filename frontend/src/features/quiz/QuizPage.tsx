import { useTranslation } from '../../i18n/useTranslation'
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  createContext,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router'
import { ProtectedRoute } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { useAuth } from '../../auth/useAuth'
import { EmptyState, ErrorState } from '../../shared/components/AsyncStates'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { NotebookStack } from '../../shared/components/NotebookStack'
import { prefersReducedMotion, useNotebookSwipe } from '../../shared/hooks/useNotebookSwipe'
import { useStackLift } from '../../shared/hooks/useStackLift'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import {
  useDisplaySettings,
  type DisplayLanguage,
} from '../../app/providers/DisplaySettingsContext'
import { ageGroupLabel, genderLabel, regionLabel } from '../../shared/concernPresentation'
import type { QuizAnswerResponse, TodayQuizResponse } from '../../lib/api'
import { CoverArt } from './CoverArt'
import { answerQuiz, getQuizById, getTodayQuiz, type QuizMatch } from './quizApi'
import styles from './QuizPage.module.css'
import { translate } from '../../i18n/translate'
import { messages } from '../../i18n/messages'
import { TranslationNotice } from '../../shared/components/TranslationNotice'

type Letter = { id: string; body: string; language: DisplayLanguage }
type QuizParticipant = {
  id: string
  sourceAttributes: TodayQuizResponse['participants'][number]['attributes']
  color: string
}
type Person = QuizParticipant & { attributes: string }
type QuizPageModel = {
  id: string
  people: QuizParticipant[]
  letters: Letter[]
  answerResult?: QuizAnswerResponse
}
type Answers = Record<string, string>
type QuizModelContext = Omit<QuizPageModel, 'people'> & { people: Person[] }

const QuizContext = createContext<QuizPageModel | null>(null)

function useQuizData(): QuizModelContext {
  const value = useContext(QuizContext)
  const { language } = useDisplaySettings()

  return useMemo(() => {
    if (!value) throw new Error('QuizContext is not available')

    return {
      ...value,
      people: value.people.map((person) => ({
        ...person,
        attributes: formatAttributes(person.sourceAttributes, language),
      })),
    }
  }, [language, value])
}

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
  | {
      kind: 'letter'
      letter: Letter
      personId?: string
      startAngle: number
      direction: 1 | -1
      /** 戻すめくりの行き先。付箋から前の手紙へ跳ぶときだけ入る。 */
      toIndex?: number
    }

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
  | { type: 'go'; direction: 1 | -1; count: number }
  | { type: 'submitStarted' }
  | { type: 'submitFailed' }
  | { type: 'showResults' }

/**
 * しおりの色。条件ごとに固定し、どの紙に挟んでも同じ選択肢だと分かるようにする。
 * 正誤を示す色ではないので、回答の前後で変えない。
 */
const PIECE_COLORS = ['#f9e7ac', '#cde5dc', '#e3dafa'] as const
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

function personById(id: string | undefined, people: Person[]) {
  return people.find((person) => person.id === id)
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
function firstOpenIndex(answers: Answers, letters: Letter[]) {
  return letters.findIndex((letter) => !answers[letter.id])
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
      if (index < 0 || index >= action.count) return state
      return { ...state, index }
    }
    case 'submitStarted':
      return { ...state, step: 'submitting' }
    case 'submitFailed':
      return { ...state, step: 'letters' }
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

function tagStyle(person: Person) {
  return { '--piece': person.color } as CSSProperties
}

/**
 * 付箋の持ち場。紙の幅を通の数で割り、手紙ごとに違う場所へ置く。
 *
 * どの紙でも同じ位置に挟むと、閉じたノートでは3枚が1枚に重なり、
 * どれがどの手紙の付箋なのかが分からなくなる。挟む場所そのものを
 * 「何通目か」にしておけば、閉じたあとも並びがそのまま目次になる。
 */
function tabSlotStyle(slot: number, count: number) {
  return {
    '--tab-count': count,
    '--tab-slot': slot + 1,
  } as CSSProperties
}

function formatAttributes(
  attributes: TodayQuizResponse['participants'][number]['attributes'],
  language: DisplayLanguage,
) {
  const { ageGroup, gender, regionCode } = attributes
  const region =
    regionCode === 'no_answer'
      ? translate(language, 'common.noAnswer')
      : regionLabel(regionCode, language)
  return [ageGroupLabel(ageGroup, language), genderLabel(gender, language), region]
    .filter((label): label is string => Boolean(label))
    .join(language === 'en' ? ' · ' : '・')
}

function toQuizPageModel(quiz: TodayQuizResponse): QuizPageModel {
  const people = [...quiz.participants]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((participant, index) => ({
      id: participant.participantId,
      sourceAttributes: participant.attributes,
      color: PIECE_COLORS[index % PIECE_COLORS.length],
    }))
  const letters = [...quiz.concerns]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((concern) => ({ id: concern.concernId, body: concern.body, language: concern.language }))

  return { id: quiz.id, people, letters, answerResult: quiz.answerResult }
}

function hasThreeUniqueQuizItems(quiz: TodayQuizResponse) {
  return (
    quiz.participants.length === 3 &&
    quiz.concerns.length === 3 &&
    new Set(quiz.participants.map((participant) => participant.participantId)).size === 3 &&
    new Set(quiz.concerns.map((concern) => concern.concernId)).size === 3
  )
}

function assignmentsFromResult(result: QuizAnswerResponse | undefined): Answers {
  if (!result) return {}
  return Object.fromEntries(
    result.results.map((item) => [item.selectedConcernId, item.participantId]),
  )
}

/**
 * 紙の一枚。本文と、その下に置くもの（切り欠き、または結果）を受け取る。
 * 前後の手紙へは左右のスワイプと矢印キーで移動する。
 */
function Paper({
  children,
  swipeTarget = false,
  className = '',
}: {
  children: ReactNode
  swipeTarget?: boolean
  /** 紙の中身に合わせた行送り。結果の紙だけ、判定のメモのぶん余白を取り直す。 */
  className?: string
}) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${className} ${turnStyles.page}`}
      data-notebook-swipe-target={swipeTarget ? '' : undefined}
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
  const { t } = useTranslation()

  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      {/*
        読み終えて閉じたノートからは、飛んできた紙飛行機を降ろす。
        届いたことを告げる絵なので、読み終えたあとも飛んでいると、
        まだ次が届くという誤った合図になる。上辺も付箋に明け渡す。
      */}
      <CoverArt arrived={!answered} />
      <p className={styles.coverTitle}>{t('quiz.title')}</p>
      {answered ? (
        <p className={styles.coverLead}>
          {t('quiz.allMarked')}
          <br />
          {t('quiz.reviewHint')}
        </p>
      ) : (
        <p className={styles.coverLead}>
          {t('quiz.arrived')}
          <br />
          {t('quiz.who')}
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
  const { people, letters, answerResult } = useQuizData()
  const fitted = personById(personId, people)
  const slot = letters.findIndex((letter) => letter.id === target.id)

  if (showingResults) {
    return (
      <QuizResultPaperBody
        target={target}
        body={body}
        slot={slot}
        letterCount={letters.length}
        people={people}
        answerResult={answerResult}
      />
    )
  }

  return (
    <QuizSelectionPaperBody
      target={target}
      body={body}
      slot={slot}
      letterCount={letters.length}
      fitted={fitted}
      interactive={interactive}
      slotRef={slotRef}
      dragOver={dragOver}
      onPull={onPull}
    />
  )
}

function QuizResultPaperBody({
  target,
  body,
  slot,
  letterCount,
  people,
  answerResult,
}: {
  target: Letter
  body: string | undefined
  slot: number
  letterCount: number
  people: Person[]
  answerResult: QuizAnswerResponse | undefined
}) {
  const { t } = useTranslation()

  const writerResult = answerResult?.results.find((result) => result.correctConcernId === target.id)
  const selectedResult = answerResult?.results.find(
    (result) => result.selectedConcernId === target.id,
  )
  const writer = personById(writerResult?.participantId, people)
  if (!writer || !writerResult || !selectedResult) {
    return <p role="alert">{t('quiz.resultFailed')}</p>
  }

  const correct = selectedResult.correct
  return (
    <>
      {/* 結果でも、書き手の条件を、この手紙の持ち場に残す。 */}
      <div
        className={`${styles.tabRow} ${styles.paperTab}`}
        style={tabSlotStyle(slot, letterCount)}
      >
        <span className={styles.choice}>
          <span className={styles.tag} style={tagStyle(writer)}>
            <TagFace label={writer.attributes} />
          </span>
        </span>
      </div>
      {/* 問いかけと同じ位置に、そのまま答えを置く。 */}
      <p className={styles.ask}>{t('quiz.writer')}</p>
      <div className={styles.letterSheet}>
        <p className={styles.letter} lang={target.language === 'en' ? 'en' : 'ja'}>
          {body}
        </p>
        <TranslationNotice actualLanguage={target.language} />
      </div>
      <div className={styles.verdict} role="status">
        <p className={styles.judge}>
          {correct ? <CorrectRing /> : null}
          {correct ? t('quiz.correct') : t('quiz.incorrect')}
          {/*
            書いた条件はすぐ上のしおりに出ているので、目では読み返せる。
            読み上げでは紙の上端まで戻れないので、ここで言葉にして添える。
          */}
          {correct ? null : (
            <span className={styles.srOnly}>
              {t('quiz.writerDescription', { attributes: writer.attributes })}
            </span>
          )}
        </p>
        {writerResult.explanation === messages['quiz.explanation'][0] ? (
          <p className={styles.note}>{t('quiz.explanation')}</p>
        ) : (
          <div>
            <p className={styles.note} lang="ja">
              {writerResult.explanation}
            </p>
            <TranslationNotice actualLanguage="original" />
          </div>
        )}
      </div>
    </>
  )
}

function QuizSelectionPaperBody({
  target,
  body,
  slot,
  letterCount,
  fitted,
  interactive,
  slotRef,
  dragOver,
  onPull,
}: {
  target: Letter
  body: string | undefined
  slot: number
  letterCount: number
  fitted: Person | undefined
  interactive: boolean
  slotRef: React.RefObject<HTMLSpanElement | null>
  dragOver: boolean
  onPull: (letterId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <div
        className={`${styles.tabRow} ${styles.paperTab}`}
        style={tabSlotStyle(slot, letterCount)}
      >
        {fitted ? (
          <button
            type="button"
            className={`${styles.choice} ${styles.fitted}`}
            onClick={() => interactive && onPull(target.id)}
            aria-label={t('quiz.remove', { attributes: fitted.attributes })}
          >
            <span className={styles.tag} style={tagStyle(fitted)}>
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
            <span className={styles.tagLabel}>{t('quiz.placeHere')}</span>
          </span>
        )}
      </div>
      {/* 問いかけの場所は動かさない。挟んだあとは、やり直し方をここで伝える。 */}
      <p className={styles.ask}>{fitted ? t('quiz.changeHint') : t('quiz.matchQuestion')}</p>
      <div className={styles.letterSheet}>
        <p className={styles.letter} lang={target.language === 'en' ? 'en' : 'ja'}>
          {body}
        </p>
        <TranslationNotice actualLanguage={target.language} />
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
  submitError,
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
  submitError: string | null
  onNext: () => void
  onOpenCover: () => void
  onSubmit: () => void
}) {
  const { t, message } = useTranslation()

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
            {t('quiz.open')}
            <span aria-hidden="true">→</span>
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
            {t('quiz.next')}
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <>
            {score !== undefined ? (
              <p className={styles.score}>{t('quiz.score', { score })}</p>
            ) : null}
            <Link className={actionStyles.primary} to="/history">
              {t('quiz.history')}
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
          {submitting ? t('quiz.submitting') : t('quiz.submit')}
        </button>
      ) : null}
      {submitError ? (
        <p className={styles.submitError} role="alert">
          {message(submitError)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Intent: クイズの回答状態と、そこから導ける表示状態を局所化する。
 * Boundary: 初期結果を受け取り、状態・表示用の値・reducer dispatchだけを返す。
 * State modeling: 依存する状態遷移をquizReducerに集約し、無効な組み合わせを画面側で作らない。
 */
function useQuizState(
  quizResult: QuizAnswerResponse | undefined,
  people: Person[],
  letters: Letter[],
) {
  const [state, dispatch] = useReducer(quizReducer, Boolean(quizResult), createInitialState)
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = letters[state.index]
  const answers = quizResult ? assignmentsFromResult(quizResult) : state.answers
  const answeredPersonIds = new Set(Object.values(answers))
  const remaining = people.filter((person) => !answeredPersonIds.has(person.id))
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

function useQuizNavigation(setAnswerResult: (result: QuizAnswerResponse) => void) {
  const { language } = useDisplaySettings()
  const { id: quizId, people, letters: quizLetters, answerResult: quizResult } = useQuizData()
  const { state, dispatch, letters, letter, answers, remaining, complete, showingResults } =
    useQuizState(quizResult, people, quizLetters)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
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

  /**
   * 付箋から、その手紙へ移る。
   *
   * 閉じていればノートごと開き、開いていればその紙まで一度でめくる。
   * 何通目かは付箋の持ち場そのものなので、押した先がどこかは迷わない。
   */
  const openTab = useCallback(
    (index: number) => {
      cancelSettle()
      if (turning) return
      if (!state.coverOpened) {
        reopen(index)
        return
      }
      if (index === state.index) return
      if (prefersReducedMotion()) {
        dispatch({ type: 'openLetter', index })
        return
      }
      if (index > state.index) {
        // 先の手紙へ。いま読んでいる紙をめくって去らせる。
        beginTurn({
          kind: 'letter',
          letter,
          personId: answers[letter.id],
          startAngle: 0,
          direction: 1,
        })
        dispatch({ type: 'openLetter', index })
        return
      }
      // 前の手紙へ。伏せていた紙を拾い上げ、降ろし終えてから入れ替える。
      const target = letters[index]
      beginTurn({
        kind: 'letter',
        letter: target,
        personId: answers[target.id],
        startAngle: 0,
        direction: -1,
        toIndex: index,
      })
    },
    [
      answers,
      beginTurn,
      cancelSettle,
      dispatch,
      letter,
      letters,
      reopen,
      state.coverOpened,
      state.index,
      turning,
    ],
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
        dispatch({ type: 'go', direction, count: letters.length })
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
        dispatch({ type: 'go', direction, count: letters.length })
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
    const open = firstOpenIndex(next, letters)
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
    if (!complete || state.step === 'submitting' || quizResult) return
    dispatch({ type: 'submitStarted' })
    setSubmitError(null)

    const matches: QuizMatch[] = letters.flatMap((item) => {
      const participantId = state.answers[item.id]
      return participantId ? [{ participantId, concernId: item.id }] : []
    })
    const result = await answerQuiz(quizId, matches)

    const showResult = (answer: QuizAnswerResponse) => {
      setAnswerResult(answer)
      if (state.closed && !prefersReducedMotion()) {
        beginTurn({ kind: 'cover', startAngle: 0, direction: 1 })
      }
      dispatch({ type: 'showResults' })
    }

    if (result.ok) {
      showResult(result.data)
      return
    }

    if (result.code === 'QUIZ_NOT_AVAILABLE') {
      setUnavailable(true)
      dispatch({ type: 'submitFailed' })
      return
    }

    // タイムアウト後に送信が完了していた場合も、結果の再取得で回答済み状態へ戻す。
    const latest = await getQuizById(quizId, language)
    if (latest.ok && latest.data.answered && latest.data.answerResult) {
      showResult(latest.data.answerResult)
      return
    }
    if (!latest.ok && latest.code === 'QUIZ_NOT_AVAILABLE') {
      setUnavailable(true)
      dispatch({ type: 'submitFailed' })
      return
    }

    dispatch({ type: 'submitFailed' })
    setSubmitError(
      result.code === 'QUIZ_ALREADY_ANSWERED' ? 'quiz.verifyFailed' : 'quiz.submitFailed',
    )
  }

  const finishTurn = useCallback(() => {
    if (turning?.kind === 'letter' && turning.direction === -1) {
      // 付箋から跳んだときは行き先が決まっている。前後の移動は1通ずつ戻る。
      if (turning.toIndex === undefined) {
        dispatch({ type: 'go', direction: -1, count: letters.length })
      } else dispatch({ type: 'openLetter', index: turning.toIndex })
    }
    // 表紙が戻りきってから閉じる。先に閉じると、めくる表紙が二重に見える。
    if (turning?.kind === 'cover' && turning.direction === -1) {
      dispatch({ type: 'close' })
    }
    clearTurning()
  }, [clearTurning, dispatch, letters.length, turning])

  const pull = useCallback(
    (letterId: string) => {
      // 抜いたなら、めくるのはやめる。選び直す紙が目の前から消えてしまう。
      if (state.step === 'submitting' || quizResult) return
      cancelSettle()
      dispatch({ type: 'pull', letterId })
    },
    [cancelSettle, dispatch, quizResult, state.step],
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
    openTab,
    fit,
    submit,
    submitError,
    unavailable,
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
    if (event.button !== 0 || !event.isPrimary) return
    // タッチでは下方向ドラッグを使わず、タップだけで選ぶ。
    const canDrag = event.pointerType === 'mouse'
    const pointerId = event.pointerId
    let moved = false
    const tag = event.currentTarget.querySelector<HTMLElement>(`.${styles.tag}`)
    const rect = tag?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const from = { x: event.clientX, y: event.clientY }
    const size = { width: rect.width, height: rect.height }
    if (canDrag) setDrag({ personId, x: rect.left, y: rect.top, over: false, ...size })

    function trackMovement(pointerEvent: PointerEvent) {
      moved ||=
        Math.abs(pointerEvent.clientX - from.x) + Math.abs(pointerEvent.clientY - from.y) > TAP_SLOP
    }

    function move(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return
      trackMovement(moveEvent)
      if (!canDrag) return
      setDrag({
        personId,
        x: moveEvent.clientX - offsetX,
        y: moveEvent.clientY - offsetY,
        over: isOverSlot(moveEvent.clientX, moveEvent.clientY),
        ...size,
      })
    }

    function end(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      // LINEの最小化やスクロールに操作を引き渡した場合は確定しない。
      if (endEvent.type === 'pointercancel') return
      trackMovement(endEvent)
      // タップで差し込む。マウスだけは従来のドラッグも利用できる。
      if (!moved || (canDrag && isOverSlot(endEvent.clientX, endEvent.clientY))) fit(personId)
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
  const { t } = useTranslation()

  return (
    <div
      className={`${styles.tray} ${remaining.length === 0 ? styles.trayEmpty : ''}`}
      role="group"
      aria-label={t('quiz.bookmarks')}
    >
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
          aria-label={t('quiz.choose', { attributes: person.attributes })}
        >
          <span className={styles.tag} style={tagStyle(person)}>
            <TagFace label={person.attributes} />
          </span>
        </button>
      ))}
    </div>
  )
}

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: TurningState, index: number) {
  return turning.kind === 'cover'
    ? `cover-${turning.direction}-${index}`
    : `${turning.letter.id}-${turning.personId ?? ''}-${index}`
}

/**
 * 挟み終えた付箋の段。
 *
 * 挟んだ紙がめくられて下へ入っても、付箋はその持ち場に出したままにする。
 * 3枚がいつも見えていれば、どの手紙にどの条件を挟んだかを見比べられるし、
 * 本を閉じても付箋は動かない。表紙が降りてきて、付箋だけが残る。
 *
 * ここに出すのは、いま開いている紙より下にある付箋だけ。開いている紙の付箋は
 * その紙自身が持っていて（.paperTab）、押すと外せる。二重に描くと、外せる1枚と
 * 移るための1枚が同じ場所に重なる。
 */
function QuizTabs({
  answers,
  activeIndex,
  closed,
  onSelect,
}: {
  answers: Answers
  /** いま開いている紙。閉じているときは null。 */
  activeIndex: number | null
  closed: boolean
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()

  const { letters, people } = useQuizData()

  return (
    <div className={`${styles.tabRow} ${styles.tabs}`} style={tabSlotStyle(0, letters.length)}>
      {letters.map((target, index) => {
        const fitted = personById(answers[target.id], people)
        if (!fitted || index === activeIndex) return null
        return (
          <button
            key={target.id}
            type="button"
            className={`${styles.choice} ${styles.tab}`}
            style={{ '--tab-slot': index + 1 } as CSSProperties}
            onClick={() => onSelect(index)}
            aria-label={t('quiz.letterBookmark', {
              index: index + 1,
              attributes: fitted.attributes,
              action: t(closed ? 'quiz.reopen' : 'quiz.goLetter'),
            })}
          >
            <span className={styles.tag} style={tagStyle(fitted)}>
              <TagFace label={fitted.attributes} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

type QuizSwipe = ReturnType<typeof useNotebookSwipe>

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
    <NotebookTurn
      key={key}
      variant={isCover ? 'cover' : 'page'}
      startAngle={turning.startAngle}
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
  )
}

function QuizFrontPage({
  coverOpened,
  closed,
  letter,
  answers,
  stateIndex,
  showingResults,
  slotRef,
  dragOver,
  bodyOf,
  onPull,
}: {
  coverOpened: boolean
  /** 読み終えて閉じたか。表紙の上には、挟んだ付箋だけが出る。 */
  closed: boolean
  letter: Letter
  answers: Answers
  stateIndex: number
  showingResults: boolean
  slotRef: React.RefObject<HTMLSpanElement | null>
  dragOver: boolean
  bodyOf: (target: Letter) => string | undefined
  onPull: (letterId: string) => void
}) {
  if (coverOpened) {
    return (
      <div key={`${letter.id}-${stateIndex}`} className={styles.enter}>
        <Paper className={showingResults ? styles.resultCard : ''} swipeTarget>
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
  onSelect,
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
  /** 付箋が押されたとき、その手紙を開く。 */
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()

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
        {t('quiz.pageTitle')}
      </h1>
      {/*
        小さく置くのは、まだ読みはじめていない表紙だけにする。
        読み終えて閉じたノートには付箋が並ぶので、そこで縮めると条件の字が読めない。
      */}
      <NotebookStack
        ref={stackRef}
        className={`${styles.stack} ${!coverOpened && !closed ? styles.stackCover : ''} ${
          coverOpening ? styles.stackOpening : ''
        }`}
        opened={coverOpened}
        bookmarks={
          showingResults ? null : (
            <QuizTabs
              answers={answers}
              activeIndex={coverOpened ? stateIndex : null}
              closed={closed}
              onSelect={onSelect}
            />
          )
        }
        turning={
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
        }
      >
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
          slotRef={slotRef}
          dragOver={dragOver}
          bodyOf={bodyOf}
          onPull={onPull}
        />
      </NotebookStack>
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
          ...tagStyle(dragged),
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

function QuizUnavailableState() {
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      <EmptyState title={t('quiz.unavailable')} description={t('quiz.unavailableHint')} />
      <div className={styles.actions}>
        <Link className={actionStyles.primary} to="/">
          {t('common.viewFeed')}
        </Link>
      </div>
    </div>
  )
}

function QuizExperience({
  quiz,
  setAnswerResult,
}: {
  quiz: QuizPageModel
  setAnswerResult: (result: QuizAnswerResponse) => void
}) {
  return (
    <QuizContext.Provider value={quiz}>
      <QuizReader setAnswerResult={setAnswerResult} />
    </QuizContext.Provider>
  )
}

function QuizReader({
  setAnswerResult,
}: {
  setAnswerResult: (result: QuizAnswerResponse) => void
}) {
  const { t } = useTranslation()

  const { answerResult, people } = useQuizData()
  const quiz = useQuizNavigation(setAnswerResult)
  const { openCover } = quiz
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    // 表紙を描画してから開く。StrictModeのEffect再実行でも押し上げ位置を失わない。
    const frame = window.requestAnimationFrame(() => {
      started.current = true
      openCover()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [openCover])
  const { drag, slotRef, startDrag } = useQuizDrag(quiz.fit)
  const swipe = useNotebookSwipe({
    // 表紙が残っているうちは、左へ払う先が手紙ではなく表紙になる。
    canGoNext: !quiz.state.coverOpened || quiz.canGoNext,
    canGoPrevious: quiz.canGoPrev,
    onNext: (startAngle) => quiz.go(1, startAngle),
    onPrevious: () => quiz.go(-1),
  })
  const dragged = personById(drag?.personId, people)
  const bodyOf = (target: Letter) => target.body
  if (quiz.unavailable) return <QuizUnavailableState />

  return (
    <div className={styles.page}>
      {/*
          ぜんぶ挟んでも棚は残す。棚ごと消すと版面が跳ね上がり、
          いま差したばかりの紙から目が外れてしまう。空いた棚は「もう手元にない」
          ことをそのまま表す。
        */}
      {!quiz.showingResults && (quiz.state.coverOpened || quiz.state.closed) ? (
        <QuizTray remaining={quiz.remaining} drag={drag} onStartDrag={startDrag} onFit={quiz.fit} />
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
        onSelect={quiz.openTab}
      />

      <QuizActions
        coverOpened={quiz.state.coverOpened}
        closed={quiz.state.closed}
        coverLifting={quiz.state.coverLifting}
        showingResults={quiz.showingResults}
        canGoNext={quiz.canGoNext}
        complete={quiz.complete}
        submitting={quiz.state.step === 'submitting'}
        score={answerResult?.score}
        submitError={quiz.submitError}
        onNext={() => quiz.go(1)}
        onOpenCover={() => quiz.openCover()}
        onSubmit={() => void quiz.submit()}
      />

      <QuizDragGhost drag={drag} dragged={dragged} />

      <p className={styles.srOnly} aria-live="polite">
        {quiz.state.closed
          ? t('quiz.closedAnnouncement')
          : quiz.state.coverOpened && (quiz.canGoPrev || quiz.canGoNext)
            ? t('quiz.letterNumber', { index: quiz.state.index + 1 })
            : ''}
      </p>
    </div>
  )
}

type QuizLoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; quiz: QuizPageModel }

type QuizLoadAction =
  | { type: 'loading' }
  | { type: 'unavailable' }
  | { type: 'error' }
  | { type: 'ready'; quiz: QuizPageModel }
  | { type: 'answerReceived'; answerResult: QuizAnswerResponse }

function quizLoadReducer(_state: QuizLoadState, action: QuizLoadAction): QuizLoadState {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'error':
      return { status: 'error' }
    case 'ready':
      // 言語だけの再取得では、回答中の順番と選択を保つ。
      if (_state.status === 'ready' && _state.quiz.id === action.quiz.id) {
        return {
          status: 'ready',
          quiz: {
            ...action.quiz,
            people: _state.quiz.people,
            letters: _state.quiz.letters.map(
              (letter) => action.quiz.letters.find((next) => next.id === letter.id) ?? letter,
            ),
            answerResult: action.quiz.answerResult ?? _state.quiz.answerResult,
          },
        }
      }
      return { status: 'ready', quiz: action.quiz }
    case 'answerReceived':
      return _state.status === 'ready'
        ? { ..._state, quiz: { ..._state.quiz, answerResult: action.answerResult } }
        : _state
  }
}

function QuizPage({ enabled }: { enabled: boolean }) {
  const { t, language } = useTranslation()
  const requestVersion = useRef(0)
  const [openRequested, setOpenRequested] = useState(false)

  const [loadState, dispatchLoad] = useReducer(quizLoadReducer, { status: 'loading' })

  const setQuizAnswerResult = useCallback((answerResult: QuizAnswerResponse) => {
    dispatchLoad({ type: 'answerReceived', answerResult })
  }, [])

  const loadQuiz = useCallback(async () => {
    const version = ++requestVersion.current
    const result = await getTodayQuiz(language)
    if (version !== requestVersion.current) return
    if (!result.ok) {
      dispatchLoad({ type: result.code === 'QUIZ_NOT_AVAILABLE' ? 'unavailable' : 'error' })
      return
    }
    if (!hasThreeUniqueQuizItems(result.data)) {
      dispatchLoad({ type: 'unavailable' })
      return
    }
    if (result.data.answered && !result.data.answerResult) {
      dispatchLoad({ type: 'error' })
      return
    }

    dispatchLoad({ type: 'ready', quiz: toQuizPageModel(result.data) })
  }, [language])

  const retryLoad = useCallback(() => {
    dispatchLoad({ type: 'loading' })
    void loadQuiz()
  }, [dispatchLoad, loadQuiz])

  useEffect(() => {
    if (!enabled) return
    void loadQuiz()
    return () => {
      requestVersion.current += 1
    }
  }, [enabled, loadQuiz])

  if (!enabled || !openRequested || loadState.status === 'loading') {
    return <QuizEntrance waiting={openRequested} onOpen={() => setOpenRequested(true)} />
  }
  if (loadState.status === 'unavailable') return <QuizUnavailableState />
  if (loadState.status === 'error') {
    return (
      <div className={styles.page}>
        <ErrorState description={t('error.todayQuizFull')} onRetry={retryLoad} />
        <div className={styles.actions}>
          <Link className={actionStyles.primary} to="/">
            {t('common.viewFeed')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <QuizExperience
      key={loadState.quiz.id}
      quiz={loadState.quiz}
      setAnswerResult={setQuizAnswerResult}
    />
  )
}

function QuizEntrance({ waiting, onOpen }: { waiting: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <div className={styles.page}>
      <section className={styles.stage} aria-labelledby="quiz-title">
        <h1 id="quiz-title" className={styles.srOnly}>
          {t('quiz.pageTitle')}
        </h1>
        <NotebookStack className={`${styles.stack} ${styles.stackCover}`} opened={false}>
          <div className={styles.coverStandalone}>
            <QuizCover />
          </div>
        </NotebookStack>
      </section>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.nextButton}`}
          onClick={onOpen}
          disabled={waiting}
          aria-busy={waiting}
        >
          {t('quiz.open')}
          <span aria-hidden="true">→</span>
        </button>
        <p role="status">{waiting ? t('quiz.loading') : ''}</p>
      </div>
    </div>
  )
}

export function QuizRoute() {
  const { state } = useRuntime()
  const { status, user } = useAuth()
  const enabled =
    state.status === 'ready' &&
    state.mode === 'liff' &&
    status === 'authenticated' &&
    Boolean(user?.profileCompleted)
  const page = <QuizPage enabled={enabled} />
  return <ProtectedRoute pending={page}>{page}</ProtectedRoute>
}
