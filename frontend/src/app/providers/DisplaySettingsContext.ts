import { createContext, useContext } from 'react'

export type DisplayLanguage = 'original' | 'hira' | 'en'
export type FontSize = 'normal' | 'large'

type DisplaySettingsContextValue = {
  language: DisplayLanguage
  fontSize: FontSize
  speechEnabled: boolean
  setLanguage: (language: DisplayLanguage) => void
  setFontSize: (fontSize: FontSize) => void
  setSpeechEnabled: (enabled: boolean) => void
}

export const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null)

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext)
  if (!context) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider')
  return context
}
