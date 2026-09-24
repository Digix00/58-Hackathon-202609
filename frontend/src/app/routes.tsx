import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { ConcernDetailPage } from '../features/concern-detail/ConcernDetailPage'
import { FeedPage } from '../features/feed/FeedPage'
import { PostPage } from '../features/post/PostPage'
import { ErrorState, LoadingState } from '../shared/components/AsyncStates'
import { SettingsRoute } from './SettingsRoute'
import { AppLayout, NotFoundPage, ProtectedRoute, RouteErrorBoundary } from './router'

// クイズ・履歴 API が未実装のため、これらの画面だけ開発用モックを維持する。
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
        title="この画面は準備中です"
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
      { index: true, Component: FeedPage },
      { path: 'concerns/:id', Component: ConcernDetailPage },
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
