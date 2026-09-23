import { apiClient, withApiTimeout } from '../../lib/api'

export async function recordConcernView(concernId: string): Promise<boolean> {
  try {
    const response = await withApiTimeout(() =>
      apiClient.api.v1.concerns[':concernId'].views.$post({
        param: { concernId },
      }),
    )
    return response.ok
  } catch {
    return false
  }
}
