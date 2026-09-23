import { useState, type RefCallback } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { LoginGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { reactToDemoConcern, useDemoState, type DemoConcern } from '../demo/demoStore'
import { useDemoViewed } from '../demo/useDemoViewed'

type Filter = { theme: string; region: string }

function FeedView({
  concern,
  position,
  total,
  onNext,
  onReact,
  canReact,
  showLogin,
  articleRef,
}: {
  concern: DemoConcern
  position: number
  total: number
  onNext: () => void
  onReact: () => void
  canReact: boolean
  showLogin: boolean
  articleRef: RefCallback<HTMLElement>
}) {
  return (
    <div className={screen.page}>
      <header className={screen.heading}>
        <p className={screen.eyebrow}>
          読む · {position + 1} / {total}
        </p>
        <h1>
          きょうは、
          <br />
          どんな声に会えるかな。
        </h1>
      </header>
      <article ref={articleRef} className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <span className={screen.bookmark}>{concern.theme}</span>
        <p className={screen.body}>{concern.body}</p>
        <p className={screen.meta}>
          {[concern.ageGroup, concern.region, concern.createdLabel].filter(Boolean).join(' · ')}
        </p>
        <p className={screen.meta}>{concern.reason}</p>
        <Link className={actionStyles.text} to={`/concerns/${encodeURIComponent(concern.id)}`}>
          この声を詳しく読む
        </Link>
        {canReact ? (
          <button
            type="button"
            className={actionStyles.secondary}
            onClick={onReact}
            disabled={concern.reacted}
            aria-pressed={concern.reacted}
          >
            {concern.reacted ? 'そっと寄りそいました' : 'そっと寄りそう'} · {concern.reactionCount}
            件
          </button>
        ) : null}
      </article>
      <p aria-live="polite" className={screen.muted}>
        {concern.reacted ? `そっと寄りそいました。現在${concern.reactionCount}件` : ''}
      </p>
      {showLogin ? <LoginGuide /> : null}
      <button
        type="button"
        className={`${actionStyles.primary} ${screen.fullButton}`}
        onClick={onNext}
      >
        つぎの声
      </button>
    </div>
  )
}

export function FeedPage() {
  const { concerns } = useDemoState()
  const { state: runtime } = useRuntime()
  const { status: authStatus } = useAuth()
  const [filter, setFilter] = useState<Filter>({ theme: '', region: '' })
  const [index, setIndex] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const themes = [...new Set(concerns.map((concern) => concern.theme))]
  const regions = [
    ...new Set(
      concerns.map((concern) => concern.region).filter((value): value is string => Boolean(value)),
    ),
  ]
  const filtered = concerns.filter(
    (concern) =>
      (!filter.theme || concern.theme === filter.theme) &&
      (!filter.region || concern.region === filter.region),
  )
  const concern = filtered[index % filtered.length]
  const isLiff = runtime.status === 'ready' && runtime.mode === 'liff'
  const articleRef = useDemoViewed(concern?.id, isLiff && authStatus === 'authenticated')

  return (
    <DemoBoundary
      emptyTitle="まだ声が届いていません"
      emptyDescription="しばらくしてから、また読みに来てください。"
    >
      <div className={screen.page}>
        <button
          type="button"
          className={actionStyles.text}
          onClick={() => setFiltersOpen((current) => !current)}
          aria-expanded={filtersOpen}
        >
          条件を選ぶ{filter.theme || filter.region ? '（絞り込み中）' : ''}
        </button>
        {filtersOpen ? (
          <section className={screen.stack} aria-label="読む声の条件">
            <label className={screen.field}>
              テーマ
              <select
                value={filter.theme}
                onChange={(event) => {
                  setFilter((current) => ({ ...current, theme: event.target.value }))
                  setIndex(0)
                }}
              >
                <option value="">すべて</option>
                {themes.map((theme) => (
                  <option key={theme}>{theme}</option>
                ))}
              </select>
            </label>
            <label className={screen.field}>
              地域
              <select
                value={filter.region}
                onChange={(event) => {
                  setFilter((current) => ({ ...current, region: event.target.value }))
                  setIndex(0)
                }}
              >
                <option value="">すべて</option>
                {regions.map((region) => (
                  <option key={region}>{region}</option>
                ))}
              </select>
            </label>
          </section>
        ) : null}
        {concern ? (
          <FeedView
            concern={concern}
            position={index % filtered.length}
            total={filtered.length}
            onNext={() => {
              setIndex((current) => current + 1)
              setShowLogin(false)
            }}
            onReact={() => {
              if (authStatus !== 'authenticated') setShowLogin(true)
              else reactToDemoConcern(concern.id)
            }}
            canReact={isLiff}
            showLogin={showLogin}
            articleRef={articleRef}
          />
        ) : (
          <div className={screen.page}>
            <p>選んだ条件の声はまだありません。</p>
            <button
              type="button"
              className={actionStyles.secondary}
              onClick={() => setFilter({ theme: '', region: '' })}
            >
              条件を解除する
            </button>
          </div>
        )}
      </div>
    </DemoBoundary>
  )
}
