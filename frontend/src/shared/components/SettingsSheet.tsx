import { useEffect, useRef } from 'react'
import {
  useDisplaySettings,
  type DisplayLanguage,
  type FontSize,
} from '../../app/providers/DisplaySettingsContext'

type SettingsSheetProps = { open: boolean; onClose: () => void }

const languageOptions: Array<{ value: DisplayLanguage; label: string }> = [
  { value: 'original', label: '原文' },
  { value: 'hira', label: 'ひらがな' },
  { value: 'en', label: '英語' },
]
const fontSizeOptions: Array<{ value: FontSize; label: string }> = [
  { value: 'normal', label: '標準' },
  { value: 'large', label: '大きく表示' },
]

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { fontSize, language, setFontSize, setLanguage } = useDisplaySettings()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLElement>('button, input')?.focus()
      return
    }
    if (dialog.open) dialog.close()
  }, [open])

  const handleDialogClose = () => {
    if (open) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-labelledby="settings-title"
      onClose={handleDialogClose}
    >
      <div className="settings-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <h2 id="settings-title">表示の設定</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="設定を閉じる">
            ×
          </button>
        </div>
        <fieldset className="setting-group">
          <legend>文字サイズ</legend>
          <div className="choice-row">
            {fontSizeOptions.map((option) => (
              <label key={option.value} className="choice">
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
        <fieldset className="setting-group">
          <legend>表示することば</legend>
          <div className="choice-row">
            {languageOptions.map((option) => (
              <label key={option.value} className="choice">
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
        <section className="setting-group" aria-labelledby="speech-title">
          <h3 id="speech-title">読み上げ</h3>
          <p>投稿を開くと、ここから読み上げられます。</p>
          <button type="button" className="secondary-button" disabled>
            読み上げる文章がありません
          </button>
        </section>
      </div>
      <button
        className="sheet-backdrop"
        type="button"
        onClick={onClose}
        aria-label="背景を選んで設定を閉じる"
      />
    </dialog>
  )
}
