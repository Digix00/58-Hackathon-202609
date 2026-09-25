import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../src/app/auth-cookie";
import { createApp } from "../src/app/create-app";
import type { SpeechRateLimiter } from "../src/application/port/speech-rate-limiter";
import type { SpeechRecognizer } from "../src/application/port/speech-recognizer";
import type {
  IAuthUseCase,
  SessionView,
} from "../src/application/usecase/auth.usecase";
import { SpeechUseCase } from "../src/application/usecase/speech.usecase";
import { createApplication } from "../src/bootstrap/container";
import { VerifiedSpeechAudioDurationReader } from "../src/infrastructure/ai/speech-audio-duration.reader";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { SpeechHandler } from "../src/presentation/speech.handler";
import {
  createMp3Audio,
  createMp4Audio,
  createWavAudio,
  createWebmAudio,
} from "./support/audio-fixture";
import { createConcernDependencies } from "./support/concern-fixture";
import { createUserDependencies } from "./support/user-fixture";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_AUDIO_BYTES + 16 * 1024;
const authenticatedSession: SessionView = {
  session: {
    id: "speech-test-session",
    userId: "speech-test-user",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  user: {
    id: "speech-test-user",
    lineUserId: "line-speech-test-user",
    birthYear: null,
    birthMonth: null,
    gender: null,
    regionCode: null,
  },
};

function createTestApp(
  recognizer: SpeechRecognizer | null,
  rateLimiter: SpeechRateLimiter = {
    consume: async () => ({ allowed: true }),
  },
) {
  const authUseCase = {
    getSession: async (token?: string) =>
      token === "speech-test-token" ? authenticatedSession : null,
  } as unknown as IAuthUseCase;

  return createApp({
    ...createConcernDependencies(),
    ...createUserDependencies(),
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: "2026-09-25T00:00:00.000Z",
        database: "ok",
        version: "0.1.0",
      }),
    }),
    speechHandler: new SpeechHandler(
      new SpeechUseCase(
        recognizer,
        new VerifiedSpeechAudioDurationReader(),
        rateLimiter,
      ),
    ),
  });
}

function createAudioForm(
  options: { audio?: File; language?: string } = {},
): FormData {
  const form = new FormData();
  form.append(
    "audio",
    options.audio ??
      new File([createWavAudio(1)], "voice.wav", {
        type: "audio/wav",
      }),
  );
  if (options.language !== undefined) {
    form.append("language", options.language);
  }
  return form;
}

async function postTranscription(
  app: ReturnType<typeof createTestApp>,
  body: BodyInit,
  authenticated = true,
): Promise<Response> {
  return await app.request(
    "/api/v1/speech/transcriptions",
    {
      method: "POST",
      headers: authenticated
        ? { Cookie: `${SESSION_COOKIE_NAME}=speech-test-token` }
        : undefined,
      body,
    },
    env,
  );
}

describe("POST /api/v1/speech/transcriptions", () => {
  it("uses a deterministic recognizer only when the local development flag is enabled", async () => {
    const localBindings = {
      ...env,
      DEV_AUTH_ENABLED: "true",
      LOCAL_SPEECH_RECOGNIZER_ENABLED: "true",
    };
    const localApplication = createApplication(localBindings);
    const session = await localApplication.app.request(
      "/api/v1/auth/dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userKey: "demo-a" }),
      },
      localBindings,
    );
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const localForm = createAudioForm();
    const localResponse = await localApplication.app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: { Cookie: cookie! },
        body: localForm,
      },
      localBindings,
    );
    expect(localResponse.status).toBe(200);
    expect(await localResponse.json()).toEqual({
      text: "[local-dev transcript]",
      language: "ja",
    });

    const unconfiguredBindings = {
      ...env,
      DEV_AUTH_ENABLED: "true",
    };
    const unconfiguredApplication = createApplication(unconfiguredBindings);
    const unavailableResponse = await unconfiguredApplication.app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: { Cookie: cookie! },
        body: createAudioForm(),
      },
      unconfiguredBindings,
    );
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.json()).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });
  });

  it("returns Japanese transcription for an authenticated multipart audio upload", async () => {
    const transcribe = vi.fn(
      async (_audio: ArrayBuffer) => " 今日は疲れました ",
    );
    const app = createTestApp({ transcribe });

    const response = await postTranscription(app, createAudioForm());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "今日は疲れました",
      language: "ja",
    });
    expect(transcribe).toHaveBeenCalledOnce();
    expect(transcribe.mock.calls[0]?.[0]).toBeInstanceOf(ArrayBuffer);
  });

  it("accepts WebM with codec parameters and audio at the 60-second boundary", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const webmResponse = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWebmAudio(1)], "voice.webm", {
          type: "audio/webm;codecs=opus",
        }),
      }),
    );
    expect(webmResponse.status).toBe(200);

    const sixtySecondResponse = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWavAudio(60)], "voice.wav", {
          type: "audio/wav",
        }),
      }),
    );
    expect(sixtySecondResponse.status).toBe(200);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("accepts MP3 audio with an ID3v2.4 footer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createMp3Audio(1, true)], "voice.mp3", {
          type: "audio/mpeg",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "recognized",
      language: "ja",
    });
    expect(transcribe).toHaveBeenCalledOnce();
  });

  it("accepts WebM audio containing a one-byte Opus DTX packet", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File(
          [createWebmAudio(1, 1, 0, Uint8Array.of(0xf8))],
          "voice.webm",
          { type: "audio/webm" },
        ),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "recognized",
      language: "ja",
    });
    expect(transcribe).toHaveBeenCalledOnce();
  });

  it("requires an authenticated user before reading audio", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(app, createAudioForm(), false);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("applies the per-user limit before parsing an authenticated multipart body", async () => {
    const consume = vi.fn(async () => ({
      allowed: false as const,
      retryAfterSeconds: 23,
    }));
    const app = createTestApp(
      { transcribe: async () => "recognized" },
      { consume },
    );
    const response = await app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=speech-test-token`,
          "Content-Type": "multipart/form-data; boundary=not-present",
        },
        body: "malformed multipart body",
      },
      env,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(consume).toHaveBeenCalledOnce();
  });

  it("rejects non-multipart requests, missing audio, unsupported MIME, and language", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const wrongContentType = await app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=speech-test-token`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      env,
    );
    expect(wrongContentType.status).toBe(415);
    expect(await wrongContentType.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const missingAudioForm = new FormData();
    const missingAudio = await postTranscription(app, missingAudioForm);
    expect(missingAudio.status).toBe(400);
    expect(await missingAudio.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const unsupportedAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([new Uint8Array([1])], "voice.ogg", {
          type: "audio/ogg",
        }),
      }),
    );
    expect(unsupportedAudio.status).toBe(415);
    expect(await unsupportedAudio.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const unsupportedLanguage = await postTranscription(
      app,
      createAudioForm({ language: "en" }),
    );
    expect(unsupportedLanguage.status).toBe(400);
    expect(await unsupportedLanguage.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const unexpectedFieldForm = createAudioForm();
    unexpectedFieldForm.append("unused", "extra field");
    const unexpectedField = await postTranscription(app, unexpectedFieldForm);
    expect(unexpectedField.status).toBe(400);
    expect(await unexpectedField.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("enforces the streamed multipart body limit when Content-Length is too small", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });
    const form = createAudioForm();
    form.append("unused", "x".repeat(MAX_MULTIPART_BODY_BYTES));
    const encodedRequest = new Request(
      "http://localhost/api/v1/speech/transcriptions",
      { method: "POST", body: form },
    );
    const body = await encodedRequest.arrayBuffer();

    const response = await app.request(
      "/api/v1/speech/transcriptions",
      {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=speech-test-token`,
          "Content-Type": encodedRequest.headers.get("content-type")!,
          "Content-Length": "1",
        },
        body,
      },
      env,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized audio", async () => {
    const app = createTestApp({ transcribe: async () => "recognized" });

    const emptyAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([], "empty.wav", { type: "audio/wav" }),
      }),
    );
    expect(emptyAudio.status).toBe(400);
    expect(await emptyAudio.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const oversizedAudio = await postTranscription(
      app,
      createAudioForm({
        audio: new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "large.wav", {
          type: "audio/wav",
        }),
      }),
    );
    expect(oversizedAudio.status).toBe(413);
    expect(await oversizedAudio.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects audio longer than 60 seconds before calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createWavAudio(60.01)], "long.wav", {
          type: "audio/wav",
        }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns 413 for a long AAC-LC MP4 and does not call the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([createMp4Audio(65, 1)], "long.mp4", {
          type: "audio/mp4",
        }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects WAV with inconsistent PCM header fields before calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });
    const audio = createWavAudio(61);
    const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
    view.setUint16(32, 4, true);
    view.setUint32(28, 32_000, true);

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([audio], "forged.wav", { type: "audio/wav" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects malformed audio before calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const app = createTestApp({ transcribe });

    const response = await postTranscription(
      app,
      createAudioForm({
        audio: new File([Uint8Array.of(1, 2, 3)], "invalid.wav", {
          type: "audio/wav",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns 429 and Retry-After without calling the recognizer", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer) => "recognized");
    const consume = vi.fn(async () => ({
      allowed: false as const,
      retryAfterSeconds: 23,
    }));
    const app = createTestApp({ transcribe }, { consume });

    const response = await postTranscription(app, createAudioForm());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(await response.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(consume).toHaveBeenCalledWith("speech-test-user");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns a shared upstream error when recognition is unavailable or fails", async () => {
    const unavailable = createTestApp(null);
    const unavailableResponse = await postTranscription(
      unavailable,
      createAudioForm(),
    );
    expect(unavailableResponse.status).toBe(503);
    expect(await unavailableResponse.json()).toMatchObject({
      error: { code: "UPSTREAM_UNAVAILABLE" },
    });

    const recognitionFailure = createTestApp({
      transcribe: async () => {
        throw new Error("private audio payload details");
      },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await postTranscription(
        recognitionFailure,
        createAudioForm(),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "UPSTREAM_UNAVAILABLE" },
      });
      const logs = JSON.stringify([
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(logs).not.toContain("private audio payload details");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
