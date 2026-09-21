import { createContext, useContext, useMemo, useState } from 'react'

export type DisplayLanguage = 'original' | 'hira' | 'en'
export type FontSize = 'normal' | 'large'
type DisplaySettingsContextValue = {
  language: DisplayLanguage
  fontSize: FontSize
  setLanguage: (language: DisplayLanguage) => void
  setFontSize: (fontSize: FontSize) => void
}

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null)

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<DisplayLanguage>('original')
  const [fontSize, setFontSize] = useState<FontSize>('normal')
  const value = useMemo(
    () => ({ language, fontSize, setLanguage, setFontSize }),
    [fontSize, language],
  )
  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
}

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext)
  if (!context) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider')
  return context
}
