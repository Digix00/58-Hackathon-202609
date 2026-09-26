import { apiErrorMessage } from '../../i18n/translate'
import { apiClient } from '../../lib/api'
import type { ConcernReactionResponse } from '../../lib/api'

export type RegisterConcernReactionResult =
  | { ok: true; reaction: ConcernReactionResponse }
  | { ok: false; status: number; code: string; message: string }

export async function registerConcernReaction(
  concernId: string,
): Promise<RegisterConcernReactionResult> {
  try {
    const response = await apiClient.api.v1.concerns[':concernId'].reactions.$post({
      param: { concernId },
      json: { reactionType: 'empathy' },
    })

    if (response.ok) {
      return {
        ok: true,
        reaction: (await response.json()) as ConcernReactionResponse,
      }
    }

    const body = await readErrorBody(response)
    return {
      ok: false,
      status: response.status,
      code: body?.error.code ?? 'UNKNOWN_ERROR',
      message: apiErrorMessage(body?.error?.code, 'error.reaction'),
    }
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'error.network',
    }
  }
}

async function readErrorBody(response: {
  json(): Promise<unknown>
}): Promise<{ error: { code: string; message: string } } | null> {
  try {
    return (await response.json()) as {
      error: { code: string; message: string }
    }
  } catch {
    return null
  }
}
