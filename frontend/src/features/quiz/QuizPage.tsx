import { useTranslation } from '../../i18n/useTranslation'
import {
  useEffect,
  useRef,
  useState,
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
import { useNotebookSwipe } from '../../shared/hooks/useNotebookSwipe'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import type { QuizAnswerResponse } from '../../lib/api'
import { CoverArt } from './CoverArt'
import { QuizContext, useQuizData } from './quizContext'
import { useTodayQuiz } from './useTodayQuiz'
import { type Letter, type Person, type Answers, type QuizPageModel } from './quizViewModel'
import { useQuizNavigation } from './useQuizNavigation'
import { useQuizDrag, type DragState } from './useQuizDrag'
import type { TurningState } from './useQuizAnimation'
import styles from './QuizPage.module.css'
import { messages } from '../../i18n/messages'
import { TranslationNotice } from '../../shared/components/TranslationNotice'

const TAG_PATH = 'M3 3 L50 15 L97 3 V75 H3 Z'

function personById(id: string | undefined, people: Person[]) {
  return people.find((person) => person.id === id)
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
    canGoNext: !quiz.coverOpened || quiz.canGoNext,
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
      {!quiz.showingResults && (quiz.coverOpened || quiz.closed) ? (
        <QuizTray remaining={quiz.remaining} drag={drag} onStartDrag={startDrag} onFit={quiz.fit} />
      ) : null}
      <QuizStage
        stateIndex={quiz.index}
        letter={quiz.letter}
        answers={quiz.answers}
        turning={quiz.turning}
        showingResults={quiz.showingResults}
        coverOpened={quiz.coverOpened}
        coverOpening={quiz.coverOpening}
        closed={quiz.closed}
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
        coverOpened={quiz.coverOpened}
        closed={quiz.closed}
        coverLifting={quiz.coverLifting}
        showingResults={quiz.showingResults}
        canGoNext={quiz.canGoNext}
        complete={quiz.complete}
        submitting={quiz.submitting}
        score={answerResult?.score}
        submitError={quiz.submitError}
        onNext={() => quiz.go(1)}
        onOpenCover={() => quiz.openCover()}
        onSubmit={() => void quiz.submit()}
      />

      <QuizDragGhost drag={drag} dragged={dragged} />

      <p className={styles.srOnly} aria-live="polite">
        {quiz.closed
          ? t('quiz.closedAnnouncement')
          : quiz.coverOpened && (quiz.canGoPrev || quiz.canGoNext)
            ? t('quiz.letterNumber', { index: quiz.index + 1 })
            : ''}
      </p>
    </div>
  )
}

function QuizPage({ enabled }: { enabled: boolean }) {
  const { t, language } = useTranslation()
  const [openRequested, setOpenRequested] = useState(false)
  const { loadState, retry, receiveAnswer } = useTodayQuiz(enabled, language)

  if (!enabled || !openRequested || loadState.status === 'loading') {
    return <QuizEntrance waiting={openRequested} onOpen={() => setOpenRequested(true)} />
  }
  if (loadState.status === 'unavailable') return <QuizUnavailableState />
  if (loadState.status === 'error') {
    return (
      <div className={styles.page}>
        <ErrorState description={t('error.todayQuizFull')} onRetry={retry} />
        <div className={styles.actions}>
          <Link className={actionStyles.primary} to="/">
            {t('common.viewFeed')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <QuizExperience key={loadState.quiz.id} quiz={loadState.quiz} setAnswerResult={receiveAnswer} />
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
