import { ConcernHandler } from "../../src/presentation/concern.handler";

export function createConcernDependencies() {
  return {
    concernHandler: new ConcernHandler({
      execute: async () => {
        throw new Error("concern fixture is not used by this test");
      },
    }),
  };
}
