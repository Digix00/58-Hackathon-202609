import { ConcernHandler } from "../../src/presentation/concern.handler";

export function createConcernDependencies() {
  return {
    concernHandler: new ConcernHandler({
      create: async () => {
        throw new Error("concern fixture is not used by this test");
      },
      listPublished: async () => ({ items: [], nextCursor: null }),
      findPublishedById: async () => null,
    }),
  };
}
