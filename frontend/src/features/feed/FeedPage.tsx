import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
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
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import { SelectField } from '../../shared/components/FormFields'
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
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { isBackendDevMode } from '../../lib/devMode'
import { genderCodeForLabel, regionCodeForLabel, toDemoConcern } from '../demo/demoAdapter'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'
import { useConcernReaction } from '../reaction/useConcernReaction'
import { useConcernViewOnDisplay } from '../concern-detail/useConcernViewOnDisplay'
import { CoverArt } from './CoverArt'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'
import { useFeed } from './useFeed'

type Filter = { gender: string; region: string }

/** 表紙を大きく見せる時間。拡大が見えきってから、次の状態へ進める。 */
const COVER_LIFT_DURATION_MS = 760
const COVER_LIFT_SETTLE_MS = COVER_LIFT_DURATION_MS + 120

/**
 * めくっている最中の1枚。
 *
 * 進むときは「去っていく紙」を持つ。位置はすぐ進み、下から次の紙が現れる。
 * 戻るときは「降りてくる紙」を持つ。降りきるまで位置は動かさず、
 * いま読んでいる紙を下に残しておく。そうしないと、降りてくる紙と
 * 同じ声が下にも見えてしまう。
 */
type TurningPage =
  | { kind: 'cover'; startAngle: number }
  | { kind: 'concern'; concern: DemoConcern; page: number; startAngle: number; direction: 1 | -1 }

type FeedReaderState = {
  filter: Filter
  index: number
  direction: 1 | -1
  /** 表紙を押し上げている最中か。紙束が上がりきってからめくりはじめる。 */
  coverLifting: boolean
  /** 表紙をめくり終えたか。最初の1枚は声ではなく表紙。 */
  coverOpened: boolean
  showLogin: boolean
  filtersOpen: boolean
  turning: TurningPage | null
}

type FeedReaderAction =
  | { type: 'coverLifting' }
  | { type: 'coverTurned'; turning: TurningPage | null }
  | { type: 'next'; turning: TurningPage | null }
  | { type: 'previous'; turning: TurningPage | null }
  | { type: 'filterChanged'; field: keyof Filter; value: string }
  | { type: 'filtersReset' }
  | { type: 'loginVisibilityChanged'; visible: boolean }
  | { type: 'filtersVisibilityChanged'; open: boolean }
  | { type: 'turningFinished' }

const initialFeedReaderState: FeedReaderState = {
  filter: { gender: '', region: '' },
  index: 0,
  direction: 1,
  coverLifting: false,
  coverOpened: false,
  showLogin: false,
  filtersOpen: false,
  turning: null,
}

/**
 * 戻りの紙がまだ降りきっていないときの、確定した位置。
 * 降りている途中で次の操作が来ても、位置がずれないようにする。
 */
function settledIndex(state: FeedReaderState) {
  return state.turning?.kind === 'concern' && state.turning.direction === -1
    ? state.index - 1
    : state.index
}

function feedReaderReducer(state: FeedReaderState, action: FeedReaderAction): FeedReaderState {
  switch (action.type) {
    case 'coverLifting':
      // まだ表紙のまま。ふもとの表紙操作が消える準備をして、紙束を上げる。
      return { ...state, coverLifting: true }
    case 'coverTurned':
      // 表紙はここで開く。去っていく表紙だけがめくられて残る。
      return { ...state, coverLifting: false, coverOpened: true, turning: action.turning }
    case 'next':
      return {
        ...state,
        index: settledIndex(state) + 1,
        direction: 1,
        showLogin: false,
        turning: action.turning,
      }
    case 'previous': {
      const base = settledIndex(state)
      return {
        ...state,
        index: action.turning ? base : base - 1,
        direction: -1,
        showLogin: false,
        turning: action.turning,
      }
    }
    case 'filterChanged':
      return {
        ...state,
        filter: { ...state.filter, [action.field]: action.value },
        index: 0,
        turning: null,
      }
    case 'filtersReset':
      return { ...state, filter: { gender: '', region: '' }, index: 0, turning: null }
    case 'loginVisibilityChanged':
      return { ...state, showLogin: action.visible }
    case 'filtersVisibilityChanged':
      return { ...state, filtersOpen: action.open }
    case 'turningFinished':
      return { ...state, index: settledIndex(state), turning: null }
  }
}

/** 表紙の裏。声の紙とは違う色を当てず、同じ紙として見せる。 */
const COVER_BACK_COLOR = '#a894dd'

/** めくり終えた紙をリング左側に残すときの、文字のない裏面。 */
const TURNED_BACK_COLOR = 'var(--color-surface)'

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: TurningPage) {
  return turning.kind === 'cover' ? 'cover' : `${turning.concern.id}-${turning.page}`
}

/** しぼりこみなしを表す選択肢の値。属性値とは衝突しない。 */
const ALL = '__all__'
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

function FeedTabs({ concern, showTabs }: { concern: DemoConcern; showTabs: boolean }) {
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

function FeedReaction({
  concern,
  canReact,
  onReact,
}: {
  concern: DemoConcern
  canReact: boolean
  onReact?: () => boolean
}) {
  const [sparked, setSparked] = useState(false)

  if (!canReact) return null

  return (
    <button
      type="button"
      className={`${styles.reaction} ${concern.reacted ? styles.reacted : ''} ${
        sparked ? styles.sparked : ''
      }`}
      onClick={() => {
        if (onReact?.()) setSparked(true)
      }}
      disabled={concern.reacted}
      aria-pressed={concern.reacted}
    >
      <span className={styles.stamp}>
        <CrayonHeart />
        {sparked ? <ReactionSpark /> : null}
      </span>
      <span className={styles.label}>{concern.reacted ? '寄りそいました' : 'そっと寄りそう'}</span>
      <span className={styles.count} aria-label={`${concern.reactionCount}件の反応`}>
        {concern.reactionCount}
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
  dragX = 0,
  onLinkClick,
  showTabs = true,
}: {
  concern: DemoConcern
  page: number
  /** 渡したときだけ、紙の右下にめくれた角を出す。めくられている最中の紙には出さない。 */
  onNext?: () => void
  articleRef?: RefCallback<HTMLElement>
  dragX?: number
  onLinkClick?: (event: MouseEvent) => void
  /** 表紙の下に控えているあいだは、上辺のインデックスを出さない。中身の先出しになる。 */
  showTabs?: boolean
}) {
  const palette = paletteForPage(page)

  return (
    <article
      ref={articleRef}
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${turnStyles.page} ${
        dragX !== 0 ? turnStyles.pageDragging : ''
      }`}
      style={
        {
          transform: dragX < 0 ? `rotateY(${notebookAngleForDrag(dragX)}deg)` : undefined,
          '--bookmark': palette.bookmark,
          '--tag-age': palette.tagAge,
          '--tag-region': palette.tagRegion,
          '--paper-tint': palette.tint,
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
        aria-label={`${concern.body} 詳しく読む`}
        onClick={onLinkClick}
      >
        <p className={screen.body}>{concern.body}</p>
      </Link>
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
  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      <CoverArt />
      <p className={styles.coverTitle}>目安箱</p>
      <p className={styles.coverLead}>
        きょうは、
        <br />
        どんな声に会えるかな。
      </p>
    </article>
  )
}

type FeedStackProps = {
  concern: DemoConcern
  stackRef: RefObject<HTMLDivElement | null>
  index: number
  position: number
  turning: TurningPage | null
  coverOpened: boolean
  coverOpening: boolean
  dragX: number
  articleRef: RefCallback<HTMLElement>
  onNext: () => void
  onLinkClick: (event: MouseEvent) => void
  onTurningFinished: () => void
}

function FeedStack({
  concern,
  stackRef,
  index,
  position,
  turning,
  coverOpened,
  coverOpening,
  dragX,
  articleRef,
  onNext,
  onLinkClick,
  onTurningFinished,
}: FeedStackProps) {
  return (
    <div
      ref={stackRef}
      className={`${styles.stackMotion} ${coverOpening ? styles.stackOpening : ''}`}
    >
      <div className={styles.stack} style={notebookBindingStyle}>
        <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
        <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
        {/* 奥側の線は紙に隠れ、めくった紙が離れると2枚の間に見える。 */}
        <NotebookBinding part="rear" />
        {/* めくり終えた紙は捨てず、最終フレームの姿勢のままリング左側に残す。 */}
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
        {turning ? <NotebookBinding key={turningKey(turning)} part="rear" between /> : null}
        {turning ? (
          <NotebookTurn
            key={turningKey(turning)}
            variant={turning.kind === 'cover' ? 'cover' : 'page'}
            startAngle={turning.startAngle}
            direction={turning.kind === 'concern' ? turning.direction : 1}
            backColor={
              turning.kind === 'concern' ? paletteForPage(turning.page).back : COVER_BACK_COLOR
            }
            onFinish={onTurningFinished}
          >
            {turning.kind === 'concern' ? (
              <FeedCard concern={turning.concern} page={turning.page} />
            ) : (
              <FeedCover />
            )}
          </NotebookTurn>
        ) : null}
        {/*
         * 表紙が開くまでは、表紙が一番上の紙。声の紙はその下に控えている。
         * 戻りのめくりが降りている間は、いま読んでいる紙をここに残す。
         */}
        {coverOpened ? (
          <div key={`${concern.id}-${index}`} className={styles.enter}>
            <FeedCard
              concern={concern}
              page={position + 1}
              onNext={onNext}
              articleRef={articleRef}
              dragX={dragX}
              onLinkClick={onLinkClick}
            />
          </div>
        ) : (
          <>
            <div className={`${styles.enter} ${styles.coverUnderlay}`} aria-hidden="true">
              <FeedCard concern={concern} page={position + 1} showTabs={false} />
            </div>
            <div className={styles.coverLayer}>
              <FeedCover />
            </div>
          </>
        )}
        {/* 手前側の線は金具として動かさない。 */}
        <NotebookBinding part="front" />
      </div>
    </div>
  )
}

function FeedEmpty({ onReset }: { onReset: () => void }) {
  return (
    <div className={styles.empty}>
      <p>選んだ条件の声は、まだありません。</p>
      <button type="button" className={actionStyles.secondary} onClick={onReset}>
        すべての声を読む
      </button>
    </div>
  )
}

type FeedStageProps = Omit<FeedStackProps, 'concern'> & {
  concern: DemoConcern | undefined
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
        届いた声を読む
      </h1>
      {concern ? <FeedStack concern={concern} {...stackProps} /> : <FeedEmpty onReset={onReset} />}
    </section>
  )
}

type FilterOption = { value: string; label: string }

function FeedActions({
  showLogin,
  concern,
  canReact,
  coverOpening,
  filtersOpen,
  activeFilter,
  filter,
  genderOptions,
  regionOptions,
  onNext,
  onReact,
  onFiltersToggle,
  onFilterChange,
}: {
  showLogin: boolean
  concern: DemoConcern | undefined
  canReact: boolean
  /** 表紙を開きはじめたか。表紙を開く操作を表示し終えた状態。 */
  coverOpening: boolean
  filtersOpen: boolean
  activeFilter: string
  filter: Filter
  genderOptions: FilterOption[]
  regionOptions: FilterOption[]
  onNext: () => void
  onReact: () => boolean
  onFiltersToggle: (open: boolean) => void
  onFilterChange: (field: keyof Filter, value: string) => void
}) {
  return (
    <div className={styles.actions}>
      {showLogin ? <LoginGuide /> : null}
      {concern && coverOpening ? (
        <FeedReaction concern={concern} canReact={canReact} onReact={onReact} />
      ) : null}
      {concern && !coverOpening ? (
        <div className={styles.coverOpenSlot}>
          <button
            type="button"
            className={`${actionStyles.primary} ${styles.coverButton}`}
            onClick={onNext}
          >
            めくってみる <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
      <details
        className={styles.filters}
        open={filtersOpen}
        onToggle={(event) => onFiltersToggle(event.currentTarget.open)}
      >
        <summary>
          <span>{activeFilter ? 'えらんだ条件' : '性別・地域でえらぶ'}</span>
          {activeFilter ? <span className={styles.filterValue}>{activeFilter}</span> : null}
        </summary>
        <div className={styles.filterFields} aria-label="読む声の条件">
          <SelectField
            label="性別"
            placement="up"
            value={filter.gender || ALL}
            options={genderOptions}
            onChange={(value) => onFilterChange('gender', value === ALL ? '' : value)}
          />
          <SelectField
            label="地域"
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

export function FeedPage() {
  const { concerns: demoConcerns } = useDemoState()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [reader, dispatch] = useReducer(feedReaderReducer, initialFeedReaderState)
  const { filter, index, coverLifting, coverOpened, showLogin, filtersOpen, turning } = reader
  /** 表紙を開く操作が始まった時点で、ふもとの操作スペースが消える。 */
  const coverOpening = coverLifting || coverOpened

  const backendMode = isBackendDevMode
  const apiFeed = useFeed({
    enabled: backendMode,
    sort: 'newest',
    gender: genderCodeForLabel(filter.gender),
    regionCode: regionCodeForLabel(filter.region),
  })
  const apiConcerns = useMemo(
    () => apiFeed.items.map((item) => toDemoConcern(item)),
    [apiFeed.items],
  )
  const concerns = useMemo(
    () => (backendMode && apiFeed.status === 'success' ? apiConcerns : demoConcerns),
    [apiConcerns, apiFeed.status, backendMode, demoConcerns],
  )

  const genderOptions = [
    { value: ALL, label: 'すべて' },
    ...[
      ...new Set(
        concerns
          .map((concern) => concern.gender)
          .filter((value): value is string => Boolean(value)),
      ),
    ].map((gender) => ({
      value: gender,
      label: gender,
    })),
  ]
  const regionOptions = [
    { value: ALL, label: 'すべて' },
    ...[
      ...new Set(
        concerns
          .map((concern) => concern.region)
          .filter((value): value is string => Boolean(value)),
      ),
    ].map((region) => ({ value: region, label: region })),
  ]
  const filtered = useMemo(
    () =>
      concerns.filter(
        (concern) =>
          (!filter.gender || concern.gender === filter.gender) &&
          (!filter.region || concern.region === filter.region),
      ),
    [concerns, filter.gender, filter.region],
  )
  const total = filtered.length
  const position = total ? ((index % total) + total) % total : 0
  const baseConcern = filtered[position]
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const reaction = useConcernReaction({
    concernId: baseConcern?.id ?? '',
    initialReactionCount: baseConcern?.reactionCount ?? 0,
    initialReacted: baseConcern?.reacted ?? false,
  })
  const concern = useMemo(
    () =>
      baseConcern && backendMode
        ? {
            ...baseConcern,
            reactionCount: reaction.reactionCount,
            reacted: reaction.reacted,
          }
        : baseConcern,
    [backendMode, baseConcern, reaction.reacted, reaction.reactionCount],
  )
  useConcernViewOnDisplay(
    backendMode && isLiff && authStatus === 'authenticated' ? baseConcern?.id : undefined,
  )
  const articleRef = useDemoViewed(
    baseConcern?.id,
    !backendMode && isLiff && authStatus === 'authenticated',
  )
  const activeFilter = [filter.gender, filter.region].filter(Boolean).join(' · ')

  const { stackRef, rememberStackPosition } = useStackLift(
    coverOpening,
    () => undefined,
    COVER_LIFT_DURATION_MS,
  )

  useEffect(() => {
    if (!coverLifting || prefersReducedMotion()) return

    // feed は表紙の拡大を見せることを優先し、transitionend の早い通知には依存しない。
    const timer = window.setTimeout(() => {
      dispatch({ type: 'coverTurned', turning: { kind: 'cover', startAngle: 0 } })
    }, COVER_LIFT_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [coverLifting])

  const goNext = useCallback(
    (startAngle = 0) => {
      // 表紙が残っているうちは、めくる相手は声ではなく表紙。
      if (!coverOpened) {
        if (prefersReducedMotion()) {
          dispatch({ type: 'coverTurned', turning: null })
          return
        }
        // 表紙を閉じた状態からのスワイプも、まず紙束を大きく見せる。
        // 入口ごとに開始条件を分けると、feed だけ拡大途中でめくれ始めるため、
        // 表紙の角度は最初のめくりでは使わず、同じ待機経路にそろえる。
        if (startAngle !== 0) {
          if (!coverLifting) {
            rememberStackPosition()
            dispatch({ type: 'coverLifting' })
          }
          return
        }
        // ボタンから開くときは、まず紙束を押し上げる。めくるのはそのあと。
        if (!coverLifting) {
          rememberStackPosition()
          dispatch({ type: 'coverLifting' })
        }
        return
      }
      // いま読んでいる紙をめくって去らせ、その下から次の紙が現れる。
      dispatch({
        type: 'next',
        turning:
          concern && !prefersReducedMotion()
            ? { kind: 'concern', concern, page: position + 1, startAngle, direction: 1 }
            : null,
      })
    },
    [concern, coverLifting, coverOpened, position, rememberStackPosition],
  )

  const goPrev = useCallback(() => {
    // 戻るときは、伏せてあった前の紙を拾い上げ、いま読んでいる紙の上へ降ろす。
    if (!coverOpened || !total) return
    const previousPosition = (((position - 1) % total) + total) % total
    const previous = filtered[previousPosition]
    dispatch({
      type: 'previous',
      turning:
        previous && !prefersReducedMotion()
          ? {
              kind: 'concern',
              concern: previous,
              page: previousPosition + 1,
              startAngle: 0,
              direction: -1,
            }
          : null,
    })
  }, [coverOpened, filtered, position, total])

  const swipe = useNotebookSwipe({
    canGoNext: true,
    canGoPrevious: coverOpened && total > 0,
    onNext: goNext,
    onPrevious: goPrev,
  })

  return (
    <DemoBoundary
      emptyTitle="まだ声が届いていません"
      emptyDescription="しばらくしてから、また読みに来てください。"
    >
      {backendMode && (apiFeed.status === 'idle' || apiFeed.status === 'loading') ? (
        <LoadingState label="届いた声を読み込んでいます…" />
      ) : backendMode && apiFeed.status === 'error' ? (
        <ErrorState
          description={apiFeed.error ?? '投稿を読み込めませんでした。'}
          onRetry={() => void apiFeed.retry()}
        />
      ) : (
        <div className={styles.page}>
          <FeedStage
            concern={concern}
            stackRef={stackRef}
            index={index}
            position={position}
            turning={turning}
            coverOpened={coverOpened}
            coverOpening={coverOpening}
            dragX={swipe.dragX}
            articleRef={articleRef}
            onNext={goNext}
            onLinkClick={swipe.handleLinkClick}
            onTurningFinished={() => dispatch({ type: 'turningFinished' })}
            onReset={() => dispatch({ type: 'filtersReset' })}
            onTouchStart={swipe.handleTouchStart}
            onTouchMove={swipe.handleTouchMove}
            onTouchEnd={swipe.handleTouchEnd}
            onTouchCancel={swipe.handleTouchCancel}
          />
          <FeedActions
            showLogin={showLogin}
            concern={concern}
            canReact={isLiff}
            coverOpening={coverOpening}
            filtersOpen={filtersOpen}
            activeFilter={activeFilter}
            filter={filter}
            genderOptions={genderOptions}
            regionOptions={regionOptions}
            onNext={goNext}
            onReact={() => {
              if (authStatus !== 'authenticated') {
                dispatch({ type: 'loginVisibilityChanged', visible: true })
                return false
              }
              if (!concern) return false
              if (backendMode) {
                void reaction.react()
              } else {
                reactToDemoConcern(concern.id)
              }
              return true
            }}
            onFiltersToggle={(open) => dispatch({ type: 'filtersVisibilityChanged', open })}
            onFilterChange={(field, value) => dispatch({ type: 'filterChanged', field, value })}
          />

          <p className={styles.srOnly} aria-live="polite">
            {concern?.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件です。` : ''}
          </p>
        </div>
      )}
    </DemoBoundary>
  )
}
