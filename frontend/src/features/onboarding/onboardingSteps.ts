import {
  GENDERS,
  REGION_OPTIONS,
  type Gender,
  type RegionCode,
  type UserProfileInput,
} from '../profile/profileApi'

/**
 * はじめの1ページに書くこと。
 *
 * 設定画面の「あなたの設定」と同じ4項目だが、あちらは書き直す紙、
 * こちらは初めて書く紙なので、1項目ずつ別の紙に分けて置く。
 */
export type OnboardingDraft = {
  birthYear: number | ''
  birthMonth: number | ''
  gender: Gender | ''
  regionCode: RegionCode | ''
}

export type OnboardingFieldUpdate =
  | { field: 'birthYear'; value: OnboardingDraft['birthYear'] }
  | { field: 'birthMonth'; value: OnboardingDraft['birthMonth'] }
  | { field: 'gender'; value: OnboardingDraft['gender'] }
  | { field: 'regionCode'; value: OnboardingDraft['regionCode'] }

export const emptyOnboardingDraft: OnboardingDraft = {
  birthYear: '',
  birthMonth: '',
  gender: '',
  regionCode: '',
}

/**
 * 紙の並び。
 *
 * 表紙で始めて、問いを1枚ずつ置き、最後の1枚で書いたものを見せる。
 * 問いを1枚にまとめないのは、フォームではなく絵本として読ませるため。
 */
export const ONBOARDING_PAGES = ['cover', 'birth', 'gender', 'region', 'done'] as const
export type OnboardingPage = (typeof ONBOARDING_PAGES)[number]

export const LAST_PAGE_INDEX = ONBOARDING_PAGES.length - 1

/** しおりを貼る紙だけを並べる。表紙と仕上げの紙には問いがない。 */
const QUESTION_PAGES = ['birth', 'gender', 'region'] as const
type QuestionPage = (typeof QUESTION_PAGES)[number]

/**
 * 紙の色。フィードと同じ本に見えるよう、同じ色づかいから順に取る。
 *
 * feed の themePalette を直接読まないのは、画面ごとの色の決め方が
 * 別のフィーチャの都合で変わらないようにするため。値だけをそろえる。
 */
export type OnboardingPalette = {
  /** 紙の地色。 */
  tint: string
  /** しおりの色。 */
  slip: string
  /** 紙の裏。めくっている最中にリングの左へ一瞬だけ覗く面。 */
  back: string
}

const palettes: readonly OnboardingPalette[] = [
  { tint: '#fffcf1', slip: '#f8d9b0', back: '#f5a86d' },
  { tint: '#fcfdf4', slip: '#cbe3b8', back: '#93cc78' },
  { tint: '#fbfcf8', slip: '#c9d6ef', back: '#84b0e6' },
  { tint: '#fffbf6', slip: '#f3cad5', back: '#f08fb0' },
  { tint: '#fffdec', slip: '#f0e199', back: '#f2cf4e' },
]

/** 表紙の裏。フィードの表紙と同じ色にして、同じノートとして扱う。 */
export const COVER_BACK_COLOR = '#a894dd'

export function paletteForIndex(index: number): OnboardingPalette {
  const slot = ((index % palettes.length) + palettes.length) % palettes.length
  return palettes[slot]
}

/** しおり1枚。答えた項目が、答えた順に紙の右端へ増えていく。 */
export type OnboardingSlip = {
  page: QuestionPage
  index: number
  label: string
  slip: string
}

function genderLabel(gender: Gender | ''): string {
  return GENDERS.find((option) => option.value === gender)?.label ?? ''
}

function regionLabel(regionCode: RegionCode | ''): string {
  return REGION_OPTIONS.find(([value]) => value === regionCode)?.[1] ?? ''
}

/**
 * 書けた項目の言葉。書けていない項目は空文字を返し、しおりを作らない。
 * 年月は確かめに通ったものだけを載せる。直してもらう値をしおりにすると、
 * 書き終えたものとして数えたことになる。
 */
function slipLabel(page: QuestionPage, draft: OnboardingDraft): string {
  switch (page) {
    case 'birth':
      return isBirthWritten(draft) && birthError(draft) === null
        ? `${draft.birthYear}年${draft.birthMonth}月`
        : ''
    case 'gender':
      return genderLabel(draft.gender)
    case 'region':
      return regionLabel(draft.regionCode)
  }
}

export function onboardingSlips(draft: OnboardingDraft): OnboardingSlip[] {
  return QUESTION_PAGES.flatMap((page) => {
    const label = slipLabel(page, draft)
    if (!label) return []

    const index = ONBOARDING_PAGES.indexOf(page)
    return [{ page, index, label, slip: paletteForIndex(index).slip }]
  })
}

const MIN_BIRTH_YEAR = 1900

function isBirthWritten(draft: OnboardingDraft): boolean {
  return draft.birthYear !== '' && draft.birthMonth !== ''
}

/**
 * 生まれた年月の確かめ。
 *
 * 同じ条件をバックエンドも持っているが、書き終えた紙を送ってから
 * 差し戻すと、めくった先で戻されることになる。書いた紙の上で伝える。
 */
export function birthError(draft: OnboardingDraft, now = new Date()): string | null {
  if (!isBirthWritten(draft)) return null

  const year = Number(draft.birthYear)
  const month = Number(draft.birthMonth)
  const currentYear = now.getFullYear()

  if (year < MIN_BIRTH_YEAR || year > currentYear) {
    return `生まれた年は${MIN_BIRTH_YEAR}年から${currentYear}年までで書いてください。`
  }
  if (month < 1 || month > 12) {
    return '生まれた月は1月から12月までで書いてください。'
  }
  if (year === currentYear && month > now.getMonth() + 1) {
    return 'これから来る月は選べません。'
  }
  return null
}

/** その紙を書き終えたか。書き終えた紙だけ、次へめくれる。 */
export function isPageAnswered(
  page: OnboardingPage,
  draft: OnboardingDraft,
  now = new Date(),
): boolean {
  switch (page) {
    case 'cover':
      return true
    case 'birth':
      return isBirthWritten(draft) && birthError(draft, now) === null
    case 'gender':
      return draft.gender !== ''
    case 'region':
      return draft.regionCode !== ''
    case 'done':
      return true
  }
}

/** 4項目がそろっていれば送れる形にする。ひとつでも欠けていれば送らない。 */
export function toUserProfileInput(
  draft: OnboardingDraft,
  now = new Date(),
): UserProfileInput | null {
  const { birthYear, birthMonth, gender, regionCode } = draft
  if (birthYear === '' || birthMonth === '' || gender === '' || regionCode === '') return null
  if (birthError(draft, now) !== null) return null

  return { birthYear, birthMonth, gender, regionCode }
}
