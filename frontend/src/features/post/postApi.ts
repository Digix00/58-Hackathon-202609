import { apiClient } from "../../lib/api";
import type { PostFormInput, PostResult } from "./postTypes";

export type CreateConcernResult =
  | { ok: true; concern: PostResult }
  | { ok: false; status: number; code: string; message: string };

export async function createConcern(
  input: PostFormInput,
): Promise<CreateConcernResult> {
  const response = await apiClient.api.v1.concerns.$post({
    json: {
      body: input.body.trim(),
      ...(input.ageGroup ? { ageGroup: input.ageGroup } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.regionCode ? { regionCode: input.regionCode } : {}),
      inputMethod: input.inputMethod,
    },
  });

  if (response.ok) {
    return { ok: true, concern: await response.json() };
  }

  const body = await readErrorBody(response);
  return {
    ok: false,
    status: response.status,
    code: body?.error.code ?? "UNKNOWN_ERROR",
    message:
      body?.error.message ?? "投稿に失敗しました。時間をおいて再度お試しください",
  };
}

async function readErrorBody(response: {
  json(): Promise<unknown>;
}): Promise<{ error: { code: string; message: string } } | null> {
  try {
    return (await response.json()) as {
      error: { code: string; message: string };
    };
  } catch {
    return null;
  }
}
