import { ConcernHandler } from "../../src/presentation/concern.handler";
import { ConcernReactionHandler } from "../../src/presentation/concern-reaction.handler";
import { ConcernViewHandler } from "../../src/presentation/concern-view.handler";
import { QuizHandler } from "../../src/presentation/quiz.handler";

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
    concernViewHandler: new ConcernViewHandler({
      record: async () => null,
    }),
    quizHandler: new QuizHandler({
      getToday: async () => null,
      getById: async () => null,
      generate: async () => null,
      answer: async () => {
        throw new Error("quiz fixture is not used by this test");
      },
    }),
  };
}
