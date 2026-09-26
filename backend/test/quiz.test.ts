import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app/create-app";
import { AuthUseCase } from "../src/application/usecase/auth.usecase";
import { QuizUseCase } from "../src/application/usecase/quiz.usecase";
import {
  D1SessionRepository,
  D1UserRepository,
} from "../src/infrastructure/database/d1-auth.repository";
import { D1QuizRepository } from "../src/infrastructure/database/d1-quiz.repository";
import {
  concernRepresentations,
  concerns,
  learningEvents,
  quizAttempts,
  quizzes,
  users,
} from "../src/infrastructure/database/schema";
import { AuthHandler } from "../src/presentation/auth.handler";
import { HealthHandler } from "../src/presentation/health.handler";
import { QuizHandler } from "../src/presentation/quiz.handler";
import { createConcernDependencies } from "./support/concern-fixture";
import { createHistoryDependencies } from "./support/history-fixture";
import { createUserDependencies } from "./support/user-fixture";

const fixedNow = "2099-01-02T00:20:00.000Z";

function createTestApp(
  nowIso = fixedNow,
  lineUserId = `quiz-answerer-${crypto.randomUUID()}`,
) {
  const userRepository = new D1UserRepository(env.DB);
  const authUseCase = new AuthUseCase(
    userRepository,
    new D1SessionRepository(env.DB),
    {
      verify: async (idToken) => {
        if (idToken !== "valid-id-token") {
          throw new Error("unexpected token");
        }
        return { lineUserId };
      },
    },
  );
  const quizUseCase = new QuizUseCase(
    new D1QuizRepository(env.DB),
    () => new Date(nowIso),
  );

  const app = createApp({
    ...createConcernDependencies(),
    ...createHistoryDependencies(),
    ...createUserDependencies(),
    authHandler: new AuthHandler(authUseCase),
    authUseCase,
    healthHandler: new HealthHandler({
      execute: async () => ({
        status: "ok",
        checkedAt: nowIso,
        database: "ok",
        version: "0.1.0",
      }),
    }),
    quizHandler: new QuizHandler(quizUseCase),
  });

  return { app, quizUseCase };
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  if (!value) {
    throw new Error("session cookie was not set");
  }
  return value.split(";", 1)[0];
}

async function loginCookie(
  app: ReturnType<typeof createTestApp>["app"],
): Promise<string> {
  const anonymous = await app.request("/api/v1/auth/session", {}, env);
  const login = await app.request(
    "/api/v1/auth/line",
    {
      method: "POST",
      headers: {
        Cookie: cookieFrom(anonymous),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken: "valid-id-token" }),
    },
    env,
  );
  return cookieFrom(login);
}

async function seedCandidates(
  prefix: string,
  missingFirstAttributes = false,
  createdAt = "2099-01-01T00:00:00.000Z",
): Promise<void> {
  const db = drizzle(env.DB);
  const candidateRows = [
    {
      suffix: "a",
      ageGroup: "10s",
      genderCode: "male",
      regionCode: "tokyo",
    },
    {
      suffix: "b",
      ageGroup: "20s",
      genderCode: "female",
      regionCode: "osaka",
    },
    {
      suffix: "c",
      ageGroup: "30s",
      genderCode: "non_binary",
      regionCode: "hyogo",
    },
  ] as const;
  const rows = missingFirstAttributes
    ? candidateRows.map((row, index) =>
        index === 0
          ? { ...row, ageGroup: null, genderCode: null, regionCode: null }
          : row,
      )
    : candidateRows;

  await db.insert(users).values(
    rows.map((row) => ({
      id: `${prefix}-user-${row.suffix}`,
      lineUserId: `${prefix}-line-${row.suffix}`,
      createdAt,
      updatedAt: createdAt,
    })),
  );
  await db.insert(concerns).values(
    rows.map((row) => ({
      id: `${prefix}-concern-${row.suffix}`,
      userId: `${prefix}-user-${row.suffix}`,
      body: `${prefix}の${row.suffix}さんの投稿`,
      ageGroup: row.ageGroup,
      genderCode: row.genderCode,
      regionCode: row.regionCode,
      visibilityStatus: "published" as const,
      processingStatus: "pending" as const,
      createdAt,
      updatedAt: createdAt,
    })),
  );
}

type QuizResponse = {
  id: string;
  quizDate: string;
  participants: Array<{
    participantId: string;
    attributes: Record<string, string | null>;
    displayOrder: number;
  }>;
  concerns: Array<{
    concernId: string;
    body: string;
    language: string;
    displayOrder: number;
  }>;
  answered: boolean;
  answerResult?: {
    score: number;
    total: number;
    results: Array<Record<string, unknown>>;
  };
};

describe("quiz routes", () => {
  it("requires a logged-in user and returns 404 without a generated today quiz", async () => {
    const { app } = createTestApp("2099-01-01T00:20:00.000Z");

    const withoutSession = await app.request("/api/v1/quizzes/today", {}, env);
    expect(withoutSession.status).toBe(401);

    const cookie = await loginCookie(app);
    const response = await app.request(
      "/api/v1/quizzes/today",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "QUIZ_NOT_AVAILABLE" },
    });
  });

  it("returns a pre-generated quiz without exposing the correct mapping", async () => {
    const prefix = `quiz-get-${crypto.randomUUID()}`;
    await seedCandidates(prefix);
    const { app, quizUseCase } = createTestApp("2099-01-02T00:20:00.000Z");
    const generated = await quizUseCase.generate("2099-01-02");
    expect(generated).not.toBeNull();

    const cookie = await loginCookie(app);
    const response = await app.request(
      "/api/v1/quizzes/today?language=en",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<QuizResponse>();

    expect(body).toMatchObject({
      id: generated?.id,
      quizDate: "2099-01-02",
      answered: false,
    });
    expect(body.participants).toHaveLength(3);
    expect(body.concerns).toHaveLength(3);
    expect(
      body.concerns.every((concern) => concern.language === "original"),
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain(prefix + "-user-");
    expect(JSON.stringify(body)).not.toContain("line-");
    expect(
      body.participants.every((participant) => !("concernId" in participant)),
    ).toBe(true);
  });

  it("uses ready quiz representations and falls back for failed or missing ones", async () => {
    const prefix = `quiz-language-${crypto.randomUUID()}`;
    await seedCandidates(prefix, false, "2099-01-11T00:00:00.000Z");
    const db = drizzle(env.DB);
    const updatedAt = "2099-01-02T00:00:00.000Z";
    await db
      .insert(concernRepresentations)
      .values([
        {
          concernId: `${prefix}-concern-a`,
          locale: "ja-Hira",
          body: `${prefix}のaさんのひらがな`,
          status: "ready",
          updatedAt,
        },
        {
          concernId: `${prefix}-concern-b`,
          locale: "ja-Hira",
          body: `${prefix}のbさんのひらがな`,
          status: "failed",
          errorCode: "translation_failed",
          updatedAt,
        },
        {
          concernId: `${prefix}-concern-a`,
          locale: "en",
          body: `${prefix} English text`,
          status: "ready",
          updatedAt,
        },
      ])
      .run();

    const { app, quizUseCase } = createTestApp("2099-01-12T00:20:00.000Z");
    const generated = await quizUseCase.generate("2099-01-12");
    expect(generated).not.toBeNull();

    const cookie = await loginCookie(app);
    const response = await app.request(
      "/api/v1/quizzes/today?language=jaHira",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<QuizResponse>();
    const concernsById = new Map(
      body.concerns.map((concern) => [concern.concernId, concern]),
    );

    expect(concernsById.get(`${prefix}-concern-a`)).toMatchObject({
      body: `${prefix}のaさんのひらがな`,
      language: "jaHira",
    });
    expect(concernsById.get(`${prefix}-concern-b`)).toMatchObject({
      body: `${prefix}のbさんの投稿`,
      language: "original",
    });
    expect(concernsById.get(`${prefix}-concern-c`)).toMatchObject({
      body: `${prefix}のcさんの投稿`,
      language: "original",
    });

    const englishResponse = await app.request(
      "/api/v1/quizzes/today?language=en",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(englishResponse.status).toBe(200);
    const englishBody = await englishResponse.json<QuizResponse>();
    const englishByConcernId = new Map(
      englishBody.concerns.map((concern) => [concern.concernId, concern]),
    );
    expect(englishByConcernId.get(`${prefix}-concern-a`)).toMatchObject({
      body: `${prefix} English text`,
      language: "en",
    });
    expect(englishByConcernId.get(`${prefix}-concern-b`)).toMatchObject({
      body: `${prefix}のbさんの投稿`,
      language: "original",
    });

    const invalidResponse = await app.request(
      "/api/v1/quizzes/today?language=fr",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    await db
      .update(concerns)
      .set({ visibilityStatus: "hidden" })
      .where(
        inArray(concerns.id, [
          `${prefix}-concern-a`,
          `${prefix}-concern-b`,
          `${prefix}-concern-c`,
        ]),
      )
      .run();
  });

  it("normalizes missing participant attributes to no_answer", async () => {
    const prefix = `quiz-attributes-${crypto.randomUUID()}`;
    await seedCandidates(prefix, true, "2099-01-06T00:00:00.000Z");
    const { app, quizUseCase } = createTestApp("2099-01-05T00:20:00.000Z");
    const generated = await quizUseCase.generate("2099-01-05");
    expect(generated).not.toBeNull();

    const cookie = await loginCookie(app);
    const response = await app.request(
      "/api/v1/quizzes/today",
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<QuizResponse>();

    expect(
      body.participants.every((participant) =>
        Object.values(participant.attributes).every(
          (attribute) => attribute !== null,
        ),
      ),
    ).toBe(true);
    expect(body.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: {
            ageGroup: "no_answer",
            ageGroupName: "回答しない",
            gender: "no_answer",
            genderName: "回答しない",
            regionCode: "no_answer",
            regionName: "回答しない",
          },
        }),
      ]),
    );

    const englishResponse = await app.request(
      "/api/v1/quizzes/today?language=en",
      { headers: { Cookie: cookie } },
      env,
    );
    const englishBody = await englishResponse.json<QuizResponse>();
    expect(englishBody.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: {
            ageGroup: "no_answer",
            ageGroupName: "Prefer not to say",
            gender: "no_answer",
            genderName: "Prefer not to say",
            regionCode: "no_answer",
            regionName: "Prefer not to say",
          },
        }),
      ]),
    );
  });

  it("records one answer per user and returns the result on subsequent reads", async () => {
    const prefix = `quiz-answer-${crypto.randomUUID()}`;
    await seedCandidates(prefix);
    const { app, quizUseCase } = createTestApp("2099-01-03T00:20:00.000Z");
    const generated = await quizUseCase.generate("2099-01-03");
    if (!generated) throw new Error("quiz was not generated");
    const cookie = await loginCookie(app);

    const matches = [
      {
        participantId: generated.participants[0].id,
        concernId: generated.participants[1].concernId,
      },
      {
        participantId: generated.participants[1].id,
        concernId: generated.participants[0].concernId,
      },
      {
        participantId: generated.participants[2].id,
        concernId: generated.participants[2].concernId,
      },
    ];
    const request = {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ matches }),
    };

    const first = await app.request(
      `/api/v1/quizzes/${generated.id}/answers`,
      request,
      env,
    );
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({
      quizId: generated.id,
      score: 1,
      total: 3,
    });

    const duplicate = await app.request(
      `/api/v1/quizzes/${generated.id}/answers`,
      request,
      env,
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: { code: "QUIZ_ALREADY_ANSWERED" },
    });

    const reread = await app.request(
      `/api/v1/quizzes/${generated.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(reread.status).toBe(200);
    expect(await reread.json()).toMatchObject({
      answered: true,
      answerResult: { score: 1, total: 3 },
    });

    const db = drizzle(env.DB);
    const attempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, generated.id));
    expect(attempts).toHaveLength(1);

    const events = await db
      .select()
      .from(learningEvents)
      .where(eq(learningEvents.quizId, generated.id));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("quiz_answer");
    expect(events[0].userId).toBe(attempts[0].userId);
  });

  it("hides a quiz when one of its source concerns is no longer public", async () => {
    const prefix = `quiz-hidden-${crypto.randomUUID()}`;
    await seedCandidates(prefix);
    const { app, quizUseCase } = createTestApp("2099-01-04T00:20:00.000Z");
    const generated = await quizUseCase.generate("2099-01-04");
    if (!generated) throw new Error("quiz was not generated");
    const cookie = await loginCookie(app);
    const db = drizzle(env.DB);

    await db
      .update(concerns)
      .set({ visibilityStatus: "hidden" })
      .where(eq(concerns.id, generated.participants[0].concernId));

    const response = await app.request(
      `/api/v1/quizzes/${generated.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "QUIZ_NOT_AVAILABLE" },
    });

    const hidden = await db
      .select({ status: quizzes.status })
      .from(quizzes)
      .where(and(eq(quizzes.id, generated.id), eq(quizzes.status, "hidden")));
    expect(hidden).toHaveLength(1);
  });
});
