import { createContext, useContext } from 'react'

export type DisplayLanguage = 'original' | 'jaHira' | 'en'
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

/**
 * Intent: 共有表示設定を画面から参照する。
 * Boundary: 表示値と意味のある更新操作だけを公開し、Providerのreducerを隠す。
 * State modeling: 有効な表示言語・文字サイズのunion型を境界に使う。
 * Update Surface: setLanguage / setFontSize / setSpeechEnabled。
 * Hidden Complexity: Provider外での利用を拒否し、独自の設定状態を作らない。
 * Composition: DisplaySettingsProviderから画面と翻訳Hookへ伝播する。
 * Test Notes: 設定変更の共有とProvider外の呼び出しを確認する。
 */
export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext)
  if (!context) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider')
  return context
}
