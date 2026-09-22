import { useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { GENDERS, REGION_OPTIONS, updateUserProfile, type Gender, type RegionCode } from './profileApi'

const currentYear = new Date().getFullYear()

type ProfileForm = {
  birthYear: number | ''
  birthMonth: number | ''
  gender: Gender | ''
  regionCode: RegionCode | ''
}

const emptyProfile: ProfileForm = { birthYear: '', birthMonth: '', gender: '', regionCode: '' }

type PickerOption<T extends string | number> = { value: T; label: string }

function ProfilePicker<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | ''
  options: readonly PickerOption<T>[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? '選択してください'

  return (
    <div className="profile-field">
      <span className="profile-field-label">{label}</span>
      <details className="profile-picker" open={open}>
        <summary className="profile-picker-trigger" onClick={(event) => { event.preventDefault(); setOpen((current) => !current) }}>
          <span>{selectedLabel}</span><span className="profile-picker-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="profile-picker-menu" role="listbox" aria-label={`${label}の選択`}>
          <div className="profile-picker-options">
            {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}
          </div>
        </div>
      </details>
    </div>
  )
}

export function ProfileSettings() {
  const { status: authStatus, user, refresh } = useAuth()
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [profileError, setProfileError] = useState<string | null>(null)
  const profileUser = user as (typeof user & {
    birthYear?: number | null
    birthMonth?: number | null
    gender?: Gender | null
    regionCode?: RegionCode | null
  }) | null
  const effectiveProfile: ProfileForm = {
    birthYear: profile.birthYear !== '' ? profile.birthYear : profileUser?.birthYear ?? '',
    birthMonth: profile.birthMonth !== '' ? profile.birthMonth : profileUser?.birthMonth ?? '',
    gender: profile.gender !== '' ? profile.gender : profileUser?.gender ?? '',
    regionCode: profile.regionCode !== '' ? profile.regionCode : profileUser?.regionCode ?? '',
  }
  const canSaveProfile = effectiveProfile.birthYear !== '' && effectiveProfile.birthMonth !== '' && effectiveProfile.gender !== '' && effectiveProfile.regionCode !== ''
  const saveProfile = async () => {
    if (!canSaveProfile) return
    const { birthYear, birthMonth, gender, regionCode } = effectiveProfile
    if (birthYear === '' || birthMonth === '' || gender === '' || regionCode === '') return
    setProfileStatus('saving')
    setProfileError(null)
    const result = await updateUserProfile({ birthYear, birthMonth, gender, regionCode })
    if (result.ok) {
      await refresh()
      setProfileStatus('saved')
      return
    }
    setProfileStatus('failed')
    setProfileError(result.message)
  }

  return (
    <section className="setting-group" aria-labelledby="profile-title">
      <h3 id="profile-title">あなたの設定</h3>
      {authStatus !== 'authenticated' ? <p>年代・性別・地域の設定は、LINEでログインすると保存できます。</p> : <>
        <div className="profile-fields">
          <label className="profile-field"><span className="profile-field-label">生まれた年</span><span className="profile-number"><input type="number" inputMode="numeric" min="1900" max={currentYear} placeholder="例）1990" value={effectiveProfile.birthYear} onChange={(event) => setProfile((current) => ({ ...current, birthYear: event.target.value ? Number(event.target.value) : '' }))} /><span aria-hidden="true">年</span></span></label>
          <label className="profile-field"><span className="profile-field-label">生まれた月</span><span className="profile-number"><input type="number" inputMode="numeric" min="1" max="12" placeholder="例）4" value={effectiveProfile.birthMonth} onChange={(event) => setProfile((current) => ({ ...current, birthMonth: event.target.value ? Number(event.target.value) : '' }))} /><span aria-hidden="true">月</span></span></label>
          <ProfilePicker label="性別" value={effectiveProfile.gender} options={GENDERS} onChange={(value) => setProfile((current) => ({ ...current, gender: value }))} />
          <ProfilePicker label="地域" value={effectiveProfile.regionCode} options={REGION_OPTIONS.map(([value, label]) => ({ value, label }))} onChange={(value) => setProfile((current) => ({ ...current, regionCode: value }))} />
        </div>
        <button type="button" className="secondary-button" disabled={!canSaveProfile || profileStatus === 'saving'} onClick={() => void saveProfile()}>{profileStatus === 'saving' ? '保存しています…' : '設定を保存する'}</button>
        <p className="setting-feedback" aria-live="polite">{profileStatus === 'saved' ? '設定を保存しました。' : profileError}</p>
      </>}
    </section>
  )
}
