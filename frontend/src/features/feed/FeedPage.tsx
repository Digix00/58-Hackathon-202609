import { useTranslation } from '../../i18n/useTranslation'
import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefCallback,
  type RefObject,
  type TouchEvent,
} from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { SelectField } from '../../shared/components/FormFields'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { NotebookOpening, NotebookStack } from '../../shared/components/NotebookStack'
import { QiiteLogo } from '../../shared/components/QiiteLogo'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { useConcernViewOnDisplay } from '../concern-detail/useConcernViewOnDisplay'
import { CoverArt } from './CoverArt'
import { CoverStickers } from './CoverStickers'
import { resolveFeedContext } from './feedContext'
import {
  ALL,
  activeFeedFilterLabel,
  buildFeedFilterOptions,
  type FeedConcern,
  type FeedFilter,
  type FeedFilterOption,
} from './feedViewModel'
import { useFeedReader } from './useFeedReader'
import type { TurningPage } from './useFeedReader'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'
import { TranslationNotice } from '../../shared/components/TranslationNotice'

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: TurningPage) {
  return turning.kind === 'cover' ? 'cover' : `${turning.concern.id}-${turning.page}`
}

/**
 * 手で描いたハート。左右をわざと揃えないのは、
 * 記号の ♡ を置くと、この画面の中でここだけ定規で引いた線に見えるため。
 */
function CrayonHeart() {
  return (
    <svg className={styles.heart} viewBox="0 0 24 22" aria-hidden="true" focusable="false">
      <path d="M12 20.3C11.3 19.8 3.4 14.5 2.5 8.6 2 5.1 4.2 2.3 7.2 2.1c2.2-.2 4 1.1 4.9 3.1.8-2.1 2.6-3.5 4.8-3.3 3 .2 5.3 3 4.7 6.5-.9 5.8-8.9 11.3-9.6 11.9Z" />
    </svg>
  )
}

/** 押した瞬間に、ハートのまわりへ短い線が散る。スタンプを押した跡。 */
function ReactionSpark() {
  return (
    <svg className={styles.spark} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g>
        <path d="M20 7V2" />
        <path d="M29 10.5 32.6 7" />
        <path d="M33 20h5" />
        <path d="M11 10.5 7.4 7" />
        <path d="M7 20H2" />
        <path d="M28.6 29.6 32 33" />
      </g>
    </svg>
  )
}

function FeedTabs({ concern, showTabs }: { concern: FeedConcern; showTabs: boolean }) {
  if (!showTabs) return null

  return (
    <span className={styles.tabs}>
      {concern.ageGroup ? (
        <span className={`${styles.tab} ${styles.tabAge}`}>{concern.ageGroup}</span>
      ) : null}
      {concern.region ? (
        <span className={`${styles.tab} ${styles.tabRegion}`}>{concern.region}</span>
      ) : null}
    </span>
  )
}

type FeedReactionProps = {
  canReact: boolean
  reactionCount: number
  reacted: boolean
  submitting: boolean
  onReact?: () => boolean
}

function FeedReaction({
  canReact,
  reactionCount,
  reacted,
  submitting,
  onReact,
}: FeedReactionProps) {
  const { t } = useTranslation()

  const [sparked, setSparked] = useState(false)

  if (!canReact) return null

  return (
    <button
      type="button"
      className={`${styles.reaction} ${reacted ? styles.reacted : ''} ${
        sparked ? styles.sparked : ''
      }`}
      onClick={() => {
        if (onReact?.()) setSparked(!reacted)
      }}
      disabled={submitting}
      aria-pressed={reacted}
      aria-busy={submitting}
    >
      <span className={styles.stamp}>
        <CrayonHeart />
        {sparked ? <ReactionSpark /> : null}
      </span>
      <span className={styles.label}>{reacted ? t('reaction.remove') : t('reaction.support')}</span>
      <span className={styles.count} aria-label={t('reaction.count', { count: reactionCount })}>
        {reactionCount}
      </span>
    </button>
  )
}

function FeedNextCorner({ onNext }: { onNext?: () => void }) {
  if (!onNext) return null

  return (
    <button
      type="button"
      className={styles.corner}
      onClick={onNext}
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}

function FeedCard({
  concern,
  page,
  onNext,
  articleRef,
  swipeTarget = false,
  onLinkClick,
  showTabs = true,
  reaction,
  reactionError,
}: {
  concern: FeedConcern
  page: number
  /** 渡したときだけ、紙の右下にめくれた角を出す。めくられている最中の紙には出さない。 */
  onNext?: () => void
  articleRef?: RefCallback<HTMLElement>
  swipeTarget?: boolean
  onLinkClick?: (event: MouseEvent) => void
  /** 表紙の下に控えているあいだは、上辺のインデックスを出さない。中身の先出しになる。 */
  showTabs?: boolean
  reaction?: FeedReactionProps | null
  reactionError?: string | null
}) {
  const palette = paletteForPage(page)
  const { t, message } = useTranslation()

  return (
    <article
      ref={articleRef}
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${turnStyles.page}`}
      data-notebook-swipe-target={swipeTarget ? '' : undefined}
      style={
        {
          '--bookmark': palette.bookmark,
          '--tag-age': palette.tagAge,
          '--tag-region': palette.tagRegion,
        } as CSSProperties
      }
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      {/* 上辺のインデックス。公開されている年代・地域の付箋。 */}
      <FeedTabs concern={concern} showTabs={showTabs} />
      <Link
        className={styles.storyLink}
        to={`/concerns/${encodeURIComponent(concern.id)}`}
        aria-label={t('feed.details', { body: concern.body })}
        onClick={onLinkClick}
      >
        <p className={screen.body} lang={concern.language === 'en' ? 'en' : 'ja'}>
          {concern.body}
        </p>
      </Link>
      {showTabs ? (
        <TranslationNotice actualLanguage={concern.language} status={concern.translationStatus} />
      ) : null}
      {reaction?.canReact ? (
        <div className={styles.cardActions}>
          <FeedReaction {...reaction} />
          {reactionError ? (
            <p className={styles.submitError} role="alert">
              {message(reactionError)}
            </p>
          ) : null}
        </div>
      ) : null}
      {/* めくれた角。紙をめくる補助操作なので、読み上げには重ねて出さない。 */}
      <FeedNextCorner onNext={onNext} />
    </article>
  )
}

/**
 * 表紙。
 *
 * 最初の1枚を声ではなく表紙にして、読みはじめを「ノートを開く」動作にする。
 * 声そのものが読む気持ちを作るという原則は変えないので、ここに置くのは
 * 題字と短い一言、そしてクレヨンの絵だけにし、件数・日時・推薦理由は出さない。
 *
 * 絵を置くのは表紙だけ。表紙は「何の本か」を絵で伝える面だが、
 * 声の紙は本文が主役なので、同じ絵を持ち込むと読む前に絵を見てしまう。
 */
function FeedCover() {
  const { t } = useTranslation()

  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      <CoverArt />
      <QiiteLogo className={styles.coverTitle} />
      <p className={styles.coverLead}>
        {t('feed.coverLead')}
        <br />
        {t('feed.coverQuestion')}
      </p>
    </article>
  )
}

type FeedStackProps = {
  concern: FeedConcern | undefined
  stackRef: RefObject<HTMLDivElement | null>
  index: number
  position: number
  turning: TurningPage | null
  coverOpened: boolean
  coverOpening: boolean
  articleRef?: RefCallback<HTMLElement>
  onNext: () => void
  onLinkClick: (event: MouseEvent) => void
  onTurningFinished: () => void
  reaction: FeedReactionProps | null
  reactionError: string | null
}

function FeedStack({
  concern,
  stackRef,
  index,
  position,
  turning,
  coverOpened,
  coverOpening,
  articleRef,
  onNext,
  onLinkClick,
  onTurningFinished,
  reaction,
  reactionError,
}: FeedStackProps) {
  return (
    <NotebookOpening ref={stackRef} opening={coverOpening}>
      <NotebookStack
        className={styles.stack}
        opened={coverOpened}
        decoration={!coverOpened ? <CoverStickers scattering={coverOpening} /> : null}
        turning={
          turning ? (
            <NotebookTurn
              key={turningKey(turning)}
              variant={turning.kind === 'cover' ? 'cover' : 'page'}
              startAngle={turning.startAngle}
              direction={turning.kind === 'concern' ? turning.direction : 1}
              onFinish={onTurningFinished}
            >
              {turning.kind === 'concern' ? (
                <FeedCard concern={turning.concern} page={turning.page} />
              ) : (
                <FeedCover />
              )}
            </NotebookTurn>
          ) : null
        }
      >
        {/*
         * 表紙自身で紙束の高さを確保し、取得前後で位置を変えない。
         * 戻りのめくりが降りている間は、いま読んでいる紙をここに残す。
         */}
        {coverOpened && concern ? (
          <div key={`${concern.id}-${index}`} className={styles.enter}>
            <FeedCard
              concern={concern}
              page={position + 1}
              onNext={onNext}
              articleRef={articleRef}
              swipeTarget
              onLinkClick={onLinkClick}
              reaction={reaction}
              reactionError={reactionError}
            />
          </div>
        ) : (
          <div className={styles.coverStandalone}>
            <FeedCover />
          </div>
        )}
      </NotebookStack>
    </NotebookOpening>
  )
}

function FeedEmpty({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation()

  return (
    <div className={styles.empty}>
      <p>{t('feed.empty')}</p>
      <button type="button" className={actionStyles.secondary} onClick={onReset}>
        {t('feed.readAll')}
      </button>
    </div>
  )
}

type FeedStageProps = Omit<FeedStackProps, 'concern'> & {
  concern: FeedConcern | undefined
  onReset: () => void
  onTouchStart: (event: TouchEvent) => void
  onTouchMove: (event: TouchEvent) => void
  onTouchEnd: (event: TouchEvent) => void
  onTouchCancel: () => void
}

function FeedStage({
  concern,
  onReset,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  ...stackProps
}: FeedStageProps) {
  const { t } = useTranslation()

  return (
    <section
      className={styles.stage}
      aria-labelledby="feed-title"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <h1 id="feed-title" className={styles.srOnly}>
        {t('feed.start')}
      </h1>
      {concern || !stackProps.coverOpened ? (
        <FeedStack concern={concern} {...stackProps} />
      ) : (
        <FeedEmpty onReset={onReset} />
      )}
    </section>
  )
}

type FeedActionsProps = {
  coverOpened: boolean
  waiting: boolean
  showLogin: boolean
  concern: FeedConcern | undefined
  filtersOpen: boolean
  activeFilter: string
  filter: FeedFilter
  genderOptions: FeedFilterOption[]
  regionOptions: FeedFilterOption[]
  onNext: () => void
  onFiltersToggle: (open: boolean) => void
  onFilterChange: (field: keyof FeedFilter, value: string) => void
}

function FeedActions({
  coverOpened,
  waiting,
  showLogin,
  concern,
  filtersOpen,
  activeFilter,
  filter,
  genderOptions,
  regionOptions,
  onNext,
  onFiltersToggle,
  onFilterChange,
}: FeedActionsProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.actions}>
      {showLogin ? <LoginGuide /> : null}
      {concern || !coverOpened ? (
        <div className={styles.coverOpenSlot}>
          <button
            type="button"
            className={`${actionStyles.primary} ${styles.coverButton}`}
            onClick={onNext}
            disabled={waiting}
            aria-busy={waiting}
          >
            {t('feed.next')}
            <span aria-hidden="true">→</span>
          </button>
          <p role="status">{waiting ? t('feed.loading') : ''}</p>
        </div>
      ) : null}
      <details
        className={styles.filters}
        open={filtersOpen}
        onToggle={(event) => onFiltersToggle(event.currentTarget.open)}
      >
        <summary>
          <span>{activeFilter ? t('feed.filtered') : t('feed.filter')}</span>
          {activeFilter ? <span className={styles.filterValue}>{activeFilter}</span> : null}
        </summary>
        <div className={styles.filterFields} aria-label={t('feed.filterLabel')}>
          <SelectField
            label={t('common.gender')}
            placement="up"
            value={filter.gender || ALL}
            options={genderOptions}
            onChange={(value) => onFilterChange('gender', value === ALL ? '' : value)}
          />
          <SelectField
            label={t('common.region')}
            placement="up"
            value={filter.region || ALL}
            options={regionOptions}
            onChange={(value) => onFilterChange('region', value === ALL ? '' : value)}
          />
        </div>
      </details>
    </div>
  )
}

type FeedPageViewProps = {
  showInitialLoading: boolean
  showInitialError: boolean
  initialError: string | null
  stageProps: FeedStageProps
  actionsProps: FeedActionsProps
  loadingMore: boolean
  showPaginationError: boolean
  paginationError: string | null
  onRetry: () => Promise<void>
  reactionAnnouncement: string
}

function FeedPageView({
  showInitialLoading,
  showInitialError,
  initialError,
  stageProps,
  actionsProps,
  loadingMore,
  showPaginationError,
  paginationError,
  onRetry,
  reactionAnnouncement,
}: FeedPageViewProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.page}>
      {showInitialLoading && stageProps.coverOpened ? (
        <LoadingState label={t('feed.loading')} />
      ) : null}
      {showInitialError ? (
        <ErrorState description={initialError ?? t('error.loadConcernShort')} onRetry={onRetry} />
      ) : null}
      {!showInitialError && (!showInitialLoading || !stageProps.coverOpened) ? (
        <FeedStage {...stageProps} />
      ) : null}
      <FeedActions {...actionsProps} />
      {loadingMore ? <LoadingState label={t('feed.loadingNext')} /> : null}
      {showPaginationError ? (
        <ErrorState description={paginationError ?? t('feed.nextFailed')} onRetry={onRetry} />
      ) : null}
      <p className={styles.srOnly} aria-live="polite">
        {reactionAnnouncement}
      </p>
    </div>
  )
}

export function FeedPage() {
  const { t } = useTranslation()
  const { state: runtime } = useRuntime()
  const { language } = useDisplaySettings()
  const { status: authStatus, user } = useAuth()
  const feedContext = resolveFeedContext(runtime, authStatus)
  const readerView = useFeedReader({
    language,
    enabled: feedContext.enabled,
    sort: feedContext.sort,
    authUserId: user?.id,
  })
  const {
    showInitialLoading,
    showInitialError,
    waitingToOpen,
    filter,
    index,
    coverOpened,
    showLogin,
    filtersOpen,
    turning,
    coverOpening,
    position,
    concern,
    stackRef,
    swipe,
    goNext,
    onTurningFinished,
    onReset,
    onLoginVisibilityChange,
    onFiltersToggle,
    onFilterChange,
    applyReaction,
  } = readerView
  const { genderOptions, regionOptions } = buildFeedFilterOptions(language)
  const reaction = useConcernReaction({
    concernId: concern?.id ?? '',
    initialReactionCount: concern?.reactionCount ?? 0,
    initialReacted: concern?.reacted ?? false,
    onChanged: applyReaction,
  })
  useConcernViewOnDisplay(coverOpened ? concern?.id : undefined)
  const activeFilter = activeFeedFilterLabel(filter, language)

  const stageProps: FeedStageProps = {
    concern,
    stackRef,
    index,
    position,
    turning,
    coverOpened,
    coverOpening,
    articleRef: undefined,
    onNext: goNext,
    onLinkClick: swipe.handleLinkClick,
    onTurningFinished,
    onReset,
    onTouchStart: swipe.handleTouchStart,
    onTouchMove: swipe.handleTouchMove,
    onTouchEnd: swipe.handleTouchEnd,
    onTouchCancel: swipe.handleTouchCancel,
    reaction:
      coverOpened && feedContext.isLiff
        ? {
            canReact: true,
            reactionCount: reaction.reactionCount,
            reacted: reaction.reacted,
            submitting: reaction.status === 'submitting',
            onReact: () => {
              if (authStatus !== 'authenticated') {
                onLoginVisibilityChange(true)
                return false
              }
              void reaction.toggle()
              return true
            },
          }
        : null,
    reactionError: reaction.error,
  }
  const actionsProps: FeedActionsProps = {
    coverOpened: coverOpened || showInitialError,
    waiting: waitingToOpen,
    showLogin,
    concern,
    filtersOpen,
    activeFilter,
    filter,
    genderOptions,
    regionOptions,
    onNext: goNext,
    onFiltersToggle,
    onFilterChange,
  }

  return (
    <FeedPageView
      showInitialLoading={showInitialLoading}
      showInitialError={showInitialError}
      initialError={readerView.feedError}
      stageProps={stageProps}
      actionsProps={actionsProps}
      loadingMore={readerView.feedStatus === 'loadingMore'}
      showPaginationError={readerView.feedStatus === 'error' && readerView.total > 0}
      paginationError={readerView.feedError}
      onRetry={readerView.retry}
      reactionAnnouncement={
        reaction.reacted
          ? t('reaction.announcementFull', { count: reaction.reactionCount })
          : reaction.status === 'succeeded'
            ? t('reaction.removedAnnouncement', { count: reaction.reactionCount })
            : ''
      }
    />
  )
}
