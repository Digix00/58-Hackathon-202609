import { useMemo, useState } from 'react'
import {
  DisplaySettingsContext,
  type DisplayLanguage,
  type FontSize,
} from './DisplaySettingsContext'

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<DisplayLanguage>('original')
  const [fontSize, setFontSize] = useState<FontSize>('normal')
  const value = useMemo(
    () => ({ language, fontSize, setLanguage, setFontSize }),
    [fontSize, language],
  )
  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
}
