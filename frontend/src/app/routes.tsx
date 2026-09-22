import { createBrowserRouter } from 'react-router'
import {
  AppLayout,
  NotFoundPage,
  ProtectedPlaceholder,
  PublicPlaceholder,
  RouteErrorBoundary,
} from './router'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppLayout,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, Component: PublicPlaceholder },
      { path: 'concerns/:id', Component: () => <PublicPlaceholder detail /> },
      {
        path: 'post',
        Component: () => (
          <ProtectedPlaceholder
            title="投稿を準備しています"
            description="匿名で声を置く画面を準備中です。"
          />
        ),
      },
      {
        path: 'quiz/today',
        Component: () => (
          <ProtectedPlaceholder
            title="今日のクイズを準備しています"
            description="3つの声を読むクイズを準備中です。"
          />
        ),
      },
      {
        path: 'history',
        Component: () => (
          <ProtectedPlaceholder
            title="履歴を準備しています"
            description="これまでに出会った声を振り返る画面を準備中です。"
          />
        ),
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
])
