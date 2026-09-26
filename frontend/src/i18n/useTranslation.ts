import { useMemo } from 'react'
import { useDisplaySettings } from '../app/providers/DisplaySettingsContext'
import { isMessageKey, translate, type MessageValues } from './translate'
import type { MessageKey } from './messages'

/** 保存済みの言語だけを参照し、UI用に別の言語状態を作らない。
 * Intent: 共有言語からUI文言を選ぶ境界を局所化する。
 * Boundary: language / localeと翻訳関数t / messageだけを返す。
 * State Modeling: Contextを購読し、言語状態を複製しない。
 * Update Surface: 状態更新なし。t / messageで文言を参照する。
 * Hidden Complexity: 未知の文言キーを共通エラーへ戻す。
 * Composition: useDisplaySettingsの言語を各Viewの表示へ接続する。
 * Test Notes: 言語切り替え、差し込み、未知のキーを確認する。
 */
export function useTranslation() {
  const { language } = useDisplaySettings()
  return useMemo(
    () => ({
      language,
      locale: language === 'en' ? 'en' : 'ja-JP',
      t: (key: MessageKey, values?: MessageValues) => translate(language, key, values),
      message: (key: string, values?: MessageValues) =>
        translate(language, isMessageKey(key) ? key : 'error.generic', values),
    }),
    [language],
  )
}
