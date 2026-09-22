import { NavLink, Outlet } from 'react-router'
import { ProfileSettings } from '../features/profile/ProfileSettings'
import { SettingsSheet } from '../shared/components/SettingsSheet'
import crayonStyles from '../shared/styles/Crayon.module.css'
import { useBottomSheet } from './hooks/useBottomSheet'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import styles from './AppShell.module.css'

const navigation = [
  { to: '/', label: '読む', end: true },
  { to: '/quiz/today', label: 'クイズ' },
  { to: '/post', label: '投稿', prominent: true },
  { to: '/history', label: '履歴' },
]

export function AppShell() {
  const settings = useBottomSheet()
  const { fontSize } = useDisplaySettings()

  return (
    <div className={`${styles.shell} ${fontSize === 'large' ? styles.large : ''}`}>
      <header className={`${styles.header} ${crayonStyles.edge} ${crayonStyles.headerRule}`}>
        <p className={styles.appName}>目安箱</p>
        <div className={styles.headerActions}>
          <button
            className={styles.settingsButton}
            type="button"
            onClick={(event) => settings.open(event.currentTarget)}
            aria-label="設定を開く"
            aria-haspopup="dialog"
          >
            設定
          </button>
        </div>
      </header>
      <main className={styles.content}>
        <Outlet />
      </main>
      <nav
        className={`${styles.nav} ${crayonStyles.edge} ${crayonStyles.navRule}`}
        aria-label="画面移動"
      >
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `${styles.navLink}${isActive ? ` ${styles.active}` : ''}${item.prominent ? ` ${styles.prominent}` : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <SettingsSheet
        open={settings.isOpen}
        onClose={settings.close}
        profileSettings={<ProfileSettings />}
      />
    </div>
  )
}
