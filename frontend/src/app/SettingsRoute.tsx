import { SettingsPage } from '../features/settings/SettingsPage'
import { useRuntime } from './providers/RuntimeContext'
import { OpenInLiffGuide } from './router'

export function SettingsRoute() {
  const { state } = useRuntime()

  if (state.status !== 'ready') return null
  return state.mode === 'liff' ? <SettingsPage /> : <OpenInLiffGuide />
}
