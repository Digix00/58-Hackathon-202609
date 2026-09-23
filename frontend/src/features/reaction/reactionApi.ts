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
      message: body?.error.message ?? 'リアクションに失敗しました。時間をおいて再度お試しください',
    }
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      message: '通信に失敗しました。ネットワークを確認して再度お試しください',
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
