import {
  useCallback,
  useEffect,
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
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'
import { paletteForPage } from './themePalette'
import styles from './FeedPage.module.css'

type Filter = { theme: string; region: string }

/** しぼりこみなしを表す選択肢の値。テーマ名・地域名とは衝突しない。 */
const ALL = '__all__'
/** 指を離したときに次の声へ送る距離。これ未満なら手元へ戻す。 */
const SWIPE_THRESHOLD = 56
/** 縦スクロールか横めくりかを決めるまでの遊び。 */
const SWIPE_SLOP = 8
/** とじリングの本数。紙の高さに合わせて等間隔に置く。 */
const RING_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7]

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
  const attributes = [concern.ageGroup, concern.region].filter(Boolean).join(' · ')
  const palette = paletteForPage(page)

  return (
    <article
      ref={articleRef}
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${
        dragX !== 0 ? styles.dragging : ''
      }`}
      style={
        {
          transform: `translateX(${dragX * 0.72}px) rotate(${dragX * 0.016}deg)`,
          '--bookmark': palette.bookmark,
          '--paper-tint': palette.tint,
        } as CSSProperties
      }
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <span className={styles.holes} aria-hidden="true">
        {RING_SLOTS.map((slot) => (
          <span key={slot} className={styles.hole} />
        ))}
      </span>
      <span className={styles.theme}>{concern.theme}</span>
      <Link
        className={styles.storyLink}
        to={`/concerns/${encodeURIComponent(concern.id)}`}
        aria-label={`${concern.body} 詳しく読む`}
        onClick={onLinkClick}
      >
        <p className={screen.body}>{concern.body}</p>
      </Link>
      <div className={styles.cardFoot}>
        {attributes ? <p className={styles.attributes}>{attributes}</p> : null}
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
  const [filter, setFilter] = useState<Filter>({ theme: '', region: '' })
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [showLogin, setShowLogin] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dragX, setDragX] = useState(0)
  /** いまめくられている最中の1枚。裏返り終わるまで、新しい紙の上に重ねて描く。 */
  const [turning, setTurning] = useState<{ concern: DemoConcern; page: number } | null>(null)
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

  const goNext = useCallback(() => {
    // いま読んでいる紙をめくって去らせ、その下から次の紙が現れる。
    setTurning(concern && !prefersReducedMotion() ? { concern, page: position + 1 } : null)
    setDirection(1)
    setIndex((current) => current + 1)
    setShowLogin(false)
  }, [concern, position])

  const goPrev = useCallback(() => {
    // 戻るときは、めくった紙が left 側から降りてくる。去る紙はない。
    setTurning(null)
    setDirection(-1)
    setIndex((current) => current - 1)
    setShowLogin(false)
  }, [])

  // 指と同じ感覚で、キーボードからも前後へ送れるようにする。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') goNext()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goNext, goPrev])

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
    swiped.current = true
    if (dx <= -SWIPE_THRESHOLD) goNext()
    else if (dx >= SWIPE_THRESHOLD) goPrev()
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
          onTouchCancel={handleTouchEnd}
        >
          <h1 id="feed-title" className={styles.srOnly}>
            届いた声を読む
          </h1>
          {concern ? (
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
                  key={`${turning.concern.id}-${turning.page}`}
                  className={styles.turning}
                  aria-hidden="true"
                  // 影の animationend も上がってくるので、紙そのものの終わりだけを見る。
                  onAnimationEnd={(event) => {
                    if (event.target === event.currentTarget) setTurning(null)
                  }}
                >
                  <div className={styles.face}>
                    <FeedCard concern={turning.concern} page={turning.page} canReact={isLiff} />
                  </div>
                  <div className={`${styles.back} ${crayonStyles.edge}`}>
                    <span className={`${styles.holes} ${styles.holesBack}`} aria-hidden="true">
                      {RING_SLOTS.map((slot) => (
                        <span key={slot} className={styles.hole} />
                      ))}
                    </span>
                  </div>
                </div>
              ) : null}
              <div
                key={`${concern.id}-${index}`}
                className={`${styles.enter} ${direction < 0 ? styles.fromLeft : ''}`}
              >
                <FeedCard
                  concern={concern}
                  page={position + 1}
                  onNext={goNext}
                  articleRef={articleRef}
                  canReact={isLiff}
                  dragX={dragX}
                  onLinkClick={handleLinkClick}
                  onReact={() => {
                    if (authStatus !== 'authenticated') setShowLogin(true)
                    else reactToDemoConcern(concern.id)
                  }}
                />
              </div>
            </div>
          ) : (
            <div className={styles.empty}>
              <p>選んだ条件の声は、まだありません。</p>
              <button
                type="button"
                className={actionStyles.secondary}
                onClick={() => {
                  setFilter({ theme: '', region: '' })
                  setIndex(0)
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
              onClick={goNext}
            >
              つぎの声へ <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <details
            className={styles.filters}
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
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
                  setFilter((current) => ({ ...current, theme: value === ALL ? '' : value }))
                  setIndex(0)
                }}
              />
              <SelectField
                label="地域"
                placement="up"
                value={filter.region || ALL}
                options={regionOptions}
                onChange={(value) => {
                  setFilter((current) => ({ ...current, region: value === ALL ? '' : value }))
                  setIndex(0)
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
