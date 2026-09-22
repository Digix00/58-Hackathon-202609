import type {
  AgeGroup,
  Concern,
  ConcernInputMethod,
  Gender,
} from "../entity/concern";

export interface InsertConcernInput {
  id: string;
  userId: string;
  body: string;
  inputMethod: ConcernInputMethod;
  ageGroup: AgeGroup | null;
  gender: Gender | null;
  regionCode: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Application層が必要とする永続化処理のPort。
 * 実装の詳細（D1やDrizzle）をApplication層へ持ち込まない。
 */
export interface ConcernRepository {
  insert(input: InsertConcernInput): Promise<Concern>;
}
