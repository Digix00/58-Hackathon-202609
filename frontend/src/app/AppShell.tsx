import { NavLink, Outlet } from 'react-router'
import { useBottomSheet } from './hooks/useBottomSheet'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import { useRuntime } from './providers/RuntimeContext'
import { SettingsSheet } from '../shared/components/SettingsSheet'

const navigation = [
  { to: '/', label: '読む', end: true }, { to: '/quiz/today', label: 'クイズ' },
  { to: '/post', label: '投稿', prominent: true }, { to: '/history', label: '履歴' },
]

export function AppShell() {
  const settings = useBottomSheet()
  const { closeWindow } = useRuntime()
  const { fontSize } = useDisplaySettings()
  return (
    <div className={`app-shell font-${fontSize}`}>
      <header className="app-header"><p className="app-name">目安箱</p><div className="header-actions"><button className="icon-button" type="button" onClick={(event) => settings.open(event.currentTarget)} aria-label="表示の設定" aria-haspopup="dialog">あ</button><button className="icon-button" type="button" onClick={closeWindow} aria-label="LINEへ戻る">×</button></div></header>
      <main className="app-content"><Outlet /></main>
      <nav className="bottom-nav" aria-label="画面移動">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${item.prominent ? ' prominent' : ''}`}>{item.label}</NavLink>)}</nav>
      <SettingsSheet open={settings.isOpen} onClose={settings.close} />
    </div>
  )
}
