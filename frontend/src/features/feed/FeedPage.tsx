import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
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
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'

type Filter = { theme: string; region: string }

type TurningConcern = { concern: DemoConcern; page: number; startAngle: number }
type FeedReaderState = {
  filter: Filter
  index: number
  direction: 1 | -1
  showLogin: boolean
  filtersOpen: boolean
  dragX: number
  turning: TurningConcern | null
}

type FeedReaderAction =
  | { type: 'next'; turning: TurningConcern | null }
  | { type: 'previous' }
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
  showLogin: false,
  filtersOpen: false,
  dragX: 0,
  turning: null,
}

function feedReaderReducer(state: FeedReaderState, action: FeedReaderAction): FeedReaderState {
  switch (action.type) {
    case 'next':
      return {
        ...state,
        index: state.index + 1,
        direction: 1,
        showLogin: false,
        turning: action.turning,
      }
    case 'previous':
      return {
        ...state,
        index: state.index - 1,
        direction: -1,
        showLogin: false,
        turning: null,
      }
    case 'filterChanged':
      return {
        ...state,
        filter: { ...state.filter, [action.field]: action.value },
        index: 0,
      }
    case 'filtersReset':
      return { ...state, filter: { theme: '', region: '' }, index: 0 }
    case 'loginVisibilityChanged':
      return { ...state, showLogin: action.visible }
    case 'filtersVisibilityChanged':
      return { ...state, filtersOpen: action.open }
    case 'dragChanged':
      return { ...state, dragX: action.x }
    case 'turningFinished':
      return { ...state, turning: null }
  }
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
  onReact?: () => void
  /** 渡したときだけ、紙の右下にめくれた角を出す。めくられている最中の紙には出さない。 */
  onNext?: () => void
  canReact?: boolean
  articleRef?: RefCallback<HTMLElement>
  dragX?: number
  onLinkClick?: (event: MouseEvent) => void
}) {
  const palette = paletteForPage(page)

  return (
    <article
      ref={articleRef}
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${
        dragX !== 0 ? styles.dragging : ''
      }`}
      style={
        {
          transform:
            dragX < 0 ? `perspective(1350px) rotateY(${angleForDrag(dragX)}deg)` : undefined,
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
            className={styles.reaction}
            onClick={onReact}
            disabled={concern.reacted}
            aria-pressed={concern.reacted}
          >
            <span className={styles.heart} aria-hidden="true">
              {concern.reacted ? '♥' : '♡'}
            </span>
            {concern.reacted ? '寄りそいました' : 'そっと寄りそう'}
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

export function FeedPage() {
  const { concerns } = useDemoState()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [reader, dispatch] = useReducer(feedReaderReducer, initialFeedReaderState)
  const { filter, index, direction, showLogin, filtersOpen, dragX, turning } = reader
  const swipe = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swiped = useRef(false)

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
      // いま読んでいる紙をめくって去らせ、その下から次の紙が現れる。
      dispatch({
        type: 'next',
        turning:
          concern && !prefersReducedMotion() ? { concern, page: position + 1, startAngle } : null,
      })
    },
    [concern, position],
  )

  const goPrev = useCallback(() => {
    // 戻るときは、めくった紙が left 側から降りてくる。去る紙はない。
    dispatch({ type: 'previous' })
  }, [])

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
    dispatch({ type: 'dragChanged', x: dx })
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = swipe.current
    const dx = start ? event.changedTouches[0].clientX - start.x : 0
    swipe.current = null
    dispatch({ type: 'dragChanged', x: 0 })
    if (!start?.active) return
    swiped.current = true
    if (dx <= -SWIPE_THRESHOLD) goNext(angleForDrag(dx))
    else if (dx >= SWIPE_THRESHOLD) goPrev()
  }

  function handleTouchCancel() {
    swipe.current = null
    dispatch({ type: 'dragChanged', x: 0 })
  }

  // めくった指が、そのまま本文リンクを開いてしまわないようにする。
  function handleLinkClick(event: MouseEvent) {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
  }

  return (
    <DemoBoundary
      emptyTitle="まだ声が届いていません"
      emptyDescription="しばらくしてから、また読みに来てください。"
    >
      <div className={styles.page}>
        <section
          className={styles.stage}
          aria-labelledby="feed-title"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          <h1 id="feed-title" className={styles.srOnly}>
            届いた声を読む
          </h1>
          {concern ? (
            <div className={styles.stack} style={notebookBindingStyle}>
              <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
              <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
              {/* 奥側の線は紙に隠れ、めくった紙が離れると2枚の間に見える。 */}
              <NotebookBinding part="rear" />
              {turning ? (
                <NotebookBinding
                  key={`${turning.concern.id}-${turning.page}`}
                  part="rear"
                  between
                />
              ) : null}
              {turning ? (
                <NotebookTurn
                  key={`${turning.concern.id}-${turning.page}`}
                  startAngle={turning.startAngle}
                  backColor={paletteForPage(turning.page).bookmark}
                  onFinish={() => dispatch({ type: 'turningFinished' })}
                >
                  <FeedCard concern={turning.concern} page={turning.page} canReact={isLiff} />
                </NotebookTurn>
              ) : null}
              <div
                key={`${concern.id}-${index}`}
                className={`${styles.enter} ${direction < 0 ? turnStyles.fromLeft : ''}`}
              >
                <FeedCard
                  concern={concern}
                  page={position + 1}
                  onNext={() => goNext()}
                  articleRef={articleRef}
                  canReact={isLiff}
                  dragX={dragX}
                  onLinkClick={handleLinkClick}
                  onReact={() => {
                    if (authStatus !== 'authenticated')
                      dispatch({ type: 'loginVisibilityChanged', visible: true })
                    else reactToDemoConcern(concern.id)
                  }}
                />
              </div>
              {/* 手前側の線は金具として動かさない。 */}
              <NotebookBinding part="front" />
            </div>
          ) : (
            <div className={styles.empty}>
              <p>選んだ条件の声は、まだありません。</p>
              <button
                type="button"
                className={actionStyles.secondary}
                onClick={() => {
                  dispatch({ type: 'filtersReset' })
                }}
              >
                すべての声を読む
              </button>
            </div>
          )}
        </section>

        <div className={styles.actions}>
          {showLogin ? <LoginGuide /> : null}
          {concern ? (
            <button
              type="button"
              className={`${actionStyles.primary} ${styles.nextButton}`}
              onClick={() => goNext()}
            >
              つぎの声へ <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <details
            className={styles.filters}
            open={filtersOpen}
            onToggle={(event) =>
              dispatch({
                type: 'filtersVisibilityChanged',
                open: event.currentTarget.open,
              })
            }
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
                onChange={(value) => {
                  dispatch({
                    type: 'filterChanged',
                    field: 'theme',
                    value: value === ALL ? '' : value,
                  })
                }}
              />
              <SelectField
                label="地域"
                placement="up"
                value={filter.region || ALL}
                options={regionOptions}
                onChange={(value) => {
                  dispatch({
                    type: 'filterChanged',
                    field: 'region',
                    value: value === ALL ? '' : value,
                  })
                }}
              />
            </div>
          </details>
        </div>

        <p className={styles.srOnly} aria-live="polite">
          {concern?.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件です。` : ''}
        </p>
      </div>
    </DemoBoundary>
  )
}
