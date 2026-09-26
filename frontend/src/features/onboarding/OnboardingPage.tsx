import { useTranslation } from '../../i18n/useTranslation'
import type { CSSProperties, RefObject } from 'react'
import { Navigate } from 'react-router'
import { LoginGuide, OpenInLiffGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { useAuth } from '../../auth/useAuth'
import { LoadingState } from '../../shared/components/AsyncStates'
import { NumberInputField, SelectField } from '../../shared/components/FormFields'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { NotebookOpening, NotebookStack } from '../../shared/components/NotebookStack'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { GENDERS, REGION_OPTIONS, type Gender } from '../profile/profileApi'
import { CoverArt } from './CoverArt'
import { CoverStickers } from './CoverStickers'
import { SheetDoodles } from './SheetDoodles'
import { useOnboardingNotebook, type OnboardingTurn } from './useOnboardingNotebook'
import {
  birthError,
  onboardingSlips,
  type OnboardingDraft,
  type OnboardingFieldUpdate,
  type OnboardingPage as OnboardingPageName,
  type OnboardingSlip,
} from './onboardingSteps'
import styles from './OnboardingPage.module.css'
import type { MessageKey } from '../../i18n/messages'
import { genderLabel, regionLabel } from '../../shared/concernPresentation'

const currentYear = new Date().getFullYear()

/** 読み上げへ渡す、いま開いている紙の見出し。紙が替わったことを言葉で伝える。 */
const PAGE_TITLES: Record<OnboardingPageName, MessageKey> = {
  cover: 'onboarding.welcome',
  birth: 'onboarding.birth',
  gender: 'onboarding.gender',
  region: 'onboarding.region',
  done: 'onboarding.done',
}

/** めくり直すたびにアニメーションを最初から流すための鍵。 */
function turningKey(turning: OnboardingTurn) {
  return `${turning.page}-${turning.direction}`
}

/**
 * 紙の上辺にはさんだしおり。
 *
 * 書けた項目だけが増えていく。あと何枚あるかを数字や帯で示さないのは、
 * 残りを数えさせると、書く紙ではなく手続きの画面になるため。
 *
 * 押せる要素にはしない。戻る操作は紙のふもとの「ひとつ前へ」に一本化する。
 * 小さなしおりを操作にすると、44px の指の置き場を紙の本文の上へ重ねることになる。
 */
function OnboardingSlips({ slips }: { slips: OnboardingSlip[] }) {
  if (slips.length === 0) return null

  return (
    <span className={styles.slips}>
      {slips.map((slip, order) => (
        <span
          key={slip.page}
          className={styles.slip}
          style={
            { '--slip': slip.slip, '--slip-tilt': `${order % 2 ? 1.4 : -1.8}deg` } as CSSProperties
          }
        >
          {slip.label}
        </span>
      ))}
    </span>
  )
}

/**
 * 表紙。
 *
 * 最初の1枚を問いではなく表紙にして、書きはじめを「ノートを開く」動作にする。
 * ここに置くのは題字と短い一言、そしてクレヨンの絵だけにし、
 * 何を聞かれるのか、あと何枚あるのかは予告しない。
 */
function CoverSheet() {
  const { t } = useTranslation()

  return (
    <>
      <CoverArt />
      <p className={styles.coverTitle}>{t('onboarding.welcome')}</p>
      <p className={styles.coverLead}>
        {t('onboarding.lead')}
        <br />
        {t('onboarding.leadMore')}
      </p>
    </>
  )
}

function BirthSheet({
  draft,
  disabled,
  onFieldChange,
}: {
  draft: OnboardingDraft
  disabled: boolean
  onFieldChange: (update: OnboardingFieldUpdate) => void
}) {
  const { t, message } = useTranslation()

  const error = birthError(draft)

  return (
    <>
      <p className={styles.question}>{t(PAGE_TITLES.birth)}</p>
      <p className={styles.note}>{t('onboarding.agePrivacy')}</p>
      <div className={styles.birthFields}>
        <NumberInputField
          label={t('profile.birthYear')}
          inputMode="numeric"
          min="1900"
          max={currentYear}
          placeholder={t('profile.yearExample')}
          suffix={t('profile.yearSuffix')}
          value={draft.birthYear}
          disabled={disabled}
          onValueChange={(value) => onFieldChange({ field: 'birthYear', value })}
        />
        <NumberInputField
          label={t('profile.birthMonth')}
          inputMode="numeric"
          min="1"
          max="12"
          placeholder={t('profile.monthExample')}
          suffix={t('profile.monthSuffix')}
          value={draft.birthMonth}
          disabled={disabled}
          onValueChange={(value) => onFieldChange({ field: 'birthMonth', value })}
        />
      </div>
      {error ? (
        <p className={styles.fieldError} role="alert">
          {message(error, { min: 1900, max: currentYear })}
        </p>
      ) : null}
    </>
  )
}

/**
 * 性別の紙。
 *
 * ここだけ「つぎへ」を置かない。選ぶことがそのまま答えなので、
 * 選んだ手でそのまま紙がめくれる。確定の操作をもう一つ挟むと、
 * 選び直しを迷わせるだけで、選んだ内容は変わらない。
 */
function GenderSheet({
  draft,
  disabled,
  onChoose,
}: {
  draft: OnboardingDraft
  disabled: boolean
  onChoose: (value: Gender) => void
}) {
  const { t, language } = useTranslation()

  return (
    <>
      <p className={styles.question}>{t(PAGE_TITLES.gender)}</p>
      <p className={styles.note}>{t('onboarding.genderPrivacy')}</p>
      <div className={styles.choices}>
        {GENDERS.map((option, order) => (
          <button
            key={option.value}
            type="button"
            className={styles.choice}
            style={{ '--slip-tilt': `${order % 2 ? 0.8 : -0.9}deg` } as CSSProperties}
            aria-pressed={draft.gender === option.value}
            disabled={disabled}
            onClick={() => onChoose(option.value)}
          >
            {genderLabel(option.value, language)}
          </button>
        ))}
      </div>
    </>
  )
}

function RegionSheet({
  draft,
  disabled,
  onFieldChange,
}: {
  draft: OnboardingDraft
  disabled: boolean
  onFieldChange: (update: OnboardingFieldUpdate) => void
}) {
  const { t, language } = useTranslation()

  return (
    <>
      <p className={styles.question}>{t('onboarding.region')}</p>
      <p className={styles.note}>{t('onboarding.regionPrivacy')}</p>
      <SelectField
        label={t('common.region')}
        value={draft.regionCode}
        options={REGION_OPTIONS.map(([value]) => ({
          value,
          label: regionLabel(value, language) ?? value,
        }))}
        disabled={disabled}
        onChange={(value) => onFieldChange({ field: 'regionCode', value })}
      />
    </>
  )
}

/**
 * 仕上げの紙。
 *
 * 書いた3枚のしおりを、そのまま1枚の紙へ貼り直して名札にする。
 * ここに絵を置かないのは、絵より先に自分の書いたものを見てほしいため。
 */
function DoneSheet({ slips }: { slips: OnboardingSlip[] }) {
  const { t } = useTranslation()

  return (
    <>
      <p className={styles.question}>{t(PAGE_TITLES.done)}</p>
      <ul className={styles.nameplate}>
        {slips.map((slip, order) => (
          <li
            key={slip.page}
            className={styles.nameplateSlip}
            style={
              {
                '--slip': slip.slip,
                '--slip-tilt': `${order % 2 ? 1.2 : -1.6}deg`,
              } as CSSProperties
            }
          >
            {slip.label}
          </li>
        ))}
      </ul>
      <p className={styles.note}>{t('onboarding.editHint')}</p>
    </>
  )
}

type SheetProps = {
  page: OnboardingPageName
  index: number
  draft: OnboardingDraft
  slips: OnboardingSlip[]
  disabled: boolean
  swipeTarget?: boolean
  onFieldChange: (update: OnboardingFieldUpdate) => void
  onChooseGender: (value: Gender) => void
}

function OnboardingSheet({
  page,
  draft,
  slips,
  disabled,
  swipeTarget = false,
  onFieldChange,
  onChooseGender,
}: SheetProps) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${turnStyles.page} ${
        page === 'cover' ? styles.cover : ''
      } ${page === 'region' ? styles.regionCard : ''}`}
      data-notebook-swipe-target={swipeTarget ? '' : undefined}
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
      {/* 紙の余白のラクガキ。本文より後ろに敷くので、問いの前には出ない。 */}
      <SheetDoodles page={page} />
      {page === 'cover' || page === 'done' ? null : <OnboardingSlips slips={slips} />}
      {page === 'cover' ? <CoverSheet /> : null}
      {page === 'birth' ? (
        <BirthSheet draft={draft} disabled={disabled} onFieldChange={onFieldChange} />
      ) : null}
      {page === 'gender' ? (
        <GenderSheet draft={draft} disabled={disabled} onChoose={onChooseGender} />
      ) : null}
      {page === 'region' ? (
        <RegionSheet draft={draft} disabled={disabled} onFieldChange={onFieldChange} />
      ) : null}
      {page === 'done' ? <DoneSheet slips={slips} /> : null}
    </article>
  )
}

type OnboardingStackProps = Omit<SheetProps, 'page' | 'index' | 'swipeTarget'> & {
  facePage: OnboardingPageName
  faceIndex: number
  opened: boolean
  /** 表紙を開きはじめたか。押し上げの時点から、本が広がりシールが散る。 */
  opening: boolean
  turning: OnboardingTurn | null
  stackRef: RefObject<HTMLDivElement | null>
  onTurningFinished: () => void
}

function OnboardingStack({
  facePage,
  faceIndex,
  opened,
  opening,
  turning,
  stackRef,
  onTurningFinished,
  ...sheetProps
}: OnboardingStackProps) {
  return (
    <NotebookOpening ref={stackRef} opening={opening}>
      <NotebookStack
        opened={opened}
        decoration={!opened ? <CoverStickers opening={opening} /> : null}
        turning={
          turning ? (
            <NotebookTurn
              key={turningKey(turning)}
              variant={turning.page === 'cover' ? 'cover' : 'page'}
              startAngle={turning.startAngle}
              direction={turning.direction}
              onFinish={onTurningFinished}
            >
              {/*
               * めくられている紙は写し。指も読み上げも通さないが、入力欄は
               * それだけでは focus が残るので、紙ごと inert にして外す。
               */}
              <div className={styles.frozen} inert>
                <OnboardingSheet
                  page={turning.page}
                  index={turning.index}
                  {...sheetProps}
                  disabled
                />
              </div>
            </NotebookTurn>
          ) : null
        }
      >
        <div key={`${facePage}-${faceIndex}`} className={styles.enter}>
          <OnboardingSheet page={facePage} index={faceIndex} swipeTarget {...sheetProps} />
        </div>
      </NotebookStack>
    </NotebookOpening>
  )
}

type OnboardingActionsProps = {
  page: OnboardingPageName
  canGoNext: boolean
  canGoBack: boolean
  saving: boolean
  error: string | null
  onNext: () => void
  onBack: () => void
  onSubmit: () => void
}

function OnboardingActions({
  page,
  canGoNext,
  canGoBack,
  saving,
  error,
  onNext,
  onBack,
  onSubmit,
}: OnboardingActionsProps) {
  const { t, message } = useTranslation()

  return (
    <div className={styles.actions}>
      {page === 'cover' ? (
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.coverButton}`}
          onClick={onNext}
        >
          {t('onboarding.open')}
          <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {page === 'birth' || page === 'region' ? (
        <button
          type="button"
          className={actionStyles.primary}
          disabled={!canGoNext}
          onClick={onNext}
        >
          {t('onboarding.next')}
          <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {page === 'done' ? (
        <button type="button" className={actionStyles.primary} disabled={saving} onClick={onSubmit}>
          {saving ? t('onboarding.saving') : t('onboarding.start')}
        </button>
      ) : null}
      {error ? (
        <p className={styles.submitError} role="alert">
          {message(error)}
        </p>
      ) : null}
      {canGoBack ? (
        <button type="button" className={actionStyles.text} onClick={onBack}>
          <span aria-hidden="true">←</span>
          {t('onboarding.previous')}
        </button>
      ) : null}
    </div>
  )
}

/**
 * はじめの1ページ。
 *
 * LINEログインのあと、投稿・クイズ・履歴へ進む前に一度だけ通る紙。
 * 4項目を1枚のフォームに並べず、1問ずつ紙を分けてめくるのは、
 * 登録の手続きではなく、自分の本の1ページ目を書く時間にするため。
 */
export function OnboardingPage() {
  const { t, language } = useTranslation()

  const { state: runtime } = useRuntime()
  const { status: authStatus, user } = useAuth()
  const notebook = useOnboardingNotebook()
  const {
    draft,
    index,
    facePage,
    currentPage,
    opened,
    opening,
    turning,
    saving,
    error,
    canGoNext,
    canGoBack,
    stackRef,
    swipe,
    updateField,
    chooseGender,
    goNext,
    goBack,
    onTurningFinished,
    submit,
  } = notebook

  if (runtime.status !== 'ready') return null
  if (runtime.mode === 'browser') return <OpenInLiffGuide />
  if (authStatus === 'initializing') return <LoadingState label={t('auth.checking')} />
  if (authStatus === 'anonymous') return <LoginGuide />
  // 書き終えた人には見せない。戻ってきても、読む画面へそのまま通す。
  if (user?.profileCompleted) return <Navigate to="/" replace />

  const slips = onboardingSlips(draft, language)

  return (
    <div className={styles.page}>
      <section
        className={styles.stage}
        aria-labelledby="onboarding-title"
        onTouchStart={swipe.handleTouchStart}
        onTouchMove={swipe.handleTouchMove}
        onTouchEnd={swipe.handleTouchEnd}
        onTouchCancel={swipe.handleTouchCancel}
      >
        <h1 id="onboarding-title" className={styles.srOnly}>
          {t('onboarding.title')}
        </h1>
        <OnboardingStack
          facePage={facePage}
          faceIndex={index}
          opened={opened}
          opening={opening}
          turning={turning}
          stackRef={stackRef}
          onTurningFinished={onTurningFinished}
          draft={draft}
          slips={slips}
          disabled={saving}
          onFieldChange={updateField}
          onChooseGender={chooseGender}
        />
      </section>
      <OnboardingActions
        page={currentPage}
        canGoNext={canGoNext}
        canGoBack={canGoBack}
        saving={saving}
        error={error}
        onNext={() => goNext()}
        onBack={() => goBack()}
        onSubmit={() => void submit()}
      />
      <p className={styles.srOnly} aria-live="polite">
        {t(PAGE_TITLES[currentPage])}
      </p>
    </div>
  )
}
