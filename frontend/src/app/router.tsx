import { createBrowserRouter, Link, Outlet, useLocation, useNavigate } from 'react-router'
import { AppShell } from './AppShell'
import { useRuntime } from './providers/RuntimeProvider'
import { EmptyState, ErrorState, LoadingState } from '../shared/components/AsyncStates'

function AppLayout() {
  const { state } = useRuntime()
  if (state.status === 'initializing') return <main className="standalone-page"><LoadingState label="目安箱を準備しています…" /></main>
  if (state.status === 'failed') return <main className="standalone-page"><ErrorState title="LINEを準備できませんでした" description="LINEミニアプリで開き直してください。" /></main>
  return state.mode === 'liff' ? <AppShell /> : <main className="standalone-page"><Outlet /></main>
}

function PublicPlaceholder({ detail = false }: { detail?: boolean }) {
  return <EmptyState title={detail ? 'この声を準備しています' : '声を読む準備中です'} description={detail ? '投稿詳細はこれから表示されます。' : 'ここに、みんなから届いた声が並びます。'} />
}

function OpenInLiffGuide() {
  const { liffUrl } = useRuntime()
  const location = useLocation()
  const target = liffUrl(location.pathname)
  return <section className="guide-card"><p className="eyebrow">目安箱</p><h1>この操作は、LINEミニアプリで使えます。</h1><p>投稿やクイズは、LINEの中で安心して続けられます。</p>{target ? <a className="primary-button" href={target}>LINEミニアプリで開く</a> : <p className="guide-note">LIFF ID を設定すると、ここからLINEミニアプリを開けます。</p>}<Link className="text-button" to="/">読むだけ続ける</Link></section>
}

function LoginGuide() {
  const { startLogin } = useRuntime()
  return <section className="guide-card"><p className="eyebrow">LINEで続ける</p><h1>この操作は、LINEでログインしてから使えます。</h1><p>LINEの名前や画像は公開されず、投稿は匿名で表示されます。</p><button type="button" className="primary-button" onClick={startLogin}>LINEで続ける</button><Link className="text-button" to="/">読むだけ続ける</Link></section>
}

function ProtectedPlaceholder({ title, description }: { title: string; description: string }) {
  const { state } = useRuntime()
  if (state.status !== 'ready') return null
  if (state.mode === 'browser') return <OpenInLiffGuide />
  if (state.auth === 'anonymous') return <LoginGuide />
  return <EmptyState title={title} description={description} />
}

function NotFoundPage() {
  const navigate = useNavigate()
  return <ErrorState title="ページが見つかりません" description="もう一度、読みたい声を選んでください。" onRetry={() => navigate('/')} />
}

export const router = createBrowserRouter([{ path: '/', Component: AppLayout, children: [
  { index: true, Component: PublicPlaceholder },
  { path: 'concerns/:id', Component: () => <PublicPlaceholder detail /> },
  { path: 'post', Component: () => <ProtectedPlaceholder title="投稿を準備しています" description="匿名で声を置く画面を準備中です。" /> },
  { path: 'quiz/today', Component: () => <ProtectedPlaceholder title="今日のクイズを準備しています" description="3つの声を読むクイズを準備中です。" /> },
  { path: 'history', Component: () => <ProtectedPlaceholder title="履歴を準備しています" description="これまでに出会った声を振り返る画面を準備中です。" /> },
  { path: '*', Component: NotFoundPage },
] }])
