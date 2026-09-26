import { useMemo } from 'react'
import { useDisplaySettings } from '../app/providers/DisplaySettingsContext'
import { isMessageKey, translate, type MessageValues } from './translate'
import type { MessageKey } from './messages'

/** 保存済みの言語だけを参照し、UI用に別の言語状態を作らない。 */
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
