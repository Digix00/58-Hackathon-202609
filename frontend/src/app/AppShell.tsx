import type { ReactNode } from 'react'
import { useTranslation } from '../i18n/useTranslation'
import { NavLink, Outlet } from 'react-router'
import notebookBackground from '../shared/styles/NotebookBackground.module.css'
import { NavIcon, type NavIconName } from './NavIcons'
import { useDisplaySettings } from './providers/DisplaySettingsContext'
import styles from './AppShell.module.css'
import layoutStyles from './router.module.css'
import type { MessageKey } from '../i18n/messages'

/** 下部ナビは「クイズ・投稿・読む・履歴・設定」の順で表示する。 */
const navigation: Array<{
  to: string
  label: MessageKey
  icon: NavIconName
  end?: boolean
  variant?: 'read'
}> = [
  { to: '/quiz/today', label: 'nav.quiz', icon: 'quiz' },
  { to: '/post', label: 'nav.post', icon: 'post' },
  { to: '/', label: 'nav.read', icon: 'read', end: true, variant: 'read' },
  { to: '/history', label: 'nav.history', icon: 'history' },
  { to: '/settings', label: 'nav.settings', icon: 'settings' },
]

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
}

export function AppShell({
  standalone = false,
  notice,
}: {
  standalone?: boolean
  notice?: ReactNode
}) {
  const { t } = useTranslation()

  const { fontSize } = useDisplaySettings()

  return (
    <div
      className={`${standalone ? '' : styles.shell} ${notebookBackground.grid} ${fontSize === 'large' ? styles.large : ''}`}
    >
      <main className={standalone ? layoutStyles.standalonePage : styles.content}>
        {notice}
        <Outlet />
      </main>
      <nav
        hidden={standalone}
        inert={standalone}
        className={styles.nav}
        aria-label={t('nav.label')}
      >
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
              <span className={styles.navLabel}>{t(item.label)}</span>
            </NavLink>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <NavIcon name={item.icon} />
              <span className={styles.navLabel}>{t(item.label)}</span>
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}
