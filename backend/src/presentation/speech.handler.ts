import type { Context } from "hono";
import { createFactory } from "hono/factory";
import { validator } from "hono/validator";

import type { AuthVariables } from "../app/middleware/auth";
import { getRequestId } from "../app/request-id";
import {
  InvalidSpeechAudioError,
  type ISpeechUseCase,
  SpeechAudioTooLongError,
  SpeechRateLimitExceededError,
} from "../application/usecase/speech.usecase";
import type { Bindings } from "../types";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 16 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_AUDIO_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;
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
type SpeechTranscriptionForm = { audio: File; language?: "ja" };

export class SpeechHandler {
  private readonly speechUseCase: ISpeechUseCase;

  constructor(speechUseCase: ISpeechUseCase) {
    this.speechUseCase = speechUseCase;
  }

  readonly transcribe = factory.createHandlers(
    async (c, next) => {
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

      try {
        await this.speechUseCase.admitRequest(c.var.auth.user.id);
      } catch (error) {
        return speechErrorResponse(error, requestId, c);
      }

      const contentType = c.req.header("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
        return unsupportedMediaType(requestId, c);
      }

      if (hasOversizedContentLength(c.req.raw, MAX_MULTIPART_BODY_BYTES)) {
        return payloadTooLarge(requestId, c);
      }

      const limitedBody = limitRequestBody(c.req.raw, MAX_MULTIPART_BODY_BYTES);
      c.req.raw = limitedBody.request;

      try {
        // Hono のキャッシュを使い、後続の validator で本文を再読み込みしない。
        await c.req.formData();
      } catch {
        if (limitedBody.exceeded()) {
          return payloadTooLarge(requestId, c);
        }
        return invalidRequest(requestId, c);
      }

      await next();
    },
    validator("form", async (_value, c) => {
      const requestId = setRequestId(c);
      const formData = await c.req.formData();

      for (const fieldName of formData.keys()) {
        if (fieldName !== "audio" && fieldName !== "language") {
          return invalidRequest(requestId, c);
        }
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
        return payloadTooLarge(requestId, c);
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
        languageFields.length === 0
          ? "ja"
          : (languageFields[0] as string).trim();
      if (language !== "ja") {
        return invalidRequest(requestId, c);
      }

      const form: SpeechTranscriptionForm = { audio, language: "ja" };
      return form;
    }),
    async (c) => {
      const requestId = setRequestId(c);
      const { audio } = c.req.valid("form");
      try {
        const text = await this.speechUseCase.transcribe(
          await audio.arrayBuffer(),
          audio.type.split(";", 1)[0].trim().toLowerCase(),
        );
        return c.json({ text, language: "ja" as const }, 200);
      } catch (error) {
        return speechErrorResponse(error, requestId, c);
      }
    },
  );
}

function hasOversizedContentLength(
  request: Request,
  maxBytes: number,
): boolean {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d+$/.test(value)) {
    return false;
  }
  return Number(value) > maxBytes;
}

function limitRequestBody(request: Request, maxBytes: number) {
  const sourceBody = request.body;
  if (!sourceBody) {
    return { request, exceeded: () => false };
  }

  const reader = sourceBody.getReader();
  let bytesRead = 0;
  let bodyExceededLimit = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }

        bytesRead += chunk.value.byteLength;
        if (bytesRead > maxBytes) {
          bodyExceededLimit = true;
          controller.error(
            new TypeError("Multipart request body is too large"),
          );
          void reader.cancel().catch(() => undefined);
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const requestInit = {
    body,
    headers,
    duplex: "half",
  } as RequestInit & { duplex: "half" };
  return {
    request: new Request(request, requestInit),
    exceeded: () => bodyExceededLimit,
  };
}

function setRequestId(c: SpeechContext): string {
  const requestId = getRequestId(c.req.raw);
  c.header("X-Request-Id", requestId);
  return requestId;
}

function speechErrorResponse(
  error: unknown,
  requestId: string,
  c: SpeechContext,
) {
  if (error instanceof SpeechRateLimitExceededError) {
    c.header("Retry-After", String(error.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message:
            "音声入力の利用上限に達しました。時間をおいて再度お試しください",
          requestId,
        },
      },
      429,
    );
  }

  if (error instanceof SpeechAudioTooLongError) {
    return c.json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "音声の長さは60秒以下にしてください",
          requestId,
        },
      },
      413,
    );
  }

  if (error instanceof InvalidSpeechAudioError) {
    return invalidRequest(requestId, c);
  }

  // Upstream errors may contain request details. Keep them out of logs and
  // return only the shared public error shape. Limiter failures also fail closed.
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

function payloadTooLarge(requestId: string, c: SpeechContext) {
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
