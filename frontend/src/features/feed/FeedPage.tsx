import {
  useCallback,
  useEffectEvent,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  type TouchEvent,
} from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { ErrorState, LoadingState } from '../../shared/components/AsyncStates'
import { SelectField } from '../../shared/components/FormFields'
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
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { useConcernViewOnDisplay } from '../concern-detail/useConcernViewOnDisplay'
import type { RegionCode } from '../post/postTypes'
import { registerConcernReaction } from '../reaction/reactionApi'
import { CoverArt } from './CoverArt'
import { useFeed } from './useFeed'
import { GENDER_OPTIONS, REGION_OPTIONS, toFeedConcern } from './feedViewModel'
import type { FeedConcern } from './feedTypes'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'

type Filter = { gender: string; region: string }

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
  | { kind: 'concern'; concern: FeedConcern; page: number; startAngle: number; direction: 1 | -1 }

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
      // まだ表紙のまま。ふもとに送りボタンの居場所だけが生まれ、紙束が上がる。
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

/**
 * めくり終えて左に伏せたままの紙。
 *
 * 色は当てない。彩度はめくっている最中の演出であって、
 * 伏せたあとも残すと、読み終えた紙束がずっと視界の端で主張してしまう。
 */
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

function FeedReaction({
  concern,
  canReact,
  onReact,
}: {
  concern: FeedConcern
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
  onReact,
  onNext,
  canReact = false,
  dragX = 0,
  onLinkClick,
  showTabs = true,
}: {
  concern: FeedConcern
  page: number
  /** 実際に寄りそえたときだけ true を返す。未ログインなら false。 */
  onReact?: () => boolean
  /** 渡したときだけ、紙の右下にめくれた角を出す。めくられている最中の紙には出さない。 */
  onNext?: () => void
  canReact?: boolean
  dragX?: number
  onLinkClick?: (event: MouseEvent) => void
  /** 表紙の下に控えているあいだは、上辺のインデックスを出さない。中身の先出しになる。 */
  showTabs?: boolean
}) {
  const palette = paletteForPage(page)

  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${
        dragX !== 0 ? styles.dragging : ''
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
      <div className={styles.cardFoot}>
        <FeedReaction concern={concern} canReact={canReact} onReact={onReact} />
      </div>
      {/* めくれた角。すぐ下の「つぎの声へ」と同じ操作なので、読み上げには重ねて出さない。 */}
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
  concern: FeedConcern
  stackRef: RefObject<HTMLDivElement | null>
  index: number
  position: number
  turning: TurningPage | null
  coverOpened: boolean
  dragX: number
  isLiff: boolean
  onNext: () => void
  onReact: () => boolean
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
  dragX,
  isLiff,
  onNext,
  onReact,
  onLinkClick,
  onTurningFinished,
}: FeedStackProps) {
  return (
    <div ref={stackRef} className={styles.stack} style={notebookBindingStyle}>
      <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
      <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
      {/* 奥側の線は紙に隠れ、めくった紙が離れると2枚の間に見える。 */}
      <NotebookBinding part="rear" />
      {/*
       * めくり終えた紙は捨てず、リングの左に伏せたまま残す。
       * めくりの最終フレームと同じ姿勢なので、めくっていた紙を外しても絵が変わらない。
       */}
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
          startAngle={turning.startAngle}
          direction={turning.kind === 'concern' ? turning.direction : 1}
          backColor={
            turning.kind === 'concern' ? paletteForPage(turning.page).back : COVER_BACK_COLOR
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
            canReact={isLiff}
            dragX={dragX}
            onLinkClick={onLinkClick}
            onReact={onReact}
          />
        </div>
      ) : (
        <>
          <div className={styles.enter} aria-hidden="true">
            <FeedCard concern={concern} page={position + 1} canReact={false} showTabs={false} />
          </div>
          <div className={styles.coverLayer}>
            <FeedCover />
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
  coverOpening,
  filtersOpen,
  activeFilter,
  filter,
  genderOptions,
  regionOptions,
  onNext,
  onFiltersToggle,
  onFilterChange,
}: {
  showLogin: boolean
  concern: FeedConcern | undefined
  /** 表紙を開きはじめたか。ボタンの居場所はこの時点で生まれる。 */
  coverOpening: boolean
  filtersOpen: boolean
  activeFilter: string
  filter: Filter
  genderOptions: FilterOption[]
  regionOptions: FilterOption[]
  onNext: () => void
  onFiltersToggle: (open: boolean) => void
  onFilterChange: (field: keyof Filter, value: string) => void
}) {
  return (
    <div className={styles.actions}>
      {showLogin ? <LoginGuide /> : null}
      {concern ? (
        coverOpening ? (
          <div className={`${styles.nextSlot} ${styles.nextSlotOpen}`}>
            <div className={styles.nextSlotInner}>
              <button
                type="button"
                className={`${actionStyles.primary} ${styles.nextButton}`}
                onClick={onNext}
              >
                つぎの声へ <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.coverOpenSlot}>
            <button
              type="button"
              className={`${actionStyles.primary} ${styles.nextButton}`}
              onClick={onNext}
            >
              めくってみる <span aria-hidden="true">→</span>
            </button>
          </div>
        )
      ) : null}
      <details
        className={styles.filters}
        open={filtersOpen}
        onToggle={(event) => onFiltersToggle(event.currentTarget.open)}
      >
        <summary>
          <span>{activeFilter ? 'えらんだ条件' : '性別・地域でえらぶ'}</span>
          {activeFilter ? <span className={styles.filterValue}>{activeFilter}</span> : null}
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
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

/**
 * 紙束が押し上げられる時間。
 * 送りボタンが顔を出すまでの間（FeedPage.module.css の .nextSlotInner）と揃える。
 */
const LIFT_MS = 420

/**
 * 表紙を開くと、ふもとに送りボタンが生まれ、紙束の居場所がそのぶん上がる。
 *
 * 高さそのものを時間をかけて伸ばすと、毎フレーム版面を組み直すことになり、
 * クレヨンのふちを持つ紙が描き直されて動きがかすれる。
 * そこで組み直しは一度で終わらせ、紙束だけを元いた高さから transform で戻す。
 * 動かすのは合成だけなので、どの端末でも滑らかに上がる。
 *
 * 上がりきったら onLifted で知らせる。押し上げとめくりを重ねず、
 * 紙束が落ち着いてから表紙をめくるため。
 */
function useStackLift(open: boolean, onLifted: () => void) {
  const stackRef = useRef<HTMLDivElement | null>(null)
  const liftFrom = useRef<number | null>(null)
  const lifted = useEffectEvent(onLifted)

  /** 動かす直前の高さを控える。組み直しのあと、ここへ一度戻してから動かす。 */
  const rememberStackPosition = useCallback(() => {
    liftFrom.current = prefersReducedMotion()
      ? null
      : (stackRef.current?.getBoundingClientRect().top ?? null)
  }, [])

  // open が変わった回だけ動かす。控えた高さがなければ、何もせず見送る。
  useLayoutEffect(() => {
    const node = stackRef.current
    const from = liftFrom.current
    liftFrom.current = null
    if (!node || from === null) return

    const delta = from - node.getBoundingClientRect().top
    // 紙束が動かない画面の高さでは、戻す先も今の場所。待たせる理由もない。
    if (Math.abs(delta) < 1) {
      lifted()
      return
    }

    const onEnd = (event: TransitionEvent) => {
      // 紙の上で起きた別のうつろいは数えない。
      if (event.target !== node || event.propertyName !== 'transform') return
      node.removeEventListener('transitionend', onEnd)
      node.style.willChange = ''
      node.style.removeProperty('--lift')
      node.style.removeProperty('--lift-duration')
      lifted()
    }

    node.style.willChange = 'transform'
    node.style.setProperty('--lift', `${delta}px`)
    // ここで一度位置を確定させないと、元の高さを飛ばして新しい高さへ跳ぶ。
    void node.offsetHeight
    node.style.setProperty('--lift-duration', `${LIFT_MS}ms`)
    node.style.setProperty('--lift', '0px')
    node.addEventListener('transitionend', onEnd)
    return () => node.removeEventListener('transitionend', onEnd)
  }, [open])

  return { stackRef, rememberStackPosition }
}

export function FeedPage() {
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [reader, dispatch] = useReducer(feedReaderReducer, initialFeedReaderState)
  const [reactionOverrides, setReactionOverrides] = useState<
    Record<string, { reactionCount: number; reacted: boolean }>
  >({})
  const [reactionError, setReactionError] = useState<string | null>(null)
  const pendingNextAngle = useRef<number | null>(null)
  const { filter, index, coverLifting, coverOpened, showLogin, filtersOpen, turning } = reader
  /** 押し上げが始まった時点で、ふもとには送りボタンの居場所ができている。 */
  const coverOpening = coverLifting || coverOpened

  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const feed = useFeed({
    limit: 50,
    sort: authStatus === 'authenticated' ? 'recommended' : 'newest',
    gender: filter.gender || undefined,
    regionCode: filter.region ? (filter.region as RegionCode) : undefined,
  })
  const { hasMore: feedHasMore, loadMore } = feed
  const concerns = feed.items.map((item) => {
    const concern = toFeedConcern(item)
    return reactionOverrides[concern.id]
      ? { ...concern, ...reactionOverrides[concern.id] }
      : concern
  })
  const total = concerns.length
  const position = total ? ((index % total) + total) % total : 0
  const concern = concerns[position]
  useConcernViewOnDisplay(concern?.id, isLiff && authStatus === 'authenticated')
  const activeFilter = [
    filter.gender ? GENDER_OPTIONS.find((option) => option.value === filter.gender)?.label : null,
    filter.region ? REGION_OPTIONS.find((option) => option.value === filter.region)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const genderOptions = [{ value: ALL, label: 'すべて' }, ...GENDER_OPTIONS]
  const regionOptions = [{ value: ALL, label: 'すべて' }, ...REGION_OPTIONS]

  const { stackRef, rememberStackPosition } = useStackLift(coverOpening, () => {
    // 紙束が上がりきった。ここでようやく表紙に手をかける。
    if (coverLifting) dispatch({ type: 'coverTurned', turning: { kind: 'cover', startAngle: 0 } })
  })

  const goNext = useCallback(
    (startAngle = 0) => {
      // 表紙が残っているうちは、めくる相手は声ではなく表紙。
      if (!coverOpened) {
        if (prefersReducedMotion()) {
          dispatch({ type: 'coverTurned', turning: null })
          return
        }
        // 指がもう紙を起こしはじめているなら、その続きとしてそのままめくる。
        // 待たせると、せっかく起こした角度が寝てしまう。
        if (startAngle !== 0) {
          if (!coverLifting) rememberStackPosition()
          dispatch({ type: 'coverTurned', turning: { kind: 'cover', startAngle } })
          return
        }
        // ボタンから開くときは、まず紙束を押し上げる。めくるのはそのあと。
        if (!coverLifting) {
          rememberStackPosition()
          dispatch({ type: 'coverLifting' })
        }
        return
      }
      if (total > 0 && position === total - 1 && feedHasMore) {
        pendingNextAngle.current = startAngle
        void loadMore()
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
    [
      concern,
      coverLifting,
      coverOpened,
      feedHasMore,
      loadMore,
      position,
      rememberStackPosition,
      total,
    ],
  )

  const goPrev = useCallback(() => {
    // 戻るときは、伏せてあった前の紙を拾い上げ、いま読んでいる紙の上へ降ろす。
    if (!coverOpened || !total) return
    const previousPosition = (((position - 1) % total) + total) % total
    const previous = concerns[previousPosition]
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
  }, [concerns, coverOpened, position, total])

  useEffect(() => {
    if (pendingNextAngle.current === null || feed.status === 'loadingMore') return

    const startAngle = pendingNextAngle.current
    pendingNextAngle.current = null
    if (!concern) return

    dispatch({
      type: 'next',
      turning: !prefersReducedMotion()
        ? { kind: 'concern', concern, page: position + 1, startAngle, direction: 1 }
        : null,
    })
  }, [concern, feed.items.length, feed.status, position])

  const swipe = useNotebookSwipe({
    canGoNext: true,
    canGoPrevious: coverOpened && total > 0,
    onNext: goNext,
    onPrevious: goPrev,
  })

  if (feed.status === 'loading' && feed.items.length === 0) {
    return <LoadingState label="声を読み込んでいます…" />
  }
  if (feed.status === 'error' && feed.items.length === 0) {
    return (
      <ErrorState
        title="声を読み込めませんでした"
        description={feed.error ?? '時間をおいて再試行してください。'}
        onRetry={() => void feed.retry()}
      />
    )
  }

  return (
    <div className={styles.page}>
      <FeedStage
        concern={concern}
        stackRef={stackRef}
        index={index}
        position={position}
        turning={turning}
        coverOpened={coverOpened}
        dragX={swipe.dragX}
        isLiff={isLiff}
        onNext={goNext}
        onReact={() => {
          if (authStatus !== 'authenticated') {
            dispatch({ type: 'loginVisibilityChanged', visible: true })
            return false
          }
          if (!concern) return false
          if (concern.reacted) return false

          const previous = {
            reactionCount: concern.reactionCount,
            reacted: concern.reacted,
          }
          setReactionError(null)
          setReactionOverrides((current) => ({
            ...current,
            [concern.id]: {
              reactionCount: previous.reactionCount + 1,
              reacted: true,
            },
          }))
          void registerConcernReaction(concern.id).then((result) => {
            if (result.ok) {
              setReactionOverrides((current) => ({
                ...current,
                [concern.id]: {
                  reactionCount: result.reaction.reactionCount,
                  reacted: result.reaction.reacted,
                },
              }))
              return
            }

            setReactionOverrides((current) => ({ ...current, [concern.id]: previous }))
            setReactionError(result.message)
          })
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
        concern={concern}
        coverOpening={coverOpening}
        filtersOpen={filtersOpen}
        activeFilter={activeFilter}
        filter={filter}
        genderOptions={genderOptions}
        regionOptions={regionOptions}
        onNext={goNext}
        onFiltersToggle={(open) => dispatch({ type: 'filtersVisibilityChanged', open })}
        onFilterChange={(field, value) => dispatch({ type: 'filterChanged', field, value })}
      />

      <p className={styles.srOnly} aria-live="polite">
        {reactionError ??
          (concern?.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件です。` : '')}
      </p>
    </div>
  )
}
