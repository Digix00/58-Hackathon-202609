import type { AgeGroup, Gender } from "../entity/concern";
import { Concern } from "../entity/concern";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingQueue,
} from "../port/concern-processing-queue";
import type {
  ConcernListCursor,
  ConcernRepository,
  ListPublishedConcernsInput,
} from "../repository/concern.repository";
import { generateId } from "../shared/id-generator";

export interface CreateConcernInput {
  userId: string;
  body: string;
  ageGroup?: AgeGroup;
  gender?: Gender;
  regionCode?: string;
}

export interface IConcernUseCase {
  create(input: CreateConcernInput): Promise<Concern>;
  listPublished(
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult>;
  findPublishedById(id: string): Promise<Concern | null>;
}

export interface ListPublishedConcernsResult {
  items: Concern[];
  nextCursor: ConcernListCursor | null;
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
  private readonly processingQueue?: ConcernProcessingQueue;

  constructor(
    repository: ConcernRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
    processingQueue?: ConcernProcessingQueue,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
    this.processingQueue = processingQueue;
  }

  readonly create = async (input: CreateConcernInput): Promise<Concern> => {
    const concern = new Concern({
      id: this.createId(),
      userId: input.userId,
      body: input.body,
      ageGroup: input.ageGroup,
      gender: input.gender,
      regionCode: input.regionCode,
      createdAt: this.now().toISOString(),
    });

    const savedConcern = await this.repository.insert(concern);
    if (this.processingQueue) {
      await this.processingQueue.enqueue({
        type: CONCERN_PROCESSING_MESSAGE_TYPE,
        concernId: savedConcern.id,
        body: savedConcern.body,
      });
    }

    return savedConcern;
  };

  readonly listPublished = async (
    input: ListPublishedConcernsInput,
  ): Promise<ListPublishedConcernsResult> => {
    const result = await this.repository.listPublished(input);
    const lastItem = result.items[result.items.length - 1];

    return {
      items: result.items,
      nextCursor:
        result.hasMore && lastItem
          ? { createdAt: lastItem.createdAt, id: lastItem.id }
          : null,
    };
  };

  readonly findPublishedById = (id: string): Promise<Concern | null> =>
    this.repository.findPublishedById(id);
}
