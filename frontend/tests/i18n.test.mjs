import assert from 'node:assert/strict'
import test from 'node:test'
import { messages } from '../src/i18n/messages.ts'
import { apiErrorMessage, isMessageKey, translate } from '../src/i18n/translate.ts'

test('日英の差し込み項目が一致し、英語辞書に日本語が残らない', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [key, [ja, en]] of Object.entries(messages)) {
    assert.deepEqual(placeholders(en), placeholders(ja), key)
    assert.doesNotMatch(en, /[ぁ-んァ-ヶ一-龯]/u, key)
  }
})

test('英語だけを英語UIにし、原文・ひらがな設定の既存UIを維持する', () => {
  assert.equal(translate('en', 'settings.language'), 'Display language')
  assert.equal(translate('original', 'settings.language'), '表示することば')
  assert.equal(translate('jaHira', 'settings.language'), '表示することば')
})

test('数値と利用者の文章を値として差し込み、文章中の記号を再解釈しない', () => {
  assert.equal(
    translate('en', 'post.characterCount', { count: 0, max: 1000 }),
    '0 / 1000 characters',
  )
  const body = '<script>$& {count}</script>'
  assert.equal(translate('en', 'feed.details', { body }), `${body} Read more`)
})

test('APIのコードを文言キーへ変換し、未知のエラーも操作ごとの既定文を使う', () => {
  assert.equal(apiErrorMessage('AUTHENTICATION_REQUIRED', 'error.post'), 'error.authRequired')
  assert.equal(apiErrorMessage('INVALID_REQUEST', 'error.post'), 'error.invalidRequest')
  assert.equal(apiErrorMessage('RATE_LIMIT_EXCEEDED', 'error.post'), 'error.rateLimited')
  assert.equal(apiErrorMessage('UNKNOWN', 'error.post'), 'error.post')
  assert.equal(apiErrorMessage(undefined, 'error.language'), 'error.language')
  assert.equal(isMessageKey('toString'), false)
  assert.equal(isMessageKey('settings.language'), true)
})
