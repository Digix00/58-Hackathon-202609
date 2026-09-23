import { NavLink, Outlet } from 'react-router'
import { ProfileSettings } from '../features/profile/ProfileSettings'
import { SettingsSheet } from '../shared/components/SettingsSheet'
import crayonStyles from '../shared/styles/Crayon.module.css'
import { useBottomSheet } from './hooks/useBottomSheet'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import styles from './AppShell.module.css'

/**
 * 下部ナビは「投稿」を真ん中の紙のボタンにするため、左右へ2つずつ分けて並べる。
 * 右側の2つめは設定シートを開くボタンで、画面移動ではない。
 */
const leftNavigation = [
  { to: '/', label: '読む', end: true },
  { to: '/quiz/today', label: 'クイズ' },
]

const rightNavigation = [{ to: '/history', label: '履歴' }]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
}

export function AppShell() {
  const settings = useBottomSheet()
  const { fontSize } = useDisplaySettings()

  return (
    <div className={`${styles.shell} ${fontSize === 'large' ? styles.large : ''}`}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <nav
        className={`${styles.nav} ${crayonStyles.edge} ${crayonStyles.navRule}`}
        aria-label="画面移動と設定"
      >
        {leftNavigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            {item.label}
          </NavLink>
        ))}
        <NavLink
          to="/post"
          className={({ isActive }) =>
            `${styles.postLink}${isActive ? ` ${styles.active}` : ''}`
          }
        >
          投稿
        </NavLink>
        {rightNavigation.map((item) => (
          <NavLink key={item.to} to={item.to} className={navLinkClass}>
            {item.label}
          </NavLink>
        ))}
        <button
          className={styles.navLink}
          type="button"
          onClick={(event) => settings.open(event.currentTarget)}
          aria-haspopup="dialog"
        >
          設定
        </button>
      </nav>
      <SettingsSheet
        open={settings.isOpen}
        onClose={settings.close}
        profileSettings={<ProfileSettings />}
      />
    </div>
  )
}
