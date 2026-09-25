import type { Context } from "hono";
import { createFactory } from "hono/factory";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import type { ISpeechUseCase } from "../application/usecase/speech.usecase";
import type { Bindings } from "../types";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
]);

const factory = createFactory<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>();
type SpeechContext = Context<{ Bindings: Bindings; Variables: AuthVariables }>;

export class SpeechHandler {
  private readonly speechUseCase: ISpeechUseCase;

  constructor(speechUseCase: ISpeechUseCase) {
    this.speechUseCase = speechUseCase;
  }

  readonly transcribe = factory.createHandlers(async (c) => {
    const requestId = setRequestId(c);
    if (!c.var.auth?.user) {
      return c.json(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "音声入力にはLINEログインが必要です",
            requestId,
          },
        },
        401,
      );
    }

    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return unsupportedMediaType(requestId, c);
    }

    let formData: FormData;
    try {
      formData = await c.req.raw.formData();
    } catch {
      return invalidRequest(requestId, c);
    }

    const audioFields = formData.getAll("audio");
    if (audioFields.length !== 1 || !(audioFields[0] instanceof File)) {
      return invalidRequest(requestId, c);
    }

    const audio = audioFields[0];
    if (audio.size === 0) {
      return invalidRequest(requestId, c);
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return c.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "音声ファイルは10 MiB以下にしてください",
            requestId,
          },
        },
        413,
      );
    }
    const audioType = audio.type.split(";", 1)[0].trim().toLowerCase();
    if (!SUPPORTED_AUDIO_TYPES.has(audioType)) {
      return unsupportedMediaType(requestId, c);
    }

    const languageFields = formData.getAll("language");
    if (
      languageFields.length > 1 ||
      (languageFields.length === 1 && typeof languageFields[0] !== "string")
    ) {
      return invalidRequest(requestId, c);
    }
    const language =
      languageFields.length === 0 ? "ja" : (languageFields[0] as string).trim();
    if (language !== "ja") {
      return invalidRequest(requestId, c);
    }

    try {
      const text = await this.speechUseCase.transcribe(
        await audio.arrayBuffer(),
      );
      return c.json({ text, language: "ja" as const }, 200);
    } catch {
      // Upstream errors may contain request details. Keep them out of logs and
      // return only the shared public error shape.
      return c.json(
        {
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message:
              "音声認識サービスを利用できません。時間をおいて再度お試しください",
            requestId,
          },
        },
        503,
      );
    }
  });
}

function setRequestId(c: SpeechContext): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}

function invalidRequest(requestId: string, c: SpeechContext) {
  return c.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message: "音声ファイルと言語を確認してください",
        requestId,
      },
    },
    400,
  );
}

function unsupportedMediaType(requestId: string, c: SpeechContext) {
  return c.json(
    {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "対応している音声形式を指定してください",
        requestId,
      },
    },
    415,
  );
}
