import { useReducer } from 'react'
import { Link } from 'react-router'
import { DemoBoundary } from '../../shared/components/DemoBoundary'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { answerDemoQuiz, demoQuiz, useDemoState, type DemoQuizResult } from '../demo/demoStore'

type QuizStep = 'letters' | 'confirm' | 'submitting' | 'results'
type QuizState = {
  step: QuizStep
  index: number
  answers: Record<string, string>
  error: string | null
}
type QuizAction =
  | { type: 'choose'; letterId: string; personId: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'submitStarted' }
  | { type: 'showResults' }
  | { type: 'nextResult' }

type Letter = (typeof demoQuiz.letters)[number]
const initialState: QuizState = { step: 'letters', index: 0, answers: {}, error: null }

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'choose': {
      const usedBy = Object.entries(state.answers).find(
        ([letterId, personId]) => letterId !== action.letterId && personId === action.personId,
      )
      if (usedBy) return { ...state, error: 'その人は別の声に選ばれています。選び直してください。' }
      return {
        ...state,
        answers: { ...state.answers, [action.letterId]: action.personId },
        error: null,
      }
    }
    case 'next':
      if (!state.answers[demoQuiz.letters[state.index].id])
        return { ...state, error: '対応する人を選んでください。' }
      return state.index === demoQuiz.letters.length - 1
        ? { ...state, step: 'confirm', error: null }
        : { ...state, index: state.index + 1, error: null }
    case 'back':
      return state.step === 'confirm'
        ? { ...state, step: 'letters', index: demoQuiz.letters.length - 1, error: null }
        : { ...state, index: Math.max(0, state.index - 1), error: null }
    case 'submitStarted':
      return state.step === 'confirm' ? { ...state, step: 'submitting' } : state
    case 'showResults':
      return { ...state, step: 'results', index: 0, error: null }
    case 'nextResult':
      return { ...state, index: Math.min(state.index + 1, demoQuiz.letters.length - 1) }
  }
}

function PersonBookmarks() {
  return (
    <ul className={screen.bookmarkRow} aria-label="クイズの参加者">
      {demoQuiz.people.map((person) => (
        <li key={person.id} className={screen.personBookmark}>
          <strong>{person.label}</strong>
          <span>{person.attributes}</span>
        </li>
      ))}
    </ul>
  )
}

function QuizConfirmView({
  answers,
  submitting,
  onBack,
  onSubmit,
}: {
  answers: Record<string, string>
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <section className={screen.page}>
      <h2>選んだ組み合わせ</h2>
      <ol className={screen.list}>
        {demoQuiz.letters.map((letter, index) => (
          <li key={letter.id} className={screen.listItem}>
            {index + 1}通目 →{' '}
            {demoQuiz.people.find((person) => person.id === answers[letter.id])?.label}
          </li>
        ))}
      </ol>
      <div className={screen.actions}>
        <button
          type="button"
          className={actionStyles.secondary}
          onClick={onBack}
          disabled={submitting}
        >
          選び直す
        </button>
        <button
          type="button"
          className={actionStyles.primary}
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? '回答しています…' : '回答する'}
        </button>
      </div>
    </section>
  )
}

function QuizResultView({
  letter,
  body,
  result,
  index,
  onNext,
}: {
  letter: Letter
  body: string | undefined
  result: DemoQuizResult
  index: number
  onNext: () => void
}) {
  const selected = demoQuiz.people.find((person) => person.id === result.answers[letter.id])?.label
  const correct = demoQuiz.people.find((person) => person.id === letter.correctPerson)?.label
  return (
    <section className={screen.page}>
      <p className={screen.eyebrow}>結果 · {index + 1} / 3</p>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.body}>{body}</p>
      </article>
      <div className={screen.stack} aria-live="polite">
        <p>
          <strong>
            {result.answers[letter.id] === letter.correctPerson
              ? '合っています'
              : '異なる組み合わせでした'}
          </strong>
        </p>
        <p>選んだ人: {selected}</p>
        <p>投稿した人: {correct}</p>
        <p className={screen.muted}>{letter.explanation}</p>
        {index === 0 ? <p>{result.score} / 3組の対応を見つけました。</p> : null}
        {index < demoQuiz.letters.length - 1 ? (
          <button type="button" className={actionStyles.primary} onClick={onNext}>
            次の解説を読む
          </button>
        ) : (
          <Link className={actionStyles.primary} to="/history">
            履歴を見る
          </Link>
        )}
      </div>
    </section>
  )
}

function QuizLetterView({
  letter,
  body,
  index,
  selectedPerson,
  error,
  onChoose,
  onBack,
  onNext,
}: {
  letter: Letter
  body: string | undefined
  index: number
  selectedPerson: string | undefined
  error: string | null
  onChoose: (personId: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <section className={screen.page}>
      <p className={screen.eyebrow}>声 · {index + 1} / 3</p>
      <article className={`${screen.paper} ${screen.taped} ${crayonStyles.edge}`}>
        <p className={screen.body}>{body}</p>
        <fieldset className={screen.answerFieldset}>
          <legend>この手紙は、だれから？</legend>
          <div className={screen.answerChoices}>
            {demoQuiz.people.map((person) => (
              <label key={person.id} className={screen.answerChoice}>
                <input
                  type="radio"
                  name={`letter-${letter.id}`}
                  value={person.id}
                  checked={selectedPerson === person.id}
                  aria-label={`${person.label}・${person.attributes}`}
                  onChange={() => onChoose(person.id)}
                />
                <span>{person.id.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </article>
      {error ? (
        <p className={screen.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={screen.actions}>
        {index > 0 ? (
          <button type="button" className={actionStyles.secondary} onClick={onBack}>
            前の声へ
          </button>
        ) : null}
        <button type="button" className={actionStyles.primary} onClick={onNext}>
          {index === demoQuiz.letters.length - 1 ? '組み合わせを確認する' : '次の声へ'}
        </button>
      </div>
    </section>
  )
}

export function QuizPage() {
  const { concerns, quizResult } = useDemoState()
  const [state, dispatch] = useReducer(quizReducer, initialState)
  const showingResults = Boolean(quizResult) || state.step === 'results'
  const letter = demoQuiz.letters[state.index]
  const body = concerns.find((concern) => concern.id === letter.id)?.body

  const submit = async () => {
    dispatch({ type: 'submitStarted' })
    await new Promise((resolve) => setTimeout(resolve, 400))
    answerDemoQuiz(state.answers)
    dispatch({ type: 'showResults' })
  }

  return (
    <DemoBoundary
      emptyTitle="今日のクイズはまだありません"
      emptyDescription="新しいクイズが届くまでお待ちください。"
    >
      <div className={screen.page}>
        <header className={screen.heading}>
          <p className={screen.eyebrow}>今日のクイズ</p>
          <h1>{showingResults ? '声を振り返る' : 'きょうの、3つの手紙。'}</h1>
          <p className={screen.muted}>
            手紙としおりを、結んでみよう。属性だけで決めつけず、言葉を読んで考えてみてください。
          </p>
        </header>
        <PersonBookmarks />
        {showingResults && quizResult ? (
          <QuizResultView
            letter={letter}
            body={body}
            result={quizResult}
            index={state.index}
            onNext={() => dispatch({ type: 'nextResult' })}
          />
        ) : state.step === 'confirm' || state.step === 'submitting' ? (
          <QuizConfirmView
            answers={state.answers}
            submitting={state.step === 'submitting'}
            onBack={() => dispatch({ type: 'back' })}
            onSubmit={() => void submit()}
          />
        ) : (
          <QuizLetterView
            letter={letter}
            body={body}
            index={state.index}
            selectedPerson={state.answers[letter.id]}
            error={state.error}
            onChoose={(personId) => dispatch({ type: 'choose', letterId: letter.id, personId })}
            onBack={() => dispatch({ type: 'back' })}
            onNext={() => dispatch({ type: 'next' })}
          />
        )}
      </div>
    </DemoBoundary>
  )
}
