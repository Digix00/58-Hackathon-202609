import { useTranslation } from '../../i18n/useTranslation'
import type { ReactNode } from 'react'
import { ProfileSettings } from '../profile/ProfileSettings'
import { ComingSoonLabel } from '../../shared/components/ComingSoonLabel'
import sharedStyles from '../../shared/styles/Settings.module.css'
import styles from './SettingsPage.module.css'
import { useSettingsPage } from './useSettingsPage'

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
  const settings = useSettingsPage()
  return <SettingsPageView {...settings} profileSettings={<ProfileSettings />} />
}

function SettingsPageView({
  authStatus,
  fontSize,
  language,
  speechEnabled,
  languageStatus,
  languageError,
  fontSizeStatus,
  fontSizeError,
  setSpeechEnabled,
  selectLanguage,
  selectFontSize,
  profileSettings,
}: ReturnType<typeof useSettingsPage> & { profileSettings: ReactNode }) {
  const { t, message } = useTranslation()

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.heading}>
        <h1 id="settings-title">{t('nav.settings')}</h1>
      </header>

      <fieldset className={sharedStyles.group} disabled={fontSizeStatus === 'saving'}>
        <legend>{t('settings.fontSize')}</legend>
        {authStatus !== 'authenticated' ? <p>{t('settings.fontSizeLoginHint')}</p> : null}
        <div className={sharedStyles.choiceRow}>
          {fontSizeOptions.map((option) => (
            <label key={option.value} className={sharedStyles.choice}>
              <input
                type="radio"
                name="font-size"
                checked={fontSize === option.value}
                onChange={() => void selectFontSize(option.value)}
              />
              <span>{t(option.label)}</span>
            </label>
          ))}
        </div>
        {fontSizeStatus === 'saving' ? <p role="status">{t('common.saving')}</p> : null}
        {fontSizeStatus === 'saved' ? <p role="status">{t('settings.fontSizeSaved')}</p> : null}
        {fontSizeError ? <p role="alert">{message(fontSizeError)}</p> : null}
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

      {profileSettings}

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
