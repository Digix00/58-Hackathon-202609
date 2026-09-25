import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { PostPage } from '../features/post/PostPage'
import { LineBroadcastPage } from '../features/line-broadcast/LineBroadcastPage'
import { ErrorState, LoadingState } from '../shared/components/AsyncStates'
import { ComingSoonLabel } from '../shared/components/ComingSoonLabel'
import { SettingsRoute } from './SettingsRoute'
import { AppLayout, NotFoundPage, ProtectedRoute, RouteErrorBoundary } from './router'

const feedPage = lazy(async () => ({
  default: (await import('../features/feed/FeedPage')).FeedPage,
}))
const concernDetailPage = lazy(async () => ({
  default: (await import('../features/concern-detail/ConcernDetailPage')).ConcernDetailPage,
}))
const quizPage = lazy(async () => ({
  default: (await import('../features/quiz/QuizPage')).QuizPage,
}))
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

function apiPage(Page: ComponentType) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Page />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/admin/line-broadcast',
    Component: LineBroadcastPage,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    Component: AppLayout,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: apiPage(feedPage) },
      { path: 'concerns/:id', element: apiPage(concernDetailPage) },
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
        element: <ProtectedRoute>{apiPage(quizPage)}</ProtectedRoute>,
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
