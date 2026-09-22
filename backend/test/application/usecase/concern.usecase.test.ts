import { describe, expect, it } from "vitest";

import { Concern, ConcernValidationError } from "../../../src/application/entity/concern";
import type { ConcernRepository } from "../../../src/application/repository/concern.repository";
import { ConcernUseCase } from "../../../src/application/usecase/concern.usecase";

describe("ConcernUseCase", () => {
  it("saves a concern with the authenticated userId and injected id/time", async () => {
    let saved: Concern | undefined;
    const repository: ConcernRepository = {
      insert: async (concern) => {
        saved = concern;
        return concern;
      },
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      (prefix) => `${prefix}_fixed`,
    );

    const result = await useCase.create({
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
      inputMethod: "liff",
    });

    expect(saved).toBeInstanceOf(Concern);
    expect(result).toMatchObject({
      id: "concern_fixed",
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      inputMethod: "liff",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
  });

  it("stores omitted optional attributes as null", async () => {
    const repository: ConcernRepository = {
      insert: async (concern) => concern,
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      (prefix) => `${prefix}_fixed`,
    );

    const result = await useCase.create({
      userId: "user_1",
      body: "属性なしの投稿",
      inputMethod: "voice",
    });

    expect(result.ageGroup).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.regionCode).toBeNull();
  });

  it("rejects an invalid body via the Concern entity's invariant check", async () => {
    const repository: ConcernRepository = {
      insert: async (concern) => concern,
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      (prefix) => `${prefix}_fixed`,
    );

    await expect(
      useCase.create({ userId: "user_1", body: "   ", inputMethod: "liff" }),
    ).rejects.toThrow(ConcernValidationError);
  });
});
