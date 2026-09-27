const timeFormatters: Record<string, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }),
  'ja-JP': new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }),
  jaHira: new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }),
}

/** 管理画面の日時を Asia/Tokyo で表示する。jaHira はひらがな表示用の数字だけの形式。 */
export function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : timeFormatters[locale].format(date)
}
