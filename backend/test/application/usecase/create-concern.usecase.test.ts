import { describe, expect, it, vi } from "vitest";

import type {
  ConcernRepository,
  InsertConcernInput,
} from "../../../src/application/repository/concern.repository";
import { CreateConcernUseCase } from "../../../src/application/usecase/create-concern.usecase";

describe("CreateConcernUseCase", () => {
  it("saves a concern with the authenticated userId and injected id/time", async () => {
    const insert = vi.fn(async (input: InsertConcernInput) => ({
      id: input.id,
      userId: input.userId,
      body: input.body,
      inputMethod: input.inputMethod,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      visibilityStatus: "published" as const,
      processingStatus: "pending" as const,
      createdAt: input.createdAt,
    }));
    const repository: ConcernRepository = { insert };
    const useCase = new CreateConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      (prefix) => `${prefix}_fixed`,
    );

    const result = await useCase.execute({
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
      inputMethod: "liff",
    });

    expect(insert).toHaveBeenCalledWith({
      id: "concern_fixed",
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      inputMethod: "liff",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
      createdAt: "2026-09-22T00:00:00.000Z",
      updatedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(result.visibilityStatus).toBe("published");
    expect(result.processingStatus).toBe("pending");
  });

  it("stores omitted optional attributes as null", async () => {
    const insert = vi.fn(async (input: InsertConcernInput) => ({
      id: input.id,
      userId: input.userId,
      body: input.body,
      inputMethod: input.inputMethod,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      visibilityStatus: "published" as const,
      processingStatus: "pending" as const,
      createdAt: input.createdAt,
    }));
    const repository: ConcernRepository = { insert };
    const useCase = new CreateConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      (prefix) => `${prefix}_fixed`,
    );

    await useCase.execute({
      userId: "user_1",
      body: "属性なしの投稿",
      inputMethod: "voice",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ageGroup: null,
        gender: null,
        regionCode: null,
      }),
    );
  });
});
