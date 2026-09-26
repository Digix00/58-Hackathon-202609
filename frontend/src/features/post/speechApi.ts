import type { MessageKey } from '../../i18n/messages'
import { apiClient, readApiError } from '../../lib/api'

export class SpeechInputError extends Error {
  readonly key: MessageKey
  constructor(key: MessageKey) {
    super(key)
    this.key = key
  }
}

export async function transcribeSpeech(audio: File, signal: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(60_000)
  try {
    const response = await apiClient.api.v1.speech.transcriptions.$post(
      { form: { audio, language: 'ja' } },
      { init: { signal: AbortSignal.any([signal, timeout]) } },
    )
    if (response.status !== 200) {
      const error = await readApiError(response)
      const messages: Record<string, MessageKey> = {
        AUTHENTICATION_REQUIRED: 'error.authRequired',
        RATE_LIMITED: 'speech.rateLimited',
        PAYLOAD_TOO_LARGE: 'speech.tooLarge',
        UNSUPPORTED_MEDIA_TYPE: 'speech.unsupported',
        INVALID_REQUEST: 'speech.invalid',
        UPSTREAM_UNAVAILABLE: 'speech.unavailable',
      }
      throw new SpeechInputError(messages[error?.code ?? ''] ?? 'speech.failed')
    }
    const result = await response.json()
    if (
      typeof result !== 'object' ||
      result === null ||
      !('text' in result) ||
      typeof result.text !== 'string'
    ) {
      throw new SpeechInputError('speech.failed')
    }
    if (!result.text.trim()) throw new SpeechInputError('speech.empty')
    return result.text.trim()
  } catch (error) {
    if (signal.aborted) throw error
    if (timeout.aborted) throw new SpeechInputError('speech.timeout')
    throw error
  }
}
