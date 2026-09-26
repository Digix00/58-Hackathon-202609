export type QuizNotebookState = {
  index: number
  cover: 'closed' | 'lifting' | 'open' | 'finished'
}

type Action =
  | { type: 'lift' | 'open' | 'close' | 'results' }
  | { type: 'select'; index: number; count: number }
  | { type: 'go'; direction: 1 | -1; count: number }

export function quizNotebookReducer(state: QuizNotebookState, action: Action): QuizNotebookState {
  switch (action.type) {
    case 'lift':
      return state.cover === 'closed' ? { ...state, cover: 'lifting' } : state
    case 'open':
      return { ...state, cover: 'open' }
    case 'close':
      return { ...state, cover: 'finished' }
    case 'results':
      return { index: 0, cover: 'open' }
    case 'select':
      return action.index >= 0 && action.index < action.count
        ? { index: action.index, cover: 'open' }
        : state
    case 'go': {
      const index = state.index + action.direction
      return state.cover === 'open' && index >= 0 && index < action.count
        ? { ...state, index }
        : state
    }
  }
}
