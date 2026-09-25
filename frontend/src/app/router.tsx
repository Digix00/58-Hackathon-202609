import { useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { SplashScreen } from '../features/splash/SplashScreen'
import { CrayonFilters } from '../shared/components/CrayonFilters'
import { ErrorState, LoadingState } from '../shared/components/AsyncStates'
import actionStyles from '../shared/styles/Actions.module.css'
import crayonStyles from '../shared/styles/Crayon.module.css'
import notebookBackground from '../shared/styles/NotebookBackground.module.css'
import { AppShell } from './AppShell'
import { useRuntime } from './providers/RuntimeContext'
import styles from './router.module.css'

function CenteredState({ children }: { children: ReactNode }) {
  return <div className={styles.placeholderPage}>{children}</div>
}

export function AppLayout() {
  const { state, liffUrl } = useRuntime()
  const location = useLocation()
  /*
   * 起動画面を出すかどうかは、最初の描画の時点で決める。
   *
   * 準備が終わってからも、絵が抜けきるまでは出したままにする必要があるので、
   * 初期化中かどうかをそのまま条件にはできない。LIFF を初期化しない入口では
   * 最初から準備が終わっているので、この値は false になり、起動画面は出ない。
   */
  const [booting, setBooting] = useState(() => state.status === 'initializing')
  const crayonFilters = <CrayonFilters key={location.key} />
  const liffTarget = liffUrl(location.pathname)

  // 初期化中と、準備が終わって絵が抜けきるまでの両方で出す。
  if (state.status === 'initializing' || booting) {
    return (
      <>
        {crayonFilters}
        <SplashScreen ready={state.status !== 'initializing'} onDone={() => setBooting(false)} />
      </>
    )
  }

  return (
    <>
      {crayonFilters}
      {state.mode === 'liff' ? (
        <AppShell />
      ) : state.liffInitializationFailed ? (
        <main className={`${styles.browserFallbackPage} ${notebookBackground.grid}`}>
          <section className={styles.runtimeNotice} role="status">
            <p>
              LINEの初期化に失敗したため、公開フィードを表示しています。投稿などの操作を使うには、LINEミニアプリで開き直してください。
            </p>
            {liffTarget ? (
              <a className={actionStyles.text} href={liffTarget}>
                LINEで開き直す
              </a>
            ) : null}
          </section>
          <div className={styles.browserFallbackContent}>
            <Outlet />
          </div>
        </main>
      ) : (
        <main className={`${styles.standalonePage} ${notebookBackground.grid}`}>
          <Outlet />
        </main>
      )}
    </>
  )
}

export function OpenInLiffGuide() {
  const { liffUrl } = useRuntime()
  const location = useLocation()
  const target = liffUrl(location.pathname)

  return (
    <section className={`${styles.guideCard} ${crayonStyles.edge}`}>
      <p className={styles.eyebrow}>目安箱</p>
      <h1>この操作は、LINEミニアプリで使えます。</h1>
      <p>投稿やクイズは、LINEの中で安心して続けられます。</p>
      {target ? (
        <a className={actionStyles.primary} href={target}>
          LINEミニアプリで開く
        </a>
      ) : (
        <p className={styles.guideNote}>LIFF ID を設定すると、ここからLINEミニアプリを開けます。</p>
      )}
      <Link className={actionStyles.text} to="/">
        読むだけ続ける
      </Link>
    </section>
  )
}

export function LoginGuide() {
  const { login } = useAuth()

  return (
    <section className={`${styles.guideCard} ${crayonStyles.edge}`}>
      <p className={styles.eyebrow}>LINEで続ける</p>
      <h1>この操作は、LINEでログインしてから使えます。</h1>
      <p>LINEの名前や画像は公開されず、投稿は匿名で表示されます。</p>
      <button type="button" className={actionStyles.primary} onClick={() => void login()}>
        LINEで続ける
      </button>
      <Link className={actionStyles.text} to="/">
        読むだけ続ける
      </Link>
    </section>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { state } = useRuntime()
  const { status } = useAuth()

  if (state.status !== 'ready') return null
  if (state.mode === 'browser') return <OpenInLiffGuide />
  if (status === 'initializing') {
    return (
      <main className={styles.standalonePage}>
        <LoadingState label="ログイン状態を確認しています…" />
      </main>
    )
  }
  if (status === 'anonymous') return <LoginGuide />
  return children
}

export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <CenteredState>
      <ErrorState
        title="ページが見つかりません"
        description="もう一度、読みたい声を選んでください。"
        onRetry={() => navigate('/')}
      />
    </CenteredState>
  )
}

export function RouteErrorBoundary() {
  const navigate = useNavigate()

  return (
    <main className={styles.standalonePage}>
      <ErrorState
        title="画面を表示できませんでした"
        description="一時的な問題が起きました。最初の画面からもう一度お試しください。"
        onRetry={() => navigate('/')}
      />
    </main>
  )
}
