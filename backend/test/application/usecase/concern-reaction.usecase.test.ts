import { describe, expect, it } from "vitest";

import { ConcernReaction } from "../../../src/application/entity/concern-reaction";
import type { ConcernReactionRepository } from "../../../src/application/repository/concern-reaction.repository";
import { ConcernReactionUseCase } from "../../../src/application/usecase/concern-reaction.usecase";

describe("ConcernReactionUseCase", () => {
  it("creates a reaction using the authenticated user and current time", async () => {
    let saved: ConcernReaction | undefined;
    const repository: ConcernReactionRepository = {
      insert: async (reaction) => {
        saved = reaction;
        return { created: true, reactionCount: 4 };
      },
      remove: async () => null,
    };
    const useCase = new ConcernReactionUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );

    const result = await useCase.register({
      concernId: "concern-1",
      userId: "user-1",
      reactionType: "empathy",
    });

    expect(saved).toBeInstanceOf(ConcernReaction);
    expect(result).toMatchObject({
      reaction: {
        concernId: "concern-1",
        userId: "user-1",
        reactionType: "empathy",
        createdAt: "2026-09-22T00:00:00.000Z",
      },
      created: true,
      reactionCount: 4,
    });
  });

  it("returns null when the repository does not find a published concern", async () => {
    const repository: ConcernReactionRepository = {
      insert: async () => null,
      remove: async () => null,
    };
    const useCase = new ConcernReactionUseCase(repository);

    await expect(
      useCase.register({
        concernId: "hidden-concern",
        userId: "user-1",
        reactionType: "empathy",
      }),
    ).resolves.toBeNull();
  });

  it("removes the authenticated user's reaction", async () => {
    let removed: ConcernReaction | undefined;
    const repository: ConcernReactionRepository = {
      insert: async () => ({ created: false, reactionCount: 2 }),
      remove: async (reaction) => {
        removed = reaction;
        return { removed: true, reactionCount: 1 };
      },
    };
    const useCase = new ConcernReactionUseCase(
      repository,
      () => new Date("2026-09-22T00:00:00.000Z"),
    );

    const result = await useCase.remove({
      concernId: "concern-1",
      userId: "user-1",
      reactionType: "empathy",
    });

    expect(removed).toBeInstanceOf(ConcernReaction);
    expect(result).toMatchObject({
      reaction: {
        concernId: "concern-1",
        userId: "user-1",
        reactionType: "empathy",
      },
      removed: true,
      reactionCount: 1,
    });
  });
});
