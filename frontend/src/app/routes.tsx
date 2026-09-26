import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { PostPage } from '../features/post/PostPage'
import { LineBroadcastPage } from '../features/line-broadcast/LineBroadcastPage'
import { LoadingState } from '../shared/components/AsyncStates'
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
const welcomePage = lazy(async () => ({
  default: (await import('../features/welcome/WelcomePage')).WelcomePage,
}))
const historyPage = lazy(async () => ({
  default: (await import('../features/history/HistoryPage')).HistoryPage,
}))

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
      // はじめの1ページは ProtectedRoute で包まない。包むと、
      // プロフィール未記入の案内がこの画面自身へ戻り続ける。
      { path: 'welcome', element: apiPage(welcomePage) },
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
        element: <ProtectedRoute>{apiPage(historyPage)}</ProtectedRoute>,
      },
      { path: 'settings', element: <SettingsRoute /> },
      { path: '*', Component: NotFoundPage },
    ],
  },
])
