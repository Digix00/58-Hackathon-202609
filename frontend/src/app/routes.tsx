import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { PostPage } from '../features/post/PostPage'
import { ErrorState, LoadingState } from '../shared/components/AsyncStates'
import { ComingSoonLabel } from '../shared/components/ComingSoonLabel'
import { SettingsRoute } from './SettingsRoute'
import { AppLayout, NotFoundPage, ProtectedRoute, RouteErrorBoundary } from './router'

// TODO: 閲覧・クイズ・履歴の API が揃ったら、開発用モックルートを実データの画面に置き換える。
const DevFeedPage = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('../features/feed/FeedPage')).FeedPage }))
  : null
const DevConcernDetailPage = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import('../features/concern-detail/ConcernDetailPage')).ConcernDetailPage,
    }))
  : null
const DevQuizPage = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('../features/quiz/QuizPage')).QuizPage }))
  : null
const DevHistoryPage = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('../features/history/HistoryPage')).HistoryPage }))
  : null

function demoPage(Page: ComponentType | null) {
  if (!Page) {
    return (
      <ErrorState
        title={<ComingSoonLabel ariaLabel="この画面は準備中です" />}
        description="データの接続が完了していません。しばらくお待ちください。"
      />
    )
  }
  return (
    <Suspense fallback={<LoadingState />}>
      <Page />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: demoPage(DevFeedPage) },
      { path: 'concerns/:id', element: demoPage(DevConcernDetailPage) },
      {
        path: 'post',
        element: (
          <ProtectedRoute>
            <PostPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'quiz/today',
        element: <ProtectedRoute>{demoPage(DevQuizPage)}</ProtectedRoute>,
      },
      {
        path: 'history',
        element: <ProtectedRoute>{demoPage(DevHistoryPage)}</ProtectedRoute>,
      },
      { path: 'settings', element: <SettingsRoute /> },
      { path: '*', Component: NotFoundPage },
    ],
  },
])
