import { useTranslation } from '../i18n/useTranslation'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
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
  const { t } = useTranslation()

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
            <p>{t('guide.initFailed')}</p>
            {liffTarget ? (
              <a className={actionStyles.text} href={liffTarget}>
                {t('guide.reopen')}
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
  const { t } = useTranslation()

  const { liffUrl } = useRuntime()
  const location = useLocation()
  const target = liffUrl(location.pathname)

  return (
    <section className={`${styles.guideCard} ${crayonStyles.edge}`}>
      <p className={styles.eyebrow}>{t('app.name')}</p>
      <h1>{t('guide.liffTitle')}</h1>
      <p>{t('guide.liffDescription')}</p>
      {target ? (
        <a className={actionStyles.primary} href={target}>
          {t('guide.openLiff')}
        </a>
      ) : (
        <p className={styles.guideNote}>{t('guide.noLiff')}</p>
      )}
      <Link className={actionStyles.text} to="/">
        {t('guide.keepReading')}
      </Link>
    </section>
  )
}

export function LoginGuide() {
  const { t } = useTranslation()

  const { login } = useAuth()

  return (
    <section className={`${styles.guideCard} ${crayonStyles.edge}`}>
      <p className={styles.eyebrow}>{t('guide.login')}</p>
      <h1>{t('guide.loginTitle')}</h1>
      <p>{t('guide.privacy')}</p>
      <button type="button" className={actionStyles.primary} onClick={() => void login()}>
        {t('guide.login')}
      </button>
      <Link className={actionStyles.text} to="/">
        {t('guide.keepReading')}
      </Link>
    </section>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  const { state } = useRuntime()
  const { status, user } = useAuth()

  if (state.status !== 'ready') return null
  if (state.mode === 'browser') return <OpenInLiffGuide />
  if (status === 'initializing') {
    return (
      <main className={styles.standalonePage}>
        <LoadingState label={t('auth.checking')} />
      </main>
    )
  }
  if (status === 'anonymous') return <LoginGuide />
  /*
   * 年代・性別・地域は、投稿の公開属性と声の選びかたに使う。
   * 空のまま投稿・クイズ・履歴へ進むと、あとから遡って書き足せないので、
   * ログイン済みで未記入のときだけ、はじめの1ページへ寄り道させる。
   * 読むだけの利用は今までどおり素通りできる。
   */
  if (user && !user.profileCompleted) return <Navigate to="/onboarding" replace />
  return children
}

export function NotFoundPage() {
  const { t } = useTranslation()

  const navigate = useNavigate()

  return (
    <CenteredState>
      <ErrorState
        title={t('route.notFound')}
        description={t('route.chooseAgain')}
        onRetry={() => navigate('/')}
      />
    </CenteredState>
  )
}

export function RouteErrorBoundary() {
  const { t } = useTranslation()

  const navigate = useNavigate()

  return (
    <main className={styles.standalonePage}>
      <ErrorState
        title={t('route.failed')}
        description={t('route.retry')}
        onRetry={() => navigate('/')}
      />
    </main>
  )
}
