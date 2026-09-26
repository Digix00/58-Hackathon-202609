import assert from 'node:assert/strict'
import test from 'node:test'
import { placeAnswer, removeAnswer } from '../src/features/quiz/quizAnswers.ts'
import { quizNotebookReducer } from '../src/features/quiz/quizNotebookState.ts'
import { toConcernDetailViewModel } from '../src/features/concern-detail/concernDetailViewModel.ts'
import { assignmentsFromResult, toQuizPageModel } from '../src/features/quiz/quizViewModel.ts'

test('同じ参加者のしおりを移しても重複せず、他の回答と元の入力を保持する', () => {
  const original = { a: 'person-1', b: 'person-2' }
  const moved = placeAnswer(original, 'c', 'person-1')
  assert.deepEqual(moved, { b: 'person-2', c: 'person-1' })
  assert.deepEqual(removeAnswer(moved, 'c'), { b: 'person-2' })
  assert.deepEqual(original, { a: 'person-1', b: 'person-2' })
})

test('表紙を開くまでは移動せず、読む範囲を越えず、結果は先頭から開く', () => {
  const closed = { index: 0, cover: 'closed' }
  assert.deepEqual(quizNotebookReducer(closed, { type: 'go', direction: 1, count: 3 }), closed)
  const lifting = quizNotebookReducer(closed, { type: 'lift' })
  const opened = quizNotebookReducer(lifting, { type: 'open' })
  assert.deepEqual(opened, { index: 0, cover: 'open' })
  assert.deepEqual(quizNotebookReducer(opened, { type: 'go', direction: -1, count: 3 }), opened)
  const last = quizNotebookReducer(opened, { type: 'select', index: 2, count: 3 })
  assert.deepEqual(quizNotebookReducer(last, { type: 'go', direction: 1, count: 3 }), last)
  assert.deepEqual(quizNotebookReducer(last, { type: 'select', index: 3, count: 3 }), last)
  const finished = quizNotebookReducer(last, { type: 'close' })
  assert.deepEqual(quizNotebookReducer(finished, { type: 'results' }), opened)
})

test('詳細ViewModelは選択言語の属性と翻訳待ちの原文を両立し、APIの属性構造を公開しない', () => {
  const dto = {
    id: 'concern-1',
    body: '原文の本文',
    language: 'original',
    attributes: { ageGroup: '30s', gender: 'female', regionCode: 'tokyo', regionName: 'Tokyo' },
    createdAt: 'invalid',
    representations: { en: 'pending', jaHira: 'failed' },
    reactionCount: 2,
    reacted: false,
  }
  const vm = toConcernDetailViewModel(dto, 'en')
  assert.equal(vm.attributesLabel, '30s · Female · Tokyo')
  assert.equal(vm.body, dto.body)
  assert.equal(vm.bodyLanguage, 'ja')
  assert.equal(vm.translationStatus, 'pending')
  assert.equal('attributes' in vm, false)
  assert.equal('representations' in vm, false)
  assert.equal(toConcernDetailViewModel(dto, 'original').translationStatus, undefined)
})

test('クイズの表示順変換はAPI入力を変更せず、確定回答を同じ対応表へ戻せる', () => {
  const quiz = {
    id: 'quiz-1',
    participants: [2, 1, 3].map((i) => ({
      participantId: `p${i}`,
      displayOrder: i,
      attributes: {},
    })),
    concerns: [3, 1, 2].map((i) => ({
      concernId: `c${i}`,
      displayOrder: i,
      body: `本文${i}`,
      language: 'original',
    })),
  }
  const model = toQuizPageModel(quiz)
  assert.deepEqual(
    model.people.map((p) => p.id),
    ['p1', 'p2', 'p3'],
  )
  assert.deepEqual(
    model.letters.map((l) => l.id),
    ['c1', 'c2', 'c3'],
  )
  assert.deepEqual(
    quiz.concerns.map((c) => c.concernId),
    ['c3', 'c1', 'c2'],
  )
  assert.deepEqual(
    assignmentsFromResult({ results: [{ participantId: 'p2', selectedConcernId: 'c1' }] }),
    { c1: 'p2' },
  )
})
