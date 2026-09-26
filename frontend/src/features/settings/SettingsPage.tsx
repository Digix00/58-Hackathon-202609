import { useTranslation } from '../../i18n/useTranslation'
import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { ProfileSettings } from '../profile/ProfileSettings'
import { ComingSoonLabel } from '../../shared/components/ComingSoonLabel'
import sharedStyles from '../../shared/styles/Settings.module.css'
import styles from './SettingsPage.module.css'
import { updateUserDisplayLanguage } from '../profile/profileApi'

const languageOptions = [
  { value: 'original', label: 'settings.original' },
  { value: 'jaHira', label: 'settings.hiragana' },
  { value: 'en', label: 'settings.english' },
] as const

const fontSizeOptions = [
  { value: 'normal', label: 'settings.normal' },
  { value: 'large', label: 'settings.large' },
] as const

export function SettingsPage() {
  const { t, message } = useTranslation()

  const { status: authStatus, updateUser } = useAuth()
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()
  const [languageStatus, setLanguageStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>(
    'idle',
  )
  const [languageError, setLanguageError] = useState<string | null>(null)

  const selectLanguage = async (value: (typeof languageOptions)[number]['value']) => {
    if (authStatus !== 'authenticated' || value === language || languageStatus === 'saving') return

    setLanguageStatus('saving')
    setLanguageError(null)
    try {
      const result = await updateUserDisplayLanguage(value)
      if (!result.ok) {
        setLanguageStatus('failed')
        setLanguageError(result.message)
        return
      }

      updateUser(result.user)
      setLanguage(result.user.displayLanguage)
      setLanguageStatus('saved')
    } catch {
      setLanguageStatus('failed')
      setLanguageError('error.language')
    }
  }

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.heading}>
        <h1 id="settings-title">{t('nav.settings')}</h1>
      </header>

      <fieldset className={sharedStyles.group}>
        <legend>{t('settings.fontSize')}</legend>
        <div className={sharedStyles.choiceRow}>
          {fontSizeOptions.map((option) => (
            <label key={option.value} className={sharedStyles.choice}>
              <input
                type="radio"
                name="font-size"
                checked={fontSize === option.value}
                onChange={() => setFontSize(option.value)}
              />
              <span>{t(option.label)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset
        className={sharedStyles.group}
        disabled={authStatus !== 'authenticated' || languageStatus === 'saving'}
      >
        <legend>{t('settings.language')}</legend>
        {authStatus !== 'authenticated' ? (
          <p>{t('settings.loginHint')}</p>
        ) : (
          <p>{t('settings.languageHint')}</p>
        )}
        <div className={sharedStyles.choiceRow}>
          {languageOptions.map((option) => (
            <label key={option.value} className={sharedStyles.choice}>
              <input
                type="radio"
                name="display-language"
                checked={language === option.value}
                onChange={() => void selectLanguage(option.value)}
              />
              <span>{t(option.label)}</span>
            </label>
          ))}
        </div>
        {languageStatus === 'saving' ? <p role="status">{t('common.saving')}</p> : null}
        {languageStatus === 'saved' ? <p role="status">{t('settings.saved')}</p> : null}
        {languageError ? <p role="alert">{message(languageError)}</p> : null}
      </fieldset>

      <ProfileSettings />

      {/* TODO: 読み上げを実装し、設定と投稿画面の再生・停止操作を接続する。 */}
      <fieldset className={sharedStyles.group} disabled>
        <legend>
          {t('settings.speech')}
          <ComingSoonLabel ariaLabel={t('settings.speechSoon')} />
        </legend>
        <p>{t('settings.speechUnavailable')}</p>
        <label className={sharedStyles.toggle}>
          <input
            type="checkbox"
            checked={speechEnabled}
            onChange={(event) => setSpeechEnabled(event.target.checked)}
          />
          <span>{t('settings.autoSpeech')}</span>
        </label>
      </fieldset>
    </section>
  )
}
