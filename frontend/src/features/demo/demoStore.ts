import { useSyncExternalStore } from 'react'

export type DemoConcern = {
  id: string
  body: string
  gender?: string
  genderCode?: string
  ageGroup?: string
  ageGroupCode?: string
  region?: string
  regionCode?: string
  createdLabel: string
  reason: string
  reactionCount: number
  reacted: boolean
}

export type DemoQuizResult = {
  score: number
  answers: Record<string, string>
}

type DemoState = {
  concerns: DemoConcern[]
  viewedIds: ReadonlySet<string>
  quizResult: DemoQuizResult | null
}

const initialConcerns: DemoConcern[] = [
  {
    id: 'sample-cafeteria',
    body: '昼休みの食堂がいつも混んでいて、食べ終わるころには休憩時間がなくなってしまいます。落ち着いて昼食をとれる場所があったらうれしいです。',
    gender: '女性',
    ageGroup: '20代',
    region: '大阪府',
    createdLabel: '数日前',
    reason: 'まだ読んでいない声です',
    reactionCount: 12,
    reacted: false,
  },
  {
    id: 'sample-station',
    body: '駅から家までの道が暗く、仕事の帰りが遅い日は少し不安です。明るい道を選ぶと遠回りになるので、毎日迷っています。',
    gender: '男性',
    ageGroup: '40代',
    region: '兵庫県',
    createdLabel: '今週',
    reason: '異なる地域の声です',
    reactionCount: 8,
    reacted: false,
  },
  {
    id: 'sample-hospital',
    body: '病院の予約が電話とウェブで分かれていて、どこから申し込めばよいのか分かりにくいと感じます。誰でも迷わず予約できるようになってほしいです。',
    gender: '回答しない',
    region: '東京都',
    createdLabel: '今月',
    reason: '新しく届いた声です',
    reactionCount: 5,
    reacted: false,
  },
]

let state: DemoState = { concerns: initialConcerns, viewedIds: new Set(), quizResult: null }
const listeners = new Set<() => void>()

function publish(next: DemoState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Intent: デモ用の共有状態をReactの購読として画面へ伝播する。
 * Boundary: concerns、閲覧済みID、クイズ結果だけを返し、ストアの更新処理を隠す。
 * State modeling: 外部ストアのsnapshotをuseSyncExternalStoreで購読する。
 */
export function useDemoState() {
  return useSyncExternalStore(subscribe, () => state)
}

export function addDemoConcern(body: string) {
  const concern: DemoConcern = {
    id: `sample-new-${Date.now()}`,
    body: body.trim(),
    createdLabel: 'たった今',
    reason: '新しく届いた声です',
    reactionCount: 0,
    reacted: false,
  }
  publish({ ...state, concerns: [concern, ...state.concerns] })
  return concern
}

export function markDemoViewed(id: string) {
  if (state.viewedIds.has(id)) return
  publish({ ...state, viewedIds: new Set([...state.viewedIds, id]) })
}

export function reactToDemoConcern(id: string) {
  publish({
    ...state,
    concerns: state.concerns.map((concern) =>
      concern.id === id && !concern.reacted
        ? { ...concern, reacted: true, reactionCount: concern.reactionCount + 1 }
        : concern,
    ),
  })
}

export const demoQuiz = {
  people: [
    { id: 'a', attributes: '20代・女性・大阪府' },
    { id: 'b', attributes: '40代・男性・兵庫県' },
    { id: 'c', attributes: '東京都' },
  ],
  letters: [
    {
      id: 'sample-hospital',
      correctPerson: 'c',
      explanation: '予約の分かりにくさについての声でした。',
    },
    {
      id: 'sample-cafeteria',
      correctPerson: 'a',
      explanation: '昼休みに落ち着いて食事をしたいという声でした。',
    },
    {
      id: 'sample-station',
      correctPerson: 'b',
      explanation: '帰り道の明るさを気にかける声でした。',
    },
  ],
} as const

export function answerDemoQuiz(answers: Record<string, string>) {
  if (state.quizResult) return state.quizResult
  const score = demoQuiz.letters.filter(
    (letter) => answers[letter.id] === letter.correctPerson,
  ).length
  const result = { score, answers: { ...answers } }
  publish({ ...state, quizResult: result })
  return result
}

export type DemoScenario = 'normal' | 'loading' | 'empty' | 'error'

export function getDemoScenario(): DemoScenario {
  if (!import.meta.env.DEV) return 'error'
  const value = new URLSearchParams(window.location.search).get('mockState')
  return value === 'loading' || value === 'empty' || value === 'error' ? value : 'normal'
}
