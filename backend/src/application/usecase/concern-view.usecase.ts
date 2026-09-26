import { ConcernView } from "../entity/concern-view";
import { LearningEvent } from "../entity/learning-event";
import type { ConcernViewRepository } from "../repository/concern-view.repository";
import { generateId } from "../shared/id-generator";

export interface IConcernViewUseCase {
  record(concernId: string, actorKey: string): Promise<ConcernView | null>;
}

export class ConcernViewUseCase implements IConcernViewUseCase {
  private readonly repository: ConcernViewRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: ConcernViewRepository,
    now: () => Date = () => new Date(),
    createId: () => string = generateId,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  readonly record = (concernId: string, actorKey: string) => {
    const viewedAt = this.now().toISOString();
    return this.repository.insert(
      new ConcernView({ concernId, actorKey, viewedAt }),
      new LearningEvent({
        id: this.createId(),
        userId: actorKey,
        eventType: "view",
        concernId,
        occurredAt: viewedAt,
      }),
    );
  };
}
