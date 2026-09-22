import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { GENDERS, REGION_OPTIONS, updateUserProfile, type Gender, type RegionCode } from './profileApi'

const currentYear = new Date().getFullYear()

type ProfileForm = {
  birthYear: number | ''
  birthMonth: number | ''
  gender: Gender | ''
  regionCode: RegionCode | ''
}

type ProfileStatus = 'idle' | 'saving' | 'saved' | 'failed'
type ProfileUser = {
  birthYear?: number | null
  birthMonth?: number | null
  gender?: Gender | null
  regionCode?: RegionCode | null
}

type ProfileFieldUpdate =
  | { field: 'birthYear'; value: ProfileForm['birthYear'] }
  | { field: 'birthMonth'; value: ProfileForm['birthMonth'] }
  | { field: 'gender'; value: ProfileForm['gender'] }
  | { field: 'regionCode'; value: ProfileForm['regionCode'] }

type ProfileState = {
  draft: ProfileForm
  status: ProfileStatus
  error: string | null
}

type ProfileAction =
  | { type: 'fieldChanged'; update: ProfileFieldUpdate }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string }

const initialProfileState: ProfileState = {
  draft: { birthYear: '', birthMonth: '', gender: '', regionCode: '' },
  status: 'idle',
  error: null,
}

function profileReducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case 'fieldChanged':
      return {
        draft: { ...state.draft, [action.update.field]: action.update.value },
        status: 'idle',
        error: null,
      }
    case 'saveStarted':
      return { ...state, status: 'saving', error: null }
    case 'saveSucceeded':
      return { ...state, status: 'saved', error: null }
    case 'saveFailed':
      return { ...state, status: 'failed', error: action.message }
  }
}

function getEffectiveProfile(draft: ProfileForm, user: ProfileUser | null): ProfileForm {
  return {
    birthYear: draft.birthYear !== '' ? draft.birthYear : user?.birthYear ?? '',
    birthMonth: draft.birthMonth !== '' ? draft.birthMonth : user?.birthMonth ?? '',
    gender: draft.gender !== '' ? draft.gender : user?.gender ?? '',
    regionCode: draft.regionCode !== '' ? draft.regionCode : user?.regionCode ?? '',
  }
}

/**
 * Intent: 認証済みユーザーのプロフィール入力と保存遷移を局所化する。
 * Boundary: 認証状態・保存可能な ViewModel・入力更新・保存操作だけを公開する。
 * State modeling: 入力値、保存中、成功、失敗を reducer の遷移として管理し、編集時に古い結果を消す。
 */
function useProfileSettings() {
  const { status: authStatus, user, refresh } = useAuth()
  const [state, dispatch] = useReducer(profileReducer, initialProfileState)
  const profileUser = user as (typeof user & ProfileUser) | null
  const effectiveProfile = getEffectiveProfile(state.draft, profileUser)
  const canSaveProfile = Object.values(effectiveProfile).every((value) => value !== '')

  const updateField = useCallback((update: ProfileFieldUpdate) => {
    dispatch({ type: 'fieldChanged', update })
  }, [])

  const saveProfile = useCallback(async (): Promise<void> => {
    if (!canSaveProfile || state.status === 'saving') return

    const { birthYear, birthMonth, gender, regionCode } = effectiveProfile
    if (birthYear === '' || birthMonth === '' || gender === '' || regionCode === '') return

    dispatch({ type: 'saveStarted' })
    try {
      const result = await updateUserProfile({ birthYear, birthMonth, gender, regionCode })
      if (!result.ok) {
        dispatch({ type: 'saveFailed', message: result.message })
        return
      }

      await refresh()
      dispatch({ type: 'saveSucceeded' })
    } catch {
      dispatch({ type: 'saveFailed', message: '設定を保存できませんでした' })
    }
  }, [canSaveProfile, effectiveProfile, refresh, state.status])

  return {
    authStatus,
    effectiveProfile,
    canSaveProfile,
    profileStatus: state.status,
    profileError: state.error,
    updateField,
    saveProfile,
  }
}

type PickerOption<T extends string | number> = { value: T; label: string }

function ProfilePicker<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T | ''
  options: readonly PickerOption<T>[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDetailsElement>(null)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '選択してください'

  useEffect(() => {
    if (!open) return

    const closeWhenTappedOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeWhenTappedOutside)
    return () => document.removeEventListener('pointerdown', closeWhenTappedOutside)
  }, [open])

  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      <details ref={pickerRef} className="profile-picker" open={open}>
        <summary
          className="profile-picker-trigger"
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={(event) => {
            event.preventDefault()
            if (!disabled) setOpen((current) => !current)
          }}
        >
          <span>{selectedLabel}</span><span className="profile-picker-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="profile-picker-menu" role="listbox" aria-label={`${label}の選択`}>
          <div className="profile-picker-options">
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

export function ProfileSettings() {
  const {
    authStatus,
    effectiveProfile,
    canSaveProfile,
    profileStatus,
    profileError,
    updateField,
    saveProfile,
  } = useProfileSettings()
  const isSaving = profileStatus === 'saving'

  return (
    <section className="setting-group" aria-labelledby="profile-title">
      <h3 id="profile-title">あなたの設定</h3>
      {authStatus !== 'authenticated' ? <p>年代・性別・地域の設定は、LINEでログインすると保存できます。</p> : <>
        <div className="profile-fields">
          <label className="profile-field">
            <span className="profile-field-label">生まれた年</span>
            <span className="profile-number">
              <input
                type="number"
                inputMode="numeric"
                min="1900"
                max={currentYear}
                placeholder="例）1990"
                value={effectiveProfile.birthYear}
                disabled={isSaving}
                onChange={(event) => updateField({ field: 'birthYear', value: event.target.value ? Number(event.target.value) : '' })}
              />
              <span aria-hidden="true">年</span>
            </span>
          </label>
          <label className="profile-field">
            <span className="profile-field-label">生まれた月</span>
            <span className="profile-number">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="12"
                placeholder="例）4"
                value={effectiveProfile.birthMonth}
                disabled={isSaving}
                onChange={(event) => updateField({ field: 'birthMonth', value: event.target.value ? Number(event.target.value) : '' })}
              />
              <span aria-hidden="true">月</span>
            </span>
          </label>
          <ProfilePicker
            label="性別"
            value={effectiveProfile.gender}
            options={GENDERS}
            disabled={isSaving}
            onChange={(value) => updateField({ field: 'gender', value })}
          />
          <ProfilePicker
            label="地域"
            value={effectiveProfile.regionCode}
            options={REGION_OPTIONS.map(([value, label]) => ({ value, label }))}
            disabled={isSaving}
            onChange={(value) => updateField({ field: 'regionCode', value })}
          />
        </div>
        <button type="button" className="secondary-button" disabled={!canSaveProfile || isSaving} onClick={() => void saveProfile()}>
          {isSaving ? '保存しています…' : '設定を保存する'}
        </button>
        <p className="setting-feedback" aria-live="polite">{profileStatus === 'saved' ? '設定を保存しました。' : profileError}</p>
      </>}
    </section>
  )
}
