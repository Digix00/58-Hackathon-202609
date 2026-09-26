import { useMemo, useReducer } from 'react'
import { quizNotebookReducer } from './quizNotebookState'

/**
 * Intent: クイズの表紙と読む位置の遷移を局所化する。
 * Boundary: 紙の枚数・初期回答有無を受け取り、表示値と意味のある移動操作を返す。
 * State Modeling: reducerとcoverの列挙型で「開いたまま閉じている」組み合わせを防ぐ。
 * Update Surface: liftCover / openCover / close / reopen / openLetter / go / showResults。
 * Hidden Complexity: 範囲外移動の拒否、結果表示時の先頭への移動。
 * Composition: useQuizNavigationからアニメーション完了のタイミングで呼び出す。
 * Test Notes: 表紙の開閉、移動範囲、結果表示の位置を純粋なreducerで確認する。
 */
export function useQuizNotebook(count: number, answered: boolean) {
  const [state, dispatch] = useReducer(quizNotebookReducer, {
    index: 0,
    cover: answered ? 'open' : 'closed',
  })
  const actions = useMemo(
    () => ({
      liftCover: () => dispatch({ type: 'lift' }),
      openCover: () => dispatch({ type: 'open' }),
      close: () => dispatch({ type: 'close' }),
      reopen: (index: number) => dispatch({ type: 'select', index, count }),
      openLetter: (index: number) => dispatch({ type: 'select', index, count }),
      go: (direction: 1 | -1) => dispatch({ type: 'go', direction, count }),
      showResults: () => dispatch({ type: 'results' }),
    }),
    [count],
  )

  return {
    index: state.index,
    coverOpened: state.cover === 'open',
    coverLifting: state.cover === 'lifting',
    closed: state.cover === 'finished',
    actions,
  }
}
