import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefCallback,
  type TouchEvent,
} from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import { SelectField } from '../../shared/components/FormFields'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { notebookBindingStyle } from '../../shared/components/notebookBindingLayout'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'

type Filter = { theme: string; region: string }

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
  /** 表紙をめくり終えたか。最初の1枚は声ではなく表紙。 */
  coverOpened: boolean
  showLogin: boolean
  filtersOpen: boolean
  dragX: number
  turning: TurningPage | null
}

type FeedReaderAction =
  | { type: 'coverTurned'; startAngle: number }
  | { type: 'next'; turning: TurningPage | null }
  | { type: 'previous'; turning: TurningPage | null }
  | { type: 'filterChanged'; field: keyof Filter; value: string }
  | { type: 'filtersReset' }
  | { type: 'loginVisibilityChanged'; visible: boolean }
  | { type: 'filtersVisibilityChanged'; open: boolean }
  | { type: 'dragChanged'; x: number }
  | { type: 'turningFinished' }

const initialFeedReaderState: FeedReaderState = {
  filter: { theme: '', region: '' },
  index: 0,
  direction: 1,
  coverOpened: false,
  showLogin: false,
  filtersOpen: false,
  dragX: 0,
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
    case 'coverTurned':
      // 表紙はすぐ開く。去っていく表紙だけがめくられて残る。
      return {
        ...state,
        coverOpened: true,
        turning: { kind: 'cover', startAngle: action.startAngle },
      }
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
      return { ...state, filter: { theme: '', region: '' }, index: 0, turning: null }
    case 'loginVisibilityChanged':
      return { ...state, showLogin: action.visible }
    case 'filtersVisibilityChanged':
      return { ...state, filtersOpen: action.open }
    case 'dragChanged':
      return { ...state, dragX: action.x }
    case 'turningFinished':
      return { ...state, index: settledIndex(state), turning: null }
  }
}

/** 表紙の裏。声の紙とは違う色を当てず、同じ紙として見せる。 */
const COVER_BACK_COLOR = '#efe6d2'

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: TurningPage) {
  return turning.kind === 'cover' ? 'cover' : `${turning.concern.id}-${turning.page}`
}

/** しぼりこみなしを表す選択肢の値。テーマ名・地域名とは衝突しない。 */
const ALL = '__all__'
/** 指を離したときに次の声へ送る距離。これ未満なら手元へ戻す。 */
const SWIPE_THRESHOLD = 56
/** 縦スクロールか横めくりかを決めるまでの遊び。 */
const SWIPE_SLOP = 8
/** 指で引いた紙をリング側で回す。裏返る手前で止める。 */
function angleForDrag(dx: number) {
  return Math.max(-72, Math.min(0, dx * 0.42))
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useFeedSwipe({
  goNext,
  goPrev,
  onDragChanged,
}: {
  goNext: (startAngle?: number) => void
  goPrev: () => void
  onDragChanged: (x: number) => void
}) {
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swiped = useRef(false)

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0]
    swiped.current = false
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
    onDragChanged(dx)
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = swipe.current
    const dx = start ? event.changedTouches[0].clientX - start.x : 0
    swipe.current = null
    onDragChanged(0)
    if (!start?.active) return
    swiped.current = true
    if (dx <= -SWIPE_THRESHOLD) goNext(angleForDrag(dx))
    else if (dx >= SWIPE_THRESHOLD) goPrev()
  }

  function handleTouchCancel() {
    swipe.current = null
    onDragChanged(0)
  }

  // めくった指が、そのまま本文リンクを開いてしまわないようにする。
  function handleLinkClick(event: MouseEvent) {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
  }

  return { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel, handleLinkClick }
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

function FeedCard({
  concern,
  page,
  onReact,
  onNext,
  canReact = false,
  articleRef,
  dragX = 0,
  onLinkClick,
}: {
  concern: DemoConcern
  page: number
  /** 実際に寄りそえたときだけ true を返す。未ログインなら false。 */
  onReact?: () => boolean
  /** 渡したときだけ、紙の右下にめくれた角を出す。めくられている最中の紙には出さない。 */
  onNext?: () => void
  canReact?: boolean
  articleRef?: RefCallback<HTMLElement>
  dragX?: number
  onLinkClick?: (event: MouseEvent) => void
}) {
  const palette = paletteForPage(page)
  // この紙を見ている間に押されたかどうか。once だけ線を散らすために持つ。
  const [sparked, setSparked] = useState(false)

  return (
    <article
      ref={articleRef}
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${
        dragX !== 0 ? styles.dragging : ''
      }`}
      style={
        {
          transform: dragX < 0 ? `rotateY(${angleForDrag(dragX)}deg)` : undefined,
          '--bookmark': palette.bookmark,
          '--tag-age': palette.tagAge,
          '--tag-region': palette.tagRegion,
          '--paper-tint': palette.tint,
        } as CSSProperties
      }
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      {/* 上辺のインデックス。テーマのしおりと、公開されている属性の付箋。 */}
      <span className={styles.tabs}>
        {concern.ageGroup ? (
          <span className={`${styles.tab} ${styles.tabAge}`}>{concern.ageGroup}</span>
        ) : null}
        {concern.region ? (
          <span className={`${styles.tab} ${styles.tabRegion}`}>{concern.region}</span>
        ) : null}
        <span className={`${styles.tab} ${styles.theme}`}>{concern.theme}</span>
      </span>
      <Link
        className={styles.storyLink}
        to={`/concerns/${encodeURIComponent(concern.id)}`}
        aria-label={`${concern.body} 詳しく読む`}
        onClick={onLinkClick}
      >
        <p className={screen.body}>{concern.body}</p>
      </Link>
      <div className={styles.cardFoot}>
        {canReact ? (
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
            <span className={styles.label}>
              {concern.reacted ? '寄りそいました' : 'そっと寄りそう'}
            </span>
            <span className={styles.count} aria-label={`${concern.reactionCount}件の反応`}>
              {concern.reactionCount}
            </span>
          </button>
        ) : null}
      </div>
      {/* めくれた角。すぐ下の「つぎの声へ」と同じ操作なので、読み上げには重ねて出さない。 */}
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

/**
 * 表紙。
 *
 * 最初の1枚を声ではなく表紙にして、読みはじめを「ノートを開く」動作にする。
 * 声そのものが読む気持ちを作るという原則は変えないので、ここに置くのは
 * 題字と短い一言だけにし、件数・日時・推薦理由は出さない。
 */
function FeedCover({ onOpen }: { onOpen?: () => void }) {
  return (
    <article className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${styles.cover}`}>
      <NotebookBinding part="holes" />
      <p className={styles.coverTitle}>目安箱</p>
      <p className={styles.coverLead}>
        きょうは、
        <br />
        どんな声に会えるかな。
      </p>
      {onOpen ? (
        <button type="button" className={styles.coverOpen} onClick={onOpen}>
          めくってみる <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </article>
  )
}

type FeedStackProps = {
  concern: DemoConcern
  index: number
  position: number
  turning: TurningPage | null
  coverOpened: boolean
  dragX: number
  isLiff: boolean
  articleRef: RefCallback<HTMLElement>
  onNext: () => void
  onCoverOpen: () => void
  onReact: () => boolean
  onLinkClick: (event: MouseEvent) => void
  onTurningFinished: () => void
}

function FeedStack({
  concern,
  index,
  position,
  turning,
  coverOpened,
  dragX,
  isLiff,
  articleRef,
  onNext,
  onCoverOpen,
  onReact,
  onLinkClick,
  onTurningFinished,
}: FeedStackProps) {
  return (
    <div className={styles.stack} style={notebookBindingStyle}>
      <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
      <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
      {/* 奥側の線は紙に隠れ、めくった紙が離れると2枚の間に見える。 */}
      <NotebookBinding part="rear" />
      {turning ? <NotebookBinding key={turningKey(turning)} part="rear" between /> : null}
      {turning ? (
        <NotebookTurn
          key={turningKey(turning)}
          startAngle={turning.startAngle}
          direction={turning.kind === 'concern' ? turning.direction : 1}
          backColor={
            turning.kind === 'concern' ? paletteForPage(turning.page).bookmark : COVER_BACK_COLOR
          }
          onFinish={onTurningFinished}
        >
          {turning.kind === 'concern' ? (
            <FeedCard concern={turning.concern} page={turning.page} canReact={isLiff} />
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
            canReact={isLiff}
            dragX={dragX}
            onLinkClick={onLinkClick}
            onReact={onReact}
          />
        </div>
      ) : (
        <>
          <div className={styles.enter} aria-hidden="true">
            <FeedCard concern={concern} page={position + 1} canReact={false} />
          </div>
          <div className={styles.coverLayer}>
            <FeedCover onOpen={onCoverOpen} />
          </div>
        </>
      )}
      {/* 手前側の線は金具として動かさない。 */}
      <NotebookBinding part="front" />
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
  filtersOpen,
  activeFilter,
  filter,
  themeOptions,
  regionOptions,
  onNext,
  onFiltersToggle,
  onFilterChange,
}: {
  showLogin: boolean
  concern: DemoConcern | undefined
  filtersOpen: boolean
  activeFilter: string
  filter: Filter
  themeOptions: FilterOption[]
  regionOptions: FilterOption[]
  onNext: () => void
  onFiltersToggle: (open: boolean) => void
  onFilterChange: (field: keyof Filter, value: string) => void
}) {
  return (
    <div className={styles.actions}>
      {showLogin ? <LoginGuide /> : null}
      {concern ? (
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.nextButton}`}
          onClick={onNext}
        >
          つぎの声へ <span aria-hidden="true">→</span>
        </button>
      ) : null}
      <details
        className={styles.filters}
        open={filtersOpen}
        onToggle={(event) => onFiltersToggle(event.currentTarget.open)}
      >
        <summary>
          <span>{activeFilter ? 'えらんだ条件' : 'テーマ・地域でえらぶ'}</span>
          {activeFilter ? <span className={styles.filterValue}>{activeFilter}</span> : null}
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className={styles.filterFields} aria-label="読む声の条件">
          <SelectField
            label="テーマ"
            placement="up"
            value={filter.theme || ALL}
            options={themeOptions}
            onChange={(value) => onFilterChange('theme', value === ALL ? '' : value)}
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
  const { concerns } = useDemoState()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [reader, dispatch] = useReducer(feedReaderReducer, initialFeedReaderState)
  const { filter, index, coverOpened, showLogin, filtersOpen, dragX, turning } = reader

  const themeOptions = [
    { value: ALL, label: 'すべて' },
    ...[...new Set(concerns.map((concern) => concern.theme))].map((theme) => ({
      value: theme,
      label: theme,
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
  const filtered = concerns.filter(
    (concern) =>
      (!filter.theme || concern.theme === filter.theme) &&
      (!filter.region || concern.region === filter.region),
  )
  const total = filtered.length
  const position = total ? ((index % total) + total) % total : 0
  const concern = filtered[position]
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const articleRef = useDemoViewed(concern?.id, isLiff && authStatus === 'authenticated')
  const activeFilter = [filter.theme, filter.region].filter(Boolean).join(' · ')

  const goNext = useCallback(
    (startAngle = 0) => {
      // 表紙が残っているうちは、めくる相手は声ではなく表紙。
      if (!coverOpened) {
        dispatch({ type: 'coverTurned', startAngle })
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
    [concern, coverOpened, position],
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

  const swipe = useFeedSwipe({
    goNext,
    goPrev,
    onDragChanged: (x) => dispatch({ type: 'dragChanged', x }),
  })

  const goNextFromKeyboard = useEffectEvent(() => goNext())

  // 指と同じ感覚で、キーボードからも前後へ送れるようにする。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') goNextFromKeyboard()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goPrev])

  return (
    <DemoBoundary
      emptyTitle="まだ声が届いていません"
      emptyDescription="しばらくしてから、また読みに来てください。"
    >
      <div className={styles.page}>
        <FeedStage
          concern={concern}
          index={index}
          position={position}
          turning={turning}
          coverOpened={coverOpened}
          dragX={dragX}
          isLiff={isLiff}
          articleRef={articleRef}
          onNext={goNext}
          onCoverOpen={() => goNext()}
          onReact={() => {
            if (authStatus !== 'authenticated') {
              dispatch({ type: 'loginVisibilityChanged', visible: true })
              return false
            }
            if (!concern) return false
            reactToDemoConcern(concern.id)
            return true
          }}
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
          concern={coverOpened ? concern : undefined}
          filtersOpen={filtersOpen}
          activeFilter={activeFilter}
          filter={filter}
          themeOptions={themeOptions}
          regionOptions={regionOptions}
          onNext={goNext}
          onFiltersToggle={(open) => dispatch({ type: 'filtersVisibilityChanged', open })}
          onFilterChange={(field, value) => dispatch({ type: 'filterChanged', field, value })}
        />

        <p className={styles.srOnly} aria-live="polite">
          {concern?.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件です。` : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
