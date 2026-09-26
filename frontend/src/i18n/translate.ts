import { messages, type MessageKey } from './messages.ts'
import type { DisplayLanguage } from '../app/providers/DisplaySettingsContext'

export type UiLanguage = DisplayLanguage
export type MessageValues = Record<string, string | number | undefined>

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(messages, value)
}

export function translate(
  language: UiLanguage,
  key: MessageKey,
  values: MessageValues = {},
): string {
  const template = messages[key][language === 'en' ? 1 : 0]
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    values[name] === undefined ? placeholder : String(values[name]),
  )
}

/** サーバーの自由文を画面へ流さず、既知のコードと操作ごとの既定文へ変換する。 */
export function apiErrorMessage(code: string | undefined, fallback: MessageKey): MessageKey {
  switch (code) {
    case 'AUTHENTICATION_REQUIRED':
    case 'UNAUTHORIZED':
    case 'SESSION_EXPIRED':
      return 'error.authRequired'
    case 'INVALID_REQUEST':
    case 'VALIDATION_ERROR':
      return 'error.invalidRequest'
    case 'USER_DELETED':
      return 'error.userDeleted'
    case 'NOT_FOUND':
    case 'CONCERN_NOT_FOUND':
      return 'error.notFound'
    case 'RATE_LIMITED':
    case 'RATE_LIMIT_EXCEEDED':
    case 'TOO_MANY_REQUESTS':
      return 'error.rateLimited'
    default:
      return fallback
  }
}
