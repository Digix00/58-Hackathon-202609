import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import styles from './FormFields.module.css'

type FieldSize = 'regular' | 'compact'
/** 下に開く余白がない場所（画面の下端など）では、選択肢を上へ開く。 */
type MenuPlacement = 'down' | 'up'
type FieldOption<T extends string | number> = { value: T; label: string }

type NumberInputFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'size' | 'type' | 'value'
> & {
  label: string
  value: number | ''
  suffix?: ReactNode
  size?: FieldSize
  onValueChange: (value: number | '') => void
}

export function NumberInputField({
  label,
  value,
  suffix,
  size = 'regular',
  onValueChange,
  ...inputProps
}: NumberInputFieldProps) {
  return (
    <label className={styles.field} data-size={size}>
      <span className={styles.label}>{label}</span>
      <span className={styles.numberInput}>
        <input
          {...inputProps}
          type="number"
          value={value}
          onChange={(event) => onValueChange(event.target.value ? Number(event.target.value) : '')}
        />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </span>
    </label>
  )
}

type SelectFieldProps<T extends string | number> = {
  label: string
  value: T | ''
  options: readonly FieldOption<T>[]
  placeholder?: string
  disabled?: boolean
  size?: FieldSize
  placement?: MenuPlacement
  onChange: (value: T) => void
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  placeholder = '選択してください',
  disabled = false,
  size = 'regular',
  placement = 'down',
  onChange,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef<HTMLDetailsElement>(null)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? placeholder

  const isOpen = open && !disabled

  useEffect(() => {
    if (!isOpen) return

    const closeWhenTappedOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !selectRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeWhenTappedOutside)
    return () => document.removeEventListener('pointerdown', closeWhenTappedOutside)
  }, [isOpen])

  return (
    <div className={styles.field} data-size={size}>
      <span className={styles.label}>{label}</span>
      <details ref={selectRef} className={styles.select} data-placement={placement} open={isOpen}>
        <summary
          className={styles.selectTrigger}
          aria-disabled={disabled}
          aria-expanded={isOpen}
          tabIndex={disabled ? -1 : 0}
          onClick={(event) => {
            event.preventDefault()
            if (!disabled) setOpen((current) => !current)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
            }
          }}
        >
          <span>{selectedLabel}</span>
          <span className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.menu} role="listbox" aria-label={`${label}の選択`}>
          <div className={styles.options}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? styles.selected : undefined}
                disabled={disabled}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
