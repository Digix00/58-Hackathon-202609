import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

type FieldSize = 'regular' | 'compact'
type FieldOption<T extends string | number> = { value: T; label: string }

type NumberInputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'type' | 'value'> & {
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
    <label className="form-field" data-size={size}>
      <span className="form-field-label">{label}</span>
      <span className="form-number-input">
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
  onChange: (value: T) => void
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  placeholder = '選択してください',
  disabled = false,
  size = 'regular',
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
    <div className="form-field" data-size={size}>
      <span className="form-field-label">{label}</span>
      <details ref={selectRef} className="form-select" open={isOpen}>
        <summary
          className="form-select-trigger"
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
          <span>{selectedLabel}</span><span className="form-select-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="form-select-menu" role="listbox" aria-label={`${label}の選択`}>
          <div className="form-select-options">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'selected' : ''}
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
