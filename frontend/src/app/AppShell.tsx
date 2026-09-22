import { NavLink, Outlet } from 'react-router'
import { useBottomSheet } from './hooks/useBottomSheet'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import { SettingsSheet } from '../shared/components/SettingsSheet'
import { ProfileSettings } from '../features/profile/ProfileSettings'

const navigation = [
  { to: '/', label: '読む', end: true }, { to: '/quiz/today', label: 'クイズ' },
  { to: '/post', label: '投稿', prominent: true }, { to: '/history', label: '履歴' },
]

export function AppShell() {
  const settings = useBottomSheet()
  const { fontSize } = useDisplaySettings()
  return (
    <div className={`app-shell font-${fontSize}`}>
      <header className="app-header crayon-edge"><p className="app-name">目安箱</p><div className="header-actions"><button className="settings-button" type="button" onClick={(event) => settings.open(event.currentTarget)} aria-label="設定を開く" aria-haspopup="dialog">設定</button></div></header>
      <main className="app-content"><Outlet /></main>
      <nav className="bottom-nav crayon-edge" aria-label="画面移動">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${item.prominent ? ' prominent' : ''}`}>{item.label}</NavLink>)}</nav>
      <SettingsSheet open={settings.isOpen} onClose={settings.close} profileSettings={<ProfileSettings />} />
    </div>
  )
}
