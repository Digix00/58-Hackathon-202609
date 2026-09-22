import type { AgeGroup, Concern, ConcernInputMethod, Gender } from "../entity/concern";
import type { ConcernRepository } from "../repository/concern.repository";
import { generateId } from "./auth.usecase";

export interface CreateConcernInput {
  userId: string;
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: string;
  inputMethod: ConcernInputMethod;
}

export interface CreateConcern {
  execute(input: CreateConcernInput): Promise<Concern>;
}

/** 投稿機能のアプリケーションロジック。userIdはHandlerが認証済みセッションから渡す。 */
export class CreateConcernUseCase implements CreateConcern {
  private readonly repository: ConcernRepository;
  private readonly now: () => Date;
  private readonly createId: (prefix: string) => string;

  constructor(
    repository: ConcernRepository,
    now: () => Date = () => new Date(),
    createId: (prefix: string) => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  readonly execute = async (input: CreateConcernInput): Promise<Concern> => {
    const timestamp = this.now().toISOString();
    return this.repository.insert({
      id: this.createId("concern"),
      userId: input.userId,
      body: input.body,
      inputMethod: input.inputMethod,
      ageGroup: input.ageGroup ?? null,
      gender: input.gender ?? null,
      regionCode: input.regionCode ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  };
}
