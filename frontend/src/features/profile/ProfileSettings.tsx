import { useTranslation } from '../../i18n/useTranslation'
import { useCallback, useReducer } from 'react'
import { useAuth } from '../../auth/useAuth'
import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import { genderLabel, regionLabel } from '../../shared/concernPresentation'
import { NumberInputField, SelectField } from '../../shared/components/FormFields'
import settingsStyles from '../../shared/styles/Settings.module.css'
import actionStyles from '../../shared/styles/Actions.module.css'
import {
  GENDERS,
  REGION_OPTIONS,
  updateUserProfile,
  type Gender,
  type RegionCode,
} from './profileApi'
import styles from './ProfileSettings.module.css'

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
    birthYear: draft.birthYear !== '' ? draft.birthYear : (user?.birthYear ?? ''),
    birthMonth: draft.birthMonth !== '' ? draft.birthMonth : (user?.birthMonth ?? ''),
    gender: draft.gender !== '' ? draft.gender : (user?.gender ?? ''),
    regionCode: draft.regionCode !== '' ? draft.regionCode : (user?.regionCode ?? ''),
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
      dispatch({ type: 'saveFailed', message: 'error.profile' })
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

export function ProfileSettings() {
  const { language } = useDisplaySettings()
  const profile = useProfileSettings()
  return <ProfileSettingsView {...profile} language={language} />
}

function ProfileSettingsView({
  language,
  authStatus,
  effectiveProfile,
  canSaveProfile,
  profileStatus,
  profileError,
  updateField,
  saveProfile,
}: ReturnType<typeof useProfileSettings> & {
  language: ReturnType<typeof useDisplaySettings>['language']
}) {
  const { t, message } = useTranslation()
  const isSaving = profileStatus === 'saving'
  const profileMessage =
    profileStatus === 'saved' ? t('profile.saved') : profileError ? message(profileError) : null

  return (
    <section className={settingsStyles.group} aria-labelledby="profile-title">
      <h3 id="profile-title">{t('profile.title')}</h3>
      {authStatus !== 'authenticated' ? (
        <p>{t('profile.loginHint')}</p>
      ) : (
        <>
          <div className={styles.fields}>
            <NumberInputField
              label={t('profile.birthYear')}
              inputMode="numeric"
              min="1900"
              max={currentYear}
              placeholder={t('profile.yearExample')}
              value={effectiveProfile.birthYear}
              suffix={t('profile.yearSuffix')}
              disabled={isSaving}
              onValueChange={(value) => updateField({ field: 'birthYear', value })}
            />
            <NumberInputField
              label={t('profile.birthMonth')}
              inputMode="numeric"
              min="1"
              max="12"
              placeholder={t('profile.monthExample')}
              value={effectiveProfile.birthMonth}
              suffix={t('profile.monthSuffix')}
              disabled={isSaving}
              onValueChange={(value) => updateField({ field: 'birthMonth', value })}
            />
            <SelectField
              label={t('common.gender')}
              value={effectiveProfile.gender}
              options={GENDERS.map(({ value }) => ({
                value,
                label: genderLabel(value, language) ?? value,
              }))}
              disabled={isSaving}
              onChange={(value) => updateField({ field: 'gender', value })}
            />
            <SelectField
              label={t('common.region')}
              value={effectiveProfile.regionCode}
              options={REGION_OPTIONS.map(([value]) => ({
                value,
                label: regionLabel(value, language) ?? value,
              }))}
              disabled={isSaving}
              onChange={(value) => updateField({ field: 'regionCode', value })}
            />
          </div>
          <button
            type="button"
            className={actionStyles.secondary}
            disabled={!canSaveProfile || isSaving}
            onClick={() => void saveProfile()}
          >
            {isSaving ? t('common.saving') : t('profile.save')}
          </button>
          {profileMessage ? (
            <p className={styles.feedback} aria-live="polite">
              {profileMessage}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
