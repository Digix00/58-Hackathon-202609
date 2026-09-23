import { describe, expect, it } from "vitest";

import { ConcernView } from "../../../src/application/entity/concern-view";
import type { ConcernViewRepository } from "../../../src/application/repository/concern-view.repository";
import { ConcernViewUseCase } from "../../../src/application/usecase/concern-view.usecase";

describe("ConcernViewUseCase", () => {
  it("records the authenticated actor and injected timestamp", async () => {
    let recorded: ConcernView | undefined;
    const repository: ConcernViewRepository = {
      recordForPublishedConcern: async (view) => {
        recorded = view;
        return view;
      },
    };
    const useCase = new ConcernViewUseCase(
      repository,
      () => new Date("2026-09-23T12:34:56.000Z"),
    );

    const result = await useCase.record("concern-1", "internal-user-id");

    expect(recorded).toBeInstanceOf(ConcernView);
    expect(result).toMatchObject({
      concernId: "concern-1",
      actorKey: "internal-user-id",
      viewedAt: "2026-09-23T12:34:56.000Z",
    });
  });

  it("returns null when the repository finds no published concern", async () => {
    const repository: ConcernViewRepository = {
      recordForPublishedConcern: async () => null,
    };
    const useCase = new ConcernViewUseCase(repository);

    await expect(
      useCase.record("deleted-concern", "internal-user-id"),
    ).resolves.toBeNull();
  });
});
