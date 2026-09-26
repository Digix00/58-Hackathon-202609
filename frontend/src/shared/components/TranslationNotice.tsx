import { useTranslation } from '../../i18n/useTranslation'
import type { DisplayLanguage } from '../../app/providers/DisplaySettingsContext'
import screen from '../styles/Screen.module.css'

export function TranslationNotice({
  actualLanguage,
  status,
}: {
  actualLanguage: DisplayLanguage
  status?: 'pending' | 'ready' | 'failed'
}) {
  const { language, t } = useTranslation()
  if (language === 'original' || actualLanguage === language) return null
  return (
    <p className={screen.muted} role="status">
      {t(
        status === 'pending'
          ? 'translation.pending'
          : status === 'failed'
            ? 'translation.failed'
            : 'translation.original',
      )}
    </p>
  )
}
