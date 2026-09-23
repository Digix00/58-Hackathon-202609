import { ConcernHandler } from "../../src/presentation/concern.handler";
import { ConcernReactionHandler } from "../../src/presentation/concern-reaction.handler";

export function createConcernDependencies() {
  return {
    concernHandler: new ConcernHandler({
      create: async () => {
        throw new Error("concern fixture is not used by this test");
      },
      listPublished: async () => ({ items: [], nextCursor: null }),
      findPublishedById: async () => null,
    }),
    concernReactionHandler: new ConcernReactionHandler({
      register: async () => {
        throw new Error("concern reaction fixture is not used by this test");
      },
    }),
  };
}
