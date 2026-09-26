import type { CSSProperties, RefObject } from 'react'
import { Navigate } from 'react-router'
import { LoginGuide, OpenInLiffGuide } from '../../app/router'
import { useRuntime } from '../../app/providers/RuntimeContext'
import { useAuth } from '../../auth/useAuth'
import { LoadingState } from '../../shared/components/AsyncStates'
import { CoverStickers } from '../../shared/components/CoverStickers'
import { NumberInputField, SelectField } from '../../shared/components/FormFields'
import { NotebookBinding } from '../../shared/components/NotebookBinding'
import { NotebookTurn } from '../../shared/components/NotebookTurn'
import { notebookBindingStyle } from '../../shared/components/notebookBindingLayout'
import { notebookAngleForDrag } from '../../shared/hooks/useNotebookSwipe'
import actionStyles from '../../shared/styles/Actions.module.css'
import crayonStyles from '../../shared/styles/Crayon.module.css'
import turnStyles from '../../shared/styles/NotebookTurn.module.css'
import screen from '../../shared/styles/Screen.module.css'
import { GENDERS, REGION_OPTIONS, type Gender } from '../profile/profileApi'
import { CoverArt } from './CoverArt'
import { useOnboardingNotebook, type OnboardingTurn } from './useOnboardingNotebook'
import {
  COVER_BACK_COLOR,
  birthError,
  onboardingSlips,
  type OnboardingDraft,
  type OnboardingFieldUpdate,
  type OnboardingPage as OnboardingPageName,
  type OnboardingSlip,
} from './onboardingSteps'
import styles from './OnboardingPage.module.css'

/** めくり終えた紙をリング左側に残すときの、文字のない裏面。 */
const TURNED_BACK_COLOR = 'var(--color-surface)'

/** ページをめくっても紙の裏面が色変わりしないよう、裏面の色を固定する。 */
const PAGE_BACK_COLOR = '#e3d8c0'

const currentYear = new Date().getFullYear()

/** 読み上げへ渡す、いま開いている紙の見出し。紙が替わったことを言葉で伝える。 */
const PAGE_TITLES: Record<OnboardingPageName, string> = {
  cover: 'はじめまして',
  birth: 'いつ、生まれましたか。',
  gender: 'あなたのことは、どう書きますか。',
  region: 'あなたのいる地域を教えてください。',
  done: 'これで、はじめられます。',
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
  return (
    <>
      <CoverArt />
      <p className={styles.coverTitle}>はじめまして</p>
      <p className={styles.coverLead}>
        あなたのことを、
        <br />
        すこしだけ聞かせてください。
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
  const error = birthError(draft)

  return (
    <>
      <p className={styles.question}>{PAGE_TITLES.birth}</p>
      <p className={styles.note}>声に添えるのは年ではなく、10代・20代といった年代だけです。</p>
      <div className={styles.birthFields}>
        <NumberInputField
          label="生まれた年"
          inputMode="numeric"
          min="1900"
          max={currentYear}
          placeholder="例）1990"
          suffix="年"
          value={draft.birthYear}
          disabled={disabled}
          onValueChange={(value) => onFieldChange({ field: 'birthYear', value })}
        />
        <NumberInputField
          label="生まれた月"
          inputMode="numeric"
          min="1"
          max="12"
          placeholder="例）4"
          suffix="月"
          value={draft.birthMonth}
          disabled={disabled}
          onValueChange={(value) => onFieldChange({ field: 'birthMonth', value })}
        />
      </div>
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
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
  return (
    <>
      <p className={styles.question}>{PAGE_TITLES.gender}</p>
      <p className={styles.note}>年代・都道府県とあわせて、声に添えて公開します。</p>
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
            {option.label}
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
  return (
    <>
      <p className={styles.question}>あなたのいる地域を教えてください。</p>
      <p className={styles.note}>都道府県だけで大丈夫です。くわしい住所は聞きません。</p>
      <SelectField
        label="地域"
        value={draft.regionCode}
        options={REGION_OPTIONS.map(([value, label]) => ({ value, label }))}
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
  return (
    <>
      <p className={styles.question}>{PAGE_TITLES.done}</p>
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
      <p className={styles.note}>あとから「設定」でいつでも書き直せます。</p>
    </>
  )
}

type SheetProps = {
  page: OnboardingPageName
  index: number
  draft: OnboardingDraft
  slips: OnboardingSlip[]
  disabled: boolean
  dragX?: number
  onFieldChange: (update: OnboardingFieldUpdate) => void
  onChooseGender: (value: Gender) => void
}

function OnboardingSheet({
  page,
  draft,
  slips,
  disabled,
  dragX = 0,
  onFieldChange,
  onChooseGender,
}: SheetProps) {
  return (
    <article
      className={`${screen.paper} ${crayonStyles.edge} ${styles.card} ${turnStyles.page} ${
        page === 'cover' ? styles.cover : ''
      } ${page === 'region' ? styles.regionCard : ''} ${
        dragX !== 0 ? turnStyles.pageDragging : ''
      }`}
      style={
        {
          transform: dragX < 0 ? `rotateY(${notebookAngleForDrag(dragX)}deg)` : undefined,
        } as CSSProperties
      }
    >
      {/* とじ穴。リングと違い、これは紙の側にあるのでページと一緒に動く。 */}
      <NotebookBinding part="holes" />
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

type OnboardingStackProps = Omit<SheetProps, 'page' | 'index' | 'dragX'> & {
  facePage: OnboardingPageName
  faceIndex: number
  opened: boolean
  /** 表紙を開きはじめたか。押し上げの時点から、本が広がりシールが散る。 */
  opening: boolean
  turning: OnboardingTurn | null
  dragX: number
  stackRef: RefObject<HTMLDivElement | null>
  onTurningFinished: () => void
}

function OnboardingStack({
  facePage,
  faceIndex,
  opened,
  opening,
  turning,
  dragX,
  stackRef,
  onTurningFinished,
  ...sheetProps
}: OnboardingStackProps) {
  return (
    <div ref={stackRef} className={`${styles.stackMotion} ${opening ? styles.stackOpening : ''}`}>
      <div className={styles.stack} style={notebookBindingStyle}>
        {/*
         * 本の下に敷いたシール。大きい1枚は紙の下へ潜り込み、はみ出した側だけが見える。
         * 紙より先に置くのは、そうしないと紙の上に貼られて問いより前に出るため。
         * 紙束の中に置くので、表紙が開くときは本と一緒に大きくなる。
         * 表紙をめくりはじめたら、散り終えたまま外す。
         */}
        {!opened ? <CoverStickers scattering={opening} /> : null}
        <span className={`${styles.sheet} ${styles.sheetFar}`} aria-hidden="true" />
        <span className={`${styles.sheet} ${styles.sheetNear}`} aria-hidden="true" />
        {/* 奥側の線は紙に隠れ、めくった紙が離れると2枚の間に見える。 */}
        <NotebookBinding part="rear" />
        {/* めくり終えた紙は捨てず、最終フレームの姿勢のままリング左側に残す。 */}
        {opened ? (
          <div className={turnStyles.turned} aria-hidden="true">
            <div
              className={`${turnStyles.back} ${crayonStyles.edge}`}
              style={{ '--turn-back-color': TURNED_BACK_COLOR } as CSSProperties}
            >
              <NotebookBinding part="holes" back />
            </div>
          </div>
        ) : null}
        {turning ? <NotebookBinding key={turningKey(turning)} part="rear" between /> : null}
        {turning ? (
          <NotebookTurn
            key={turningKey(turning)}
            variant={turning.page === 'cover' ? 'cover' : 'page'}
            startAngle={turning.startAngle}
            direction={turning.direction}
            backColor={turning.page === 'cover' ? COVER_BACK_COLOR : PAGE_BACK_COLOR}
            onFinish={onTurningFinished}
          >
            {/*
             * めくられている紙は写し。指も読み上げも通さないが、入力欄は
             * それだけでは focus が残るので、紙ごと inert にして外す。
             */}
            <div className={styles.frozen} inert>
              <OnboardingSheet page={turning.page} index={turning.index} {...sheetProps} disabled />
            </div>
          </NotebookTurn>
        ) : null}
        <div key={`${facePage}-${faceIndex}`} className={styles.enter}>
          <OnboardingSheet page={facePage} index={faceIndex} dragX={dragX} {...sheetProps} />
        </div>
        {/* 手前側の線は金具として動かさない。 */}
        <NotebookBinding part="front" />
      </div>
    </div>
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
  return (
    <div className={styles.actions}>
      {page === 'cover' ? (
        <button
          type="button"
          className={`${actionStyles.primary} ${styles.coverButton}`}
          onClick={onNext}
        >
          ひらいてみる <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {page === 'birth' || page === 'region' ? (
        <button
          type="button"
          className={actionStyles.primary}
          disabled={!canGoNext}
          onClick={onNext}
        >
          つぎへ <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {page === 'done' ? (
        <button type="button" className={actionStyles.primary} disabled={saving} onClick={onSubmit}>
          {saving ? '書き込んでいます…' : 'はじめる'}
        </button>
      ) : null}
      {error ? (
        <p className={styles.submitError} role="alert">
          {error}
        </p>
      ) : null}
      {canGoBack ? (
        <button type="button" className={actionStyles.text} onClick={onBack}>
          <span aria-hidden="true">←</span> ひとつ前へ
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
  if (authStatus === 'initializing') return <LoadingState label="ログイン状態を確認しています…" />
  if (authStatus === 'anonymous') return <LoginGuide />
  // 書き終えた人には見せない。戻ってきても、読む画面へそのまま通す。
  if (user?.profileCompleted) return <Navigate to="/" replace />

  const slips = onboardingSlips(draft)

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
          はじめの1ページを書く
        </h1>
        <OnboardingStack
          facePage={facePage}
          faceIndex={index}
          opened={opened}
          opening={opening}
          turning={turning}
          dragX={swipe.dragX}
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
        {PAGE_TITLES[currentPage]}
      </p>
    </div>
  )
}
