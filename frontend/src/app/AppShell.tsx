import { NavLink, Outlet } from 'react-router'
import notebookBackground from '../shared/styles/NotebookBackground.module.css'
import { NavIcon, type NavIconName } from './NavIcons'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import styles from './AppShell.module.css'

/** 下部ナビは「クイズ・投稿・読む・履歴・設定」の順で表示する。 */
const navigation: Array<{
  to: string
  label: string
  icon: NavIconName
  end?: boolean
  variant?: 'read'
}> = [
  { to: '/quiz/today', label: 'クイズ', icon: 'quiz' },
  { to: '/post', label: '投稿', icon: 'post' },
  { to: '/', label: '読む', icon: 'read', end: true, variant: 'read' },
  { to: '/history', label: '履歴', icon: 'history' },
  { to: '/settings', label: '設定', icon: 'settings' },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
}

export function AppShell() {
  const { fontSize } = useDisplaySettings()

  return (
    <div
      className={`${styles.shell} ${notebookBackground.grid} ${fontSize === 'large' ? styles.large : ''}`}
    >
      <main className={styles.content}>
        <Outlet />
      </main>
      <nav className={styles.nav} aria-label="画面移動と設定">
        {navigation.map((item) =>
          item.variant === 'read' ? (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${styles.readLink}${isActive ? ` ${styles.active}` : ''}`
              }
            >
              <NavIcon name={item.icon} />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <NavIcon name={item.icon} />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
