import { useEffect, useRef } from 'react'
import { useDisplaySettings, type DisplayLanguage, type FontSize } from '../../app/providers/DisplaySettingsProvider'

type SettingsSheetProps = { open: boolean; onClose: () => void }

const languageOptions: Array<{ value: DisplayLanguage; label: string }> = [
  { value: 'original', label: '原文' }, { value: 'hira', label: 'ひらがな' }, { value: 'en', label: '英語' },
]
const fontSizeOptions: Array<{ value: FontSize; label: string }> = [
  { value: 'normal', label: '標準' }, { value: 'large', label: '大きく表示' },
]

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { fontSize, language, setFontSize, setLanguage } = useDisplaySettings()

  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    sheet?.querySelector<HTMLElement>('button, input')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !sheet) return
      const controls = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <div ref={sheetRef} className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading"><h2 id="settings-title">表示の設定</h2><button className="icon-button" type="button" onClick={onClose} aria-label="設定を閉じる">×</button></div>
        <fieldset className="setting-group"><legend>文字サイズ</legend><div className="choice-row">{fontSizeOptions.map((option) => <label key={option.value} className="choice"><input type="radio" name="font-size" checked={fontSize === option.value} onChange={() => setFontSize(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>
        <fieldset className="setting-group"><legend>表示することば</legend><div className="choice-row">{languageOptions.map((option) => <label key={option.value} className="choice"><input type="radio" name="display-language" checked={language === option.value} onChange={() => setLanguage(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>
        <section className="setting-group" aria-labelledby="speech-title"><h3 id="speech-title">読み上げ</h3><p>投稿を開くと、ここから読み上げられます。</p><button type="button" className="secondary-button" disabled>読み上げる文章がありません</button></section>
      </div>
    </div>
  )
}
