import { useCallback } from 'react'
import { markDemoViewed } from './demoStore'

/**
 * Intent: 画面に表示された声の既読を、DOMの表示確定時に一度だけ記録する。
 * Boundary: 表示中の投稿IDと記録可否を受け取り、表示要素へ付けるrefを返す。
 * State modeling: 状態は持たず、既読の重複排除はモックストアに任せる。
 * Update surface: refの接続時だけ既読を書き込む。
 * Hidden complexity: 投稿や認証状態が変わるとrefが再接続され、表示中の声を記録する。
 * Composition: 画面Containerから表示Viewへrefを渡す。
 * Test notes: 初回表示、次の声、認証後、同一投稿の再表示を確認する。
 */
export function useDemoViewed(concernId: string | undefined, enabled: boolean) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (node && concernId && enabled) markDemoViewed(concernId)
    },
    [concernId, enabled],
  )
}
