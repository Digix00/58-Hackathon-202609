import { useMemo, useState } from 'react'
import {
  DisplaySettingsContext,
  type DisplayLanguage,
  type FontSize,
} from './DisplaySettingsContext'

const DEFAULT_LANGUAGE: DisplayLanguage = 'original'
const DEFAULT_FONT_SIZE: FontSize = 'normal'

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<DisplayLanguage>(DEFAULT_LANGUAGE)
  const [fontSize, setFontSize] = useState<FontSize>(DEFAULT_FONT_SIZE)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const value = useMemo(
    () => ({ language, fontSize, speechEnabled, setLanguage, setFontSize, setSpeechEnabled }),
    [fontSize, language, speechEnabled],
  )
  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
}
