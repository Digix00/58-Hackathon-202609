import { useCallback, useMemo, useReducer } from 'react'
import {
  DisplaySettingsContext,
  type DisplayLanguage,
  type FontSize,
} from './DisplaySettingsContext'

const DEFAULT_LANGUAGE: DisplayLanguage = 'original'
const DEFAULT_FONT_SIZE: FontSize = 'normal'

type DisplaySettingsState = {
  language: DisplayLanguage
  fontSize: FontSize
}

type DisplaySettingsAction =
  | { type: 'languageChanged'; language: DisplayLanguage }
  | { type: 'fontSizeChanged'; fontSize: FontSize }

const initialDisplaySettings: DisplaySettingsState = {
  language: DEFAULT_LANGUAGE,
  fontSize: DEFAULT_FONT_SIZE,
}

function displaySettingsReducer(
  state: DisplaySettingsState,
  action: DisplaySettingsAction,
): DisplaySettingsState {
  switch (action.type) {
    case 'languageChanged':
      return { ...state, language: action.language }
    case 'fontSizeChanged':
      return { ...state, fontSize: action.fontSize }
  }
}

/**
 * Intent: アプリ全体で共有する表示設定の状態と更新操作を管理する。
 * Boundary: Contextには表示値と2つの意味のある更新操作だけを公開し、reducerの詳細を隠す。
 * State modeling: 同じ表示設定の状態をreducerで管理し、許可された型の値だけを受け付ける。
 * Update surface: setLanguage、setFontSize。
 * Hidden complexity: なし。各更新は一つの設定だけを変更する。
 * Composition: AppのProviderから下位の画面・設定UIへ伝播する。
 * Test notes: 各設定の変更と、他の設定を保持したまま更新されることを確認する。
 */
export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(displaySettingsReducer, initialDisplaySettings)
  const setLanguage = useCallback(
    (language: DisplayLanguage) => dispatch({ type: 'languageChanged', language }),
    [],
  )
  const setFontSize = useCallback(
    (fontSize: FontSize) => dispatch({ type: 'fontSizeChanged', fontSize }),
    [],
  )
  const value = useMemo(
    () => ({ ...state, setLanguage, setFontSize }),
    [setFontSize, setLanguage, state],
  )
  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
}
