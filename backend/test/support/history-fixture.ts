import { HistoryHandler } from "../../src/presentation/history.handler";

export function createHistoryDependencies() {
  return {
    historyHandler: new HistoryHandler({
      getSummary: async () => ({
        viewedConcernCount: 0,
        clusters: [],
        regions: [],
        attributes: { ageGroups: [], genders: [] },
        quiz: {
          answeredCount: 0,
          correctCount: 0,
          totalQuestions: 0,
          accuracy: 0,
        },
      }),
      listQuizAnswers: async () => ({ items: [], nextCursor: null }),
    }),
  };
}
