import { useCallback, useEffect, useEffectEvent, useReducer } from 'react'
import { prefersReducedMotion, useNotebookSwipe } from '../../shared/hooks/useNotebookSwipe'
import { useStackLift } from '../../shared/hooks/useStackLift'
import { useFeed, type UseFeedOptions } from './useFeed'
import { toFeedConcern } from './feedViewModel'
import type { FeedConcern, FeedFilter } from './feedViewModel'
import type { FeedTheme } from './clusterApi'

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
export type TurningPage =
  | { kind: 'cover'; startAngle: number }
  | { kind: 'concern'; concern: FeedConcern; page: number; startAngle: number; direction: 1 | -1 }

type FeedReaderState = {
  filter: FeedFilter
  theme: FeedTheme | null
  themePickerOpen: boolean
  index: number
  direction: 1 | -1
  /** 取得中に開く操作を受け付けたか。取得後に自動で開く。 */
  openRequested: boolean
  /** 表紙を押し上げている最中か。紙束が上がりきってからめくりはじめる。 */
  coverLifting: boolean
  /** 表紙をめくり終えたか。最初の1枚は声ではなく表紙。 */
  coverOpened: boolean
  showLogin: boolean
  filtersOpen: boolean
  turning: TurningPage | null
}

type FeedReaderAction =
  | { type: 'openRequested' }
  | { type: 'coverLifting' }
  | { type: 'coverTurned'; turning: TurningPage | null }
  | { type: 'next'; turning: TurningPage | null }
  | { type: 'previous'; turning: TurningPage | null }
  | { type: 'filterChanged'; field: keyof FeedFilter; value: string }
  | { type: 'filtersReset' }
  | { type: 'themeChanged'; theme: FeedTheme | null }
  | { type: 'themeMetadataLoaded'; theme: FeedTheme }
  | { type: 'themePickerChanged'; open: boolean }
  | { type: 'loginVisibilityChanged'; visible: boolean }
  | { type: 'filtersVisibilityChanged'; open: boolean }
  | { type: 'turningFinished' }

const initialFeedReaderState: FeedReaderState = {
  filter: { gender: '', region: '' },
  theme: null,
  themePickerOpen: false,
  index: 0,
  direction: 1,
  openRequested: false,
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
    case 'openRequested':
      return { ...state, openRequested: true }
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
      return {
        ...state,
        filter: { gender: '', region: '' },
        theme: null,
        index: 0,
        turning: null,
      }
    case 'themeChanged':
      return {
        ...state,
        theme: action.theme,
        themePickerOpen: false,
        index: 0,
        turning: null,
        coverOpened: true,
        coverLifting: false,
        openRequested: false,
        showLogin: false,
      }
    case 'themeMetadataLoaded':
      return { ...state, theme: action.theme }
    case 'themePickerChanged':
      return {
        ...state,
        themePickerOpen: action.open,
        index: settledIndex(state),
        turning: null,
        coverLifting: false,
      }
    case 'loginVisibilityChanged':
      return { ...state, showLogin: action.visible }
    case 'filtersVisibilityChanged':
      return { ...state, filtersOpen: action.open }
    case 'turningFinished':
      return { ...state, index: settledIndex(state), turning: null }
  }
}

/**
 * Intent: 紙めくり、表紙のアニメーション、フィードの位置操作を局所化する。
 * Boundary: 取得条件を受け取り、読者用の表示値・操作と通信状態を返す。reducerは公開しない。
 * State modeling: reducerの状態遷移と、めくり・スワイプの副作用を画面本体から分離する。
 * Update surface: 次へ、めくり完了、フィルタ変更・初期化、ログイン案内・フィルタの開閉、リアクション反映。
 * Hidden complexity: 表紙の待ち合わせ、戻り位置の確定、フィルタ変更時の取得を隠す。
 * Composition: useFeedの取得結果と紙めくりを合成し、FeedPageへ渡す。
 * Test notes: 取得中の開く操作、前後移動、フィルタ変更、追加取得失敗を確認する。
 */
type UseFeedReaderOptions = Omit<UseFeedOptions, 'gender' | 'regionCode'> & {
  initialTheme?: FeedTheme | null
}

export function useFeedReader(options: UseFeedReaderOptions) {
  const { initialTheme = null, ...feedOptions } = options
  const [state, dispatch] = useReducer(feedReaderReducer, {
    ...initialFeedReaderState,
    theme: initialTheme,
  })
  const feed = useFeed({
    ...feedOptions,
    clusterId: state.theme?.id,
    gender: state.filter.gender || undefined,
    regionCode: state.filter.region || undefined,
  })
  const concerns = feed.items.map((item) => toFeedConcern(item, options.language ?? 'original'))
  const {
    filter,
    index,
    coverLifting,
    coverOpened,
    showLogin,
    filtersOpen,
    turning,
    themePickerOpen,
  } = state
  const { hasMore, status: feedStatus, loadMore } = feed
  const coverOpening = coverLifting || coverOpened
  const total = concerns.length
  const position = total ? ((index % total) + total) % total : 0
  const concern = concerns[position]

  useEffect(() => {
    const selectedTheme = state.theme
    if (!selectedTheme) return
    const cluster = feed.items.find((item) => item.cluster?.id === selectedTheme.id)?.cluster
    if (cluster?.label && cluster.summary && cluster.label !== selectedTheme.label) {
      dispatch({
        type: 'themeMetadataLoaded',
        theme: { id: cluster.id, label: cluster.label, summary: cluster.summary },
      })
    }
  }, [dispatch, feed.items, state.theme])

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
  }, [coverLifting, dispatch])

  const goNext = useCallback(
    (startAngle = 0) => {
      if (
        !coverOpened &&
        (feedStatus === 'idle' || feedStatus === 'loading' || feedStatus === 'error')
      ) {
        dispatch({ type: 'openRequested' })
        return
      }
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
      if (position === total - 1 && hasMore && feedStatus !== 'loadingMore') {
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
      dispatch,
      feedStatus,
      hasMore,
      loadMore,
      position,
      rememberStackPosition,
      total,
    ],
  )

  const openWhenReady = useEffectEvent(() => goNext())
  useEffect(() => {
    if (state.openRequested && !coverOpening && feedStatus === 'success') openWhenReady()
  }, [state.openRequested, coverOpening, feedStatus])

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
  }, [concerns, coverOpened, dispatch, position, total])

  const swipe = useNotebookSwipe({
    canGoNext: !themePickerOpen,
    canGoPrevious: !themePickerOpen && coverOpened && total > 0,
    onNext: goNext,
    onPrevious: goPrev,
  })

  const onTurningFinished = useCallback(() => {
    dispatch({ type: 'turningFinished' })
  }, [dispatch])
  const onReset = useCallback(() => {
    dispatch({ type: 'filtersReset' })
  }, [dispatch])
  const onThemeChange = useCallback(
    (theme: FeedTheme | null) => {
      dispatch({ type: 'themeChanged', theme })
    },
    [dispatch],
  )
  const onThemePickerToggle = useCallback(
    (open: boolean) => {
      dispatch({ type: 'themePickerChanged', open })
    },
    [dispatch],
  )
  const onLoginVisibilityChange = useCallback(
    (visible: boolean) => {
      dispatch({ type: 'loginVisibilityChanged', visible })
    },
    [dispatch],
  )
  const onFiltersToggle = useCallback(
    (open: boolean) => {
      dispatch({ type: 'filtersVisibilityChanged', open })
    },
    [dispatch],
  )
  const onFilterChange = useCallback(
    (field: keyof FeedFilter, value: string) => {
      dispatch({ type: 'filterChanged', field, value })
    },
    [dispatch],
  )

  const showInitialLoading = feedStatus === 'idle' || (feedStatus === 'loading' && total === 0)
  const showInitialError =
    feedStatus === 'error' && total === 0 && (state.openRequested || coverOpened)

  return {
    feedStatus: feed.status,
    feedError: feed.error,
    retry: feed.retry,
    showInitialLoading,
    showInitialError,
    waitingToOpen: state.openRequested && showInitialLoading,
    filter,
    theme: state.theme,
    themePickerOpen,
    index,
    coverLifting,
    coverOpened,
    showLogin,
    filtersOpen,
    turning,
    coverOpening,
    total,
    position,
    concern,
    stackRef,
    swipe,
    goNext,
    onTurningFinished,
    onReset,
    onThemeChange,
    onThemePickerToggle,
    onLoginVisibilityChange,
    onFiltersToggle,
    onFilterChange,
    applyReaction: feed.applyReaction,
  }
}
