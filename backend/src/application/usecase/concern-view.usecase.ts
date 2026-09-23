import { ConcernView } from "../entity/concern-view";
import type { ConcernViewRepository } from "../repository/concern-view.repository";

export interface IConcernViewUseCase {
  record(concernId: string, actorKey: string): Promise<ConcernView | null>;
}

export class ConcernViewUseCase implements IConcernViewUseCase {
  private readonly repository: ConcernViewRepository;
  private readonly now: () => Date;

  constructor(
    repository: ConcernViewRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.now = now;
  }

  readonly record = (concernId: string, actorKey: string) =>
    this.repository.insert(
      new ConcernView({
        concernId,
        actorKey,
        viewedAt: this.now().toISOString(),
      }),
    );
}
