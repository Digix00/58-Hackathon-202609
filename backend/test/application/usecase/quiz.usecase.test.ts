import { describe, expect, it } from "vitest";

import {
  Quiz,
  QuizAlreadyAnsweredError,
  type QuizCandidate,
  QuizNotAvailableError,
} from "../../../src/application/entity/quiz";
import type { QuizRepository } from "../../../src/application/repository/quiz.repository";
import {
  QuizUseCase,
  selectCandidateTriplet,
} from "../../../src/application/usecase/quiz.usecase";

const candidates: QuizCandidate[] = [
  {
    userId: "user-a",
    concernId: "concern-a",
    body: "Aの投稿",
    ageGroup: "10s",
    gender: "male",
    regionCode: "tokyo",
  },
  {
    userId: "user-b",
    concernId: "concern-b",
    body: "Bの投稿",
    ageGroup: "20s",
    gender: "female",
    regionCode: "osaka",
  },
  {
    userId: "user-c",
    concernId: "concern-c",
    body: "Cの投稿",
    ageGroup: "30s",
    gender: "non_binary",
    regionCode: "hyogo",
  },
];

function createQuiz(): Quiz {
  return new Quiz({
    id: "quiz-1",
    quizDate: "2026-09-24",
    status: "published",
    createdAt: "2026-09-24T00:00:00.000Z",
    publishedAt: "2026-09-24T00:00:00.000Z",
    hiddenAt: null,
    participants: candidates.map((candidate, index) => ({
      id: `participant-${index + 1}`,
      userId: candidate.userId,
      concernId: candidate.concernId,
      ageGroup: candidate.ageGroup,
      gender: candidate.gender,
      regionCode: candidate.regionCode,
      displayOrder: index + 1,
      explanation: `説明${index + 1}`,
    })),
    options: candidates.map((candidate, index) => ({
      concernId: candidate.concernId,
      body: candidate.body,
      displayOrder: index + 1,
    })),
  });
}

function createRepository(
  overrides: Partial<QuizRepository> = {},
): QuizRepository {
  return {
    findPublishedByDate: async () => null,
    findAvailableByDate: async () => null,
    findPublishedById: async () => null,
    listCandidates: async () => [],
    insert: async () => true,
    recordAnswer: async () => ({ status: "created" }),
    ...overrides,
  };
}

describe("selectCandidateTriplet", () => {
  it("selects three different users whose displayed attributes do not overlap", () => {
    expect(selectCandidateTriplet(candidates)).toEqual(candidates);
  });

  it("does not select a triplet when any displayed attribute is duplicated", () => {
    expect(
      selectCandidateTriplet([
        candidates[0],
        candidates[1],
        { ...candidates[2], regionCode: candidates[1].regionCode },
      ]),
    ).toBeNull();
  });

  it("treats omitted attributes as no_answer and avoids duplicate hints", () => {
    expect(
      selectCandidateTriplet([
        { ...candidates[0], ageGroup: null },
        { ...candidates[1], ageGroup: null },
        candidates[2],
      ]),
    ).toBeNull();
  });
});

describe("QuizUseCase", () => {
  it("generates a published quiz without generating from the read path", async () => {
    let inserted: Quiz | undefined;
    const useCase = new QuizUseCase(
      createRepository({
        listCandidates: async () => candidates,
        insert: async (quiz) => {
          inserted = quiz;
          return true;
        },
      }),
      () => new Date("2026-09-24T00:00:00.000Z"),
      (() => {
        let index = 0;
        return () => `generated-${(index += 1)}`;
      })(),
    );

    const generated = await useCase.generate("2026-09-24");

    expect(generated).toBe(inserted);
    expect(generated).toMatchObject({
      quizDate: "2026-09-24",
      status: "published",
    });
    expect(generated?.participants).toHaveLength(3);
    expect(generated?.options).toHaveLength(3);
  });

  it("reuses today's published quiz or creates it before returning its id", async () => {
    let existing: Quiz | null = null;
    let generatedCount = 0;
    const useCase = new QuizUseCase(
      createRepository({
        findAvailableByDate: async () => existing,
        listCandidates: async () => candidates,
        insert: async (quiz) => {
          existing = quiz;
          generatedCount += 1;
          return true;
        },
      }),
      () => new Date("2026-09-25T00:00:00.000Z"),
      (() => {
        let index = 0;
        return () => `daily-${(index += 1)}`;
      })(),
    );

    const first = await useCase.ensureDailyQuiz("2026-09-25");
    const second = await useCase.ensureDailyQuiz("2026-09-25");

    expect(first).toMatchObject({ id: "daily-4", quizDate: "2026-09-25" });
    expect(second).toEqual(first);
    expect(generatedCount).toBe(1);
  });

  it("returns 404-ready null when no published quiz exists for today", async () => {
    const useCase = new QuizUseCase(
      createRepository(),
      () => new Date("2026-09-24T00:00:00.000Z"),
    );

    await expect(useCase.getToday("user-1")).resolves.toBeNull();
  });

  it("scores a complete answer and stores all three mappings", async () => {
    const quiz = createQuiz();
    let recorded: Parameters<QuizRepository["recordAnswer"]>[0] | undefined;
    const useCase = new QuizUseCase(
      createRepository({
        findPublishedById: async () => quiz,
        recordAnswer: async (input) => {
          recorded = input;
          return { status: "created" };
        },
      }),
      () => new Date("2026-09-24T00:20:00.000Z"),
      () => "attempt-1",
    );

    const result = await useCase.answer({
      quizId: quiz.id,
      userId: "answerer",
      matches: [
        { participantId: "participant-1", concernId: "concern-b" },
        { participantId: "participant-2", concernId: "concern-a" },
        { participantId: "participant-3", concernId: "concern-c" },
      ],
    });

    expect(result).toMatchObject({ quizId: "quiz-1", score: 1, total: 3 });
    expect(result.results).toHaveLength(3);
    expect(recorded).toMatchObject({
      quizId: "quiz-1",
      userId: "answerer",
      score: 1,
      attemptId: "attempt-1",
    });
    expect(recorded?.answers).toHaveLength(3);
  });

  it("rejects a duplicate answer and an unavailable quiz", async () => {
    const quiz = createQuiz();
    const duplicateUseCase = new QuizUseCase(
      createRepository({
        findPublishedById: async () => quiz,
        recordAnswer: async () => ({ status: "already_answered" }),
      }),
    );
    await expect(
      duplicateUseCase.answer({
        quizId: quiz.id,
        userId: "answerer",
        matches: quiz.participants.map((participant) => ({
          participantId: participant.id,
          concernId: participant.concernId,
        })),
      }),
    ).rejects.toBeInstanceOf(QuizAlreadyAnsweredError);

    const unavailableUseCase = new QuizUseCase(createRepository());
    await expect(
      unavailableUseCase.answer({
        quizId: quiz.id,
        userId: "answerer",
        matches: [],
      }),
    ).rejects.toBeInstanceOf(QuizNotAvailableError);
  });
});
