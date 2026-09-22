import type { AgeGroup, ConcernInputMethod, Gender } from "../entity/concern";
import { Concern } from "../entity/concern";
import type { ConcernRepository } from "../repository/concern.repository";
import { generateId } from "../shared/id-generator";

export interface CreateConcernInput {
  userId: string;
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: string;
  inputMethod: ConcernInputMethod;
}

export interface IConcernUseCase {
  create(input: CreateConcernInput): Promise<Concern>;
}

/**
 * concern（悩み投稿）のドメインに関する処理を担当する。
 * 入力値の不変条件はConcernのコンストラクタが検証するため、ここではID/時刻を
 * 採番してEntityを組み立て、永続化を依頼するオーケストレーションに専念する。
 */
export class ConcernUseCase implements IConcernUseCase {
  private readonly repository: ConcernRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: ConcernRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  readonly create = async (input: CreateConcernInput): Promise<Concern> => {
    const concern = new Concern({
      id: this.createId(),
      userId: input.userId,
      body: input.body,
      inputMethod: input.inputMethod,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      createdAt: this.now().toISOString(),
    });

    return this.repository.insert(concern);
  };
}
