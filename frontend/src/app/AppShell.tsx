import { NavLink, Outlet, useLocation } from 'react-router'
import notebookBackground from '../shared/styles/NotebookBackground.module.css'
import { NavIcon, type NavIconName } from './NavIcons'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import styles from './AppShell.module.css'

/** 下部ナビは「投稿」を中央に置き、設定から専用画面へ移動する。 */
const leftNavigation: Array<{ to: string; label: string; icon: NavIconName; end?: boolean }> = [
  { to: '/', label: '読む', icon: 'read', end: true },
  { to: '/quiz/today', label: 'クイズ', icon: 'quiz' },
]

const rightNavigation: Array<{ to: string; label: string; icon: NavIconName }> = [
  { to: '/history', label: '履歴', icon: 'history' },
  { to: '/settings', label: '設定', icon: 'settings' },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
}

export function AppShell() {
  const { fontSize } = useDisplaySettings()
  const { pathname } = useLocation()

  return (
    <div
      className={`${styles.shell} ${fontSize === 'large' ? styles.large : ''} ${
        pathname === '/' ? notebookBackground.grid : ''
      }`}
    >
      <main className={styles.content}>
        <Outlet />
      </main>
      <nav className={styles.nav} aria-label="画面移動と設定">
        {leftNavigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
        <NavLink
          to="/post"
          className={({ isActive }) =>
            `${styles.navLink} ${styles.postLink}${isActive ? ` ${styles.active}` : ''}`
          }
        >
          <NavIcon name="post" />
          投稿
        </NavLink>
        {rightNavigation.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass}>
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
