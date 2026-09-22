import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { CrayonFilters } from '../shared/components/CrayonFilters'
import { EmptyState, ErrorState, LoadingState } from '../shared/components/AsyncStates'
import { AppShell } from './AppShell'
import { useRuntime } from './providers/RuntimeContext'

export function AppLayout() {
  const { state } = useRuntime()
  const location = useLocation()
  const crayonFilters = <CrayonFilters key={location.key} />

  if (state.status === 'initializing') {
    return (
      <>
        {crayonFilters}
        <main className="standalone-page">
          <LoadingState label="目安箱を準備しています…" />
        </main>
      </>
    )
  }

  if (state.status === 'failed') {
    return (
      <>
        {crayonFilters}
        <main className="standalone-page">
          <ErrorState
            title="LINEを準備できませんでした"
            description="LINEミニアプリで開き直してください。"
          />
        </main>
      </>
    )
  }

  return (
    <>
      {crayonFilters}
      {state.mode === 'liff' ? (
        <AppShell />
      ) : (
        <main className="standalone-page">
          <Outlet />
        </main>
      )}
    </>
  )
}

export function PublicPlaceholder({ detail = false }: { detail?: boolean }) {
  return (
    <EmptyState
      title={detail ? 'この声を準備しています' : '声を読む準備中です'}
      description={detail ? '投稿詳細はこれから表示されます。' : 'ここに、みんなから届いた声が並びます。'}
    />
  )
}

export function OpenInLiffGuide() {
  const { liffUrl } = useRuntime()
  const location = useLocation()
  const target = liffUrl(location.pathname)

  return (
    <section className="guide-card">
      <p className="eyebrow">目安箱</p>
      <h1>この操作は、LINEミニアプリで使えます。</h1>
      <p>投稿やクイズは、LINEの中で安心して続けられます。</p>
      {target ? (
        <a className="primary-button" href={target}>
          LINEミニアプリで開く
        </a>
      ) : (
        <p className="guide-note">LIFF ID を設定すると、ここからLINEミニアプリを開けます。</p>
      )}
      <Link className="text-button" to="/">
        読むだけ続ける
      </Link>
    </section>
  )
}

export function LoginGuide() {
  const { login } = useAuth()

  return (
    <section className="guide-card">
      <p className="eyebrow">LINEで続ける</p>
      <h1>この操作は、LINEでログインしてから使えます。</h1>
      <p>LINEの名前や画像は公開されず、投稿は匿名で表示されます。</p>
      <button type="button" className="primary-button" onClick={() => void login()}>
        LINEで続ける
      </button>
      <Link className="text-button" to="/">
        読むだけ続ける
      </Link>
    </section>
  )
}

export function ProtectedPlaceholder({ title, description }: { title: string; description: string }) {
  const { state } = useRuntime()
  const { status } = useAuth()

  if (state.status !== 'ready') return null
  if (state.mode === 'browser') return <OpenInLiffGuide />
  if (status === 'initializing') {
    return (
      <main className="standalone-page">
        <LoadingState label="ログイン状態を確認しています…" />
      </main>
    )
  }
  if (status === 'anonymous') return <LoginGuide />
  return <EmptyState title={title} description={description} />
}

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <ErrorState
      title="ページが見つかりません"
      description="もう一度、読みたい声を選んでください。"
      onRetry={() => navigate('/')}
    />
  )
}

export function RouteErrorBoundary() {
  const navigate = useNavigate()

  return (
    <main className="standalone-page">
      <ErrorState
        title="画面を表示できませんでした"
        description="一時的な問題が起きました。最初の画面からもう一度お試しください。"
        onRetry={() => navigate('/')}
      />
    </main>
  )
}
