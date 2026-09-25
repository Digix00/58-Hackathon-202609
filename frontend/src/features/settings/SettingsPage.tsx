import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { ProfileSettings } from '../profile/ProfileSettings'
import { ComingSoonLabel } from '../../shared/components/ComingSoonLabel'
import sharedStyles from '../../shared/styles/Settings.module.css'
import styles from './SettingsPage.module.css'
import { updateUserDisplayLanguage } from '../profile/profileApi'

const languageOptions = [
  { value: 'original', label: '原文' },
  { value: 'jaHira', label: 'ひらがな' },
  { value: 'en', label: '英語' },
] as const

const fontSizeOptions = [
  { value: 'normal', label: '標準' },
  { value: 'large', label: '大きく表示' },
] as const

export function SettingsPage() {
  const { status: authStatus, refresh } = useAuth()
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

      setLanguage(value)
      await refresh()
      setLanguageStatus('saved')
    } catch {
      setLanguageStatus('failed')
      setLanguageError('表示形式を保存できませんでした')
    }
  }

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.heading}>
        <h1 id="settings-title">設定</h1>
      </header>

      <fieldset className={sharedStyles.group}>
        <legend>文字サイズ</legend>
        <div className={sharedStyles.choiceRow}>
          {fontSizeOptions.map((option) => (
            <label key={option.value} className={sharedStyles.choice}>
              <input
                type="radio"
                name="font-size"
                checked={fontSize === option.value}
                onChange={() => setFontSize(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset
        className={sharedStyles.group}
        disabled={authStatus !== 'authenticated' || languageStatus === 'saving'}
      >
        <legend>都道府県名の表記</legend>
        {authStatus !== 'authenticated' ? (
          <p>LINEでログインすると、選んだ表記をアカウントに保存できます。</p>
        ) : (
          <p>悩みの都道府県名を選んだ表記で表示します。</p>
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
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {languageStatus === 'saving' ? <p role="status">保存しています…</p> : null}
        {languageStatus === 'saved' ? <p role="status">表示形式を保存しました。</p> : null}
        {languageError ? <p role="alert">{languageError}</p> : null}
      </fieldset>

      <ProfileSettings />

      {/* TODO: 読み上げを実装し、設定と投稿画面の再生・停止操作を接続する。 */}
      <fieldset className={sharedStyles.group} disabled>
        <legend>
          読み上げ <ComingSoonLabel ariaLabel="読み上げは準備中です" />
        </legend>
        <p>読み上げは、まだお使いいただけません。</p>
        <label className={sharedStyles.toggle}>
          <input
            type="checkbox"
            checked={speechEnabled}
            onChange={(event) => setSpeechEnabled(event.target.checked)}
          />
          <span>投稿を開いたら読み上げる</span>
        </label>
      </fieldset>
    </section>
  )
}
