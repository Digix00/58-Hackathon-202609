import { describe, expect, it, vi } from "vitest";

import {
  Concern,
  ConcernValidationError,
} from "../../../src/application/entity/concern";
import type { ConcernProcessingQueue } from "../../../src/application/port/concern-processing-queue";
import type { ConcernRepository } from "../../../src/application/repository/concern.repository";
import { ConcernUseCase } from "../../../src/application/usecase/concern.usecase";

describe("ConcernUseCase", () => {
  it("saves a concern with the authenticated userId and injected id/time", async () => {
    let saved: Concern | undefined;
    const processingQueue: ConcernProcessingQueue = {
      enqueue: vi.fn(),
    };
    const repository: ConcernRepository = {
      insert: async (concern) => {
        saved = concern;
        return concern;
      },
      listPublished: async () => ({ items: [], hasMore: false }),
      findPublishedById: async () => null,
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      () => "fixed-id",
      processingQueue,
    );

    const result = await useCase.create({
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
    });

    expect(saved).toBeInstanceOf(Concern);
    expect(result).toMatchObject({
      id: "fixed-id",
      userId: "user_1",
      body: "食堂が混んでいて昼休みに休めない",
      ageGroup: "20s",
      gender: "no_answer",
      regionCode: "osaka",
      visibilityStatus: "published",
      processingStatus: "pending",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    expect(processingQueue.enqueue).toHaveBeenCalledWith({
      type: "concern.process",
      concernId: "fixed-id",
      body: "食堂が混んでいて昼休みに休めない",
    });
  });

  it("stores omitted optional attributes as null", async () => {
    const repository: ConcernRepository = {
      insert: async (concern) => concern,
      listPublished: async () => ({ items: [], hasMore: false }),
      findPublishedById: async () => null,
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      () => "fixed-id",
    );

    const result = await useCase.create({
      userId: "user_1",
      body: "属性なしの投稿",
    });

    expect(result.ageGroup).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.regionCode).toBeNull();
  });

  it("rejects an invalid body via the Concern entity's invariant check", async () => {
    const repository: ConcernRepository = {
      insert: async (concern) => concern,
      listPublished: async () => ({ items: [], hasMore: false }),
      findPublishedById: async () => null,
    };
    const useCase = new ConcernUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
      () => "fixed-id",
    );

    await expect(
      useCase.create({ userId: "user_1", body: "   " }),
    ).rejects.toThrow(ConcernValidationError);
  });

  it("creates a cursor from the last item when another page exists", async () => {
    const concern = new Concern({
      id: "concern-2",
      userId: "user-1",
      body: "次のページに続く投稿",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    const repository: ConcernRepository = {
      insert: async (value) => value,
      listPublished: async (input) => {
        expect(input.limit).toBe(20);
        return { items: [concern], hasMore: true };
      },
      findPublishedById: async () => null,
    };
    const useCase = new ConcernUseCase(repository);

    await expect(useCase.listPublished({ limit: 20 })).resolves.toEqual({
      items: [concern],
      nextCursor: {
        createdAt: "2026-09-22T00:00:00.000Z",
        id: "concern-2",
      },
    });
  });

  it("returns a published concern by id through the repository port", async () => {
    const concern = new Concern({
      id: "concern-1",
      userId: "user-1",
      body: "公開されている投稿",
      createdAt: "2026-09-22T00:00:00.000Z",
    });
    const repository: ConcernRepository = {
      insert: async (value) => value,
      listPublished: async () => ({ items: [], hasMore: false }),
      findPublishedById: async (id) => (id === concern.id ? concern : null),
    };
    const useCase = new ConcernUseCase(repository);

    await expect(useCase.findPublishedById("concern-1")).resolves.toBe(concern);
  });
});
