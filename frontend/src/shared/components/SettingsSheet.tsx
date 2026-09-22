import type { ReactNode } from 'react'
import {
  type DisplayLanguage,
  type FontSize,
  useDisplaySettings,
} from '../../app/providers/DisplaySettingsContext'
import { useSettingsDialog } from '../hooks/useSettingsDialog'
import styles from './SettingsSheet.module.css'

type SettingsSheetProps = {
  open: boolean
  onClose: () => void
  profileSettings: ReactNode
}

const languageOptions: Array<{ value: DisplayLanguage; label: string }> = [
  { value: 'original', label: '原文' },
  { value: 'hira', label: 'ひらがな' },
  { value: 'en', label: '英語' },
]

const fontSizeOptions: Array<{ value: FontSize; label: string }> = [
  { value: 'normal', label: '標準' },
  { value: 'large', label: '大きく表示' },
]

export function SettingsSheet({ open, onClose, profileSettings }: SettingsSheetProps) {
  const { dialogRef, handleClose } = useSettingsDialog({ open, onClose })
  const { fontSize, language, speechEnabled, setFontSize, setLanguage, setSpeechEnabled } =
    useDisplaySettings()

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="settings-title"
      onClose={handleClose}
    >
      <div
        className={`${styles.sheet} ${fontSize === 'large' ? styles.large : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.heading}>
          <h2 id="settings-title">設定</h2>
          <button
            className={styles.iconButton}
            type="button"
            onClick={onClose}
            aria-label="設定を閉じる"
          >
            <svg
              className={styles.closeIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <g filter="url(#crayon-edge)">
                <path d="M5.2 5.1C8.6 8.4 12.2 12.1 18.8 18.7" />
                <path d="M18.8 5.2C15.1 8.6 11.8 12.2 5.1 18.9" />
                <path className={styles.closeTrace} d="M5.5 5.4C8.8 8.8 12.3 12.3 18.4 18.4" />
                <path className={styles.closeTrace} d="M18.5 5.5C15.1 8.8 11.8 12.4 5.5 18.6" />
              </g>
            </svg>
          </button>
        </div>
        <fieldset className={styles.group}>
          <legend>文字サイズ</legend>
          <div className={styles.choiceRow}>
            {fontSizeOptions.map((option) => (
              <label key={option.value} className={styles.choice}>
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
        <fieldset className={styles.group}>
          <legend>表示することば</legend>
          <div className={styles.choiceRow}>
            {languageOptions.map((option) => (
              <label key={option.value} className={styles.choice}>
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
        {profileSettings}
        <fieldset className={styles.group}>
          <legend>読み上げ</legend>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={speechEnabled}
              onChange={(event) => setSpeechEnabled(event.target.checked)}
            />
            <span>投稿を開いたら読み上げる</span>
          </label>
        </fieldset>
      </div>
      <button
        className={styles.backdrop}
        type="button"
        onClick={onClose}
        aria-label="背景を選んで設定を閉じる"
      />
    </dialog>
  )
}
