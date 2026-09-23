import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { ProfileSettings } from '../profile/ProfileSettings'
import { ComingSoonLabel } from '../../shared/components/ComingSoonLabel'
import sharedStyles from '../../shared/styles/Settings.module.css'
import styles from './SettingsPage.module.css'

const languageOptions = [
  { value: 'original', label: '原文' },
  { value: 'hira', label: 'ひらがな' },
  { value: 'en', label: '英語' },
] as const

const fontSizeOptions = [
  { value: 'normal', label: '標準' },
  { value: 'large', label: '大きく表示' },
] as const

export function SettingsPage() {
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()

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

      {/* TODO: 表示言語の変換を実装し、選択した言語を投稿本文へ反映できるようにする。 */}
      <fieldset className={sharedStyles.group} disabled>
        <legend>
          表示することば <ComingSoonLabel ariaLabel="表示することばは準備中です" />
        </legend>
        <p>現在は原文でお読みください。</p>
        <div className={sharedStyles.choiceRow}>
          {languageOptions.map((option) => (
            <label key={option.value} className={sharedStyles.choice}>
              <input
                type="radio"
                name="display-language"
                checked={language === option.value}
                onChange={() => setLanguage(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
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
