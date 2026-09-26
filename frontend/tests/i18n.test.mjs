import assert from 'node:assert/strict'
import test from 'node:test'
import { messages } from '../src/i18n/messages.ts'
import { hiraganaMessages } from '../src/i18n/hiraganaMessages.ts'
import { apiErrorMessage, isMessageKey, translate } from '../src/i18n/translate.ts'
import {
  AGE_GROUP_LABELS,
  GENDER_LABELS,
  REGION_LABELS,
  ageGroupLabel,
  createdLabel,
  genderLabel,
  regionLabel,
} from '../src/shared/concernPresentation.ts'

test('日英の差し込み項目が一致し、英語辞書に日本語が残らない', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [key, [ja, en]] of Object.entries(messages)) {
    assert.deepEqual(placeholders(en), placeholders(ja), key)
    assert.doesNotMatch(en, /[ぁ-んァ-ヶ一-龯]/u, key)
  }
})

test('ひらがな辞書は全キーを持ち、差し込み項目を維持し、漢字・カタカナを含まない', () => {
  assert.deepEqual(Object.keys(hiraganaMessages).sort(), Object.keys(messages).sort())
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  for (const [key, [ja]] of Object.entries(messages)) {
    const hiragana = hiraganaMessages[key]
    assert.ok(hiragana.length > 0, key)
    assert.deepEqual(placeholders(hiragana), placeholders(ja), key)
    assert.doesNotMatch(hiragana, /[\p{Script=Han}\p{Script=Katakana}]/u, key)
    assert.equal(translate('jaHira', key), hiragana, key)
  }
})

test('設定に応じて日英・ひらがなのUIを選ぶ', () => {
  assert.equal(translate('en', 'settings.language'), 'Display language')
  assert.equal(translate('original', 'settings.language'), '表示することば')
  assert.equal(translate('jaHira', 'settings.language'), 'ひょうじすることば')
  assert.equal(translate('jaHira', 'nav.quiz'), 'くいず')
  assert.equal(translate('jaHira', 'app.name'), 'Qiite')
  assert.equal(translate('jaHira', 'guide.reopen'), 'LINEでひらきなおす')
})

test('数値と利用者の文章を値として差し込み、文章中の記号を再解釈しない', () => {
  assert.equal(
    translate('en', 'post.characterCount', { count: 0, max: 1000 }),
    '0 / 1000 characters',
  )
  const body = '<script>$& {count}</script>'
  assert.equal(translate('en', 'feed.details', { body }), `${body} Read more`)
  const original = '漢字とカタカナ <script>$& {count}</script>'
  assert.equal(translate('jaHira', 'feed.details', { body: original }), `${original} くわしくよむ`)
  assert.equal(
    translate('jaHira', 'post.characterCount', { count: 0, max: 1000 }),
    'かいたもじすうは0 / 1000もじ',
  )
})

test('属性の既存キーを維持して、性別・年代・地域の表示だけを切り替える', () => {
  for (const [labels, display] of [
    [GENDER_LABELS, genderLabel],
    [AGE_GROUP_LABELS, ageGroupLabel],
    [REGION_LABELS, regionLabel],
  ]) {
    for (const [key, original] of Object.entries(labels)) {
      assert.equal(display(key, 'original'), original)
      assert.doesNotMatch(display(key, 'jaHira'), /[\p{Script=Han}\p{Script=Katakana}]/u, key)
    }
    for (const language of ['original', 'en', 'jaHira']) {
      assert.equal(display(undefined, language), undefined)
      assert.equal(display('unknown', language), 'unknown')
    }
  }
  assert.equal(genderLabel('non_binary', 'jaHira'), 'のんばいなりー')
  assert.equal(genderLabel('female', 'en'), 'Female')
  assert.equal(ageGroupLabel('30s', 'jaHira'), '30だい')
  assert.equal(ageGroupLabel('90s_plus', 'jaHira'), '90だいいじょう')
  assert.equal(ageGroupLabel('no_answer', 'jaHira'), 'かいとうしない')
  assert.equal(ageGroupLabel('90s_plus', 'en'), '90 and over')
  assert.equal(regionLabel('tokyo', 'jaHira'), 'とうきょうと')
  assert.equal(regionLabel('tokyo', 'en'), 'Tokyo')
})

test('相対日時の表示を切り替え、不正な日時では空文字を返す', (context) => {
  context.mock.method(Date, 'now', () => Date.parse('2026-09-26T12:00:00Z'))
  for (const [days, label] of [
    [0, 'きょう'],
    [2, '2にちまえ'],
    [14, '2しゅうかんまえ'],
    [60, '2かげつまえ'],
  ]) {
    const date = new Date(Date.now() - days * 86_400_000).toISOString()
    assert.equal(createdLabel(date, 'jaHira'), label)
  }
  assert.equal(createdLabel('2026-09-24T12:00:00Z', 'original'), '2日前')
  assert.equal(createdLabel('2026-09-24T12:00:00Z', 'en'), '2 days ago')
  assert.equal(createdLabel('invalid', 'jaHira'), '')
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
