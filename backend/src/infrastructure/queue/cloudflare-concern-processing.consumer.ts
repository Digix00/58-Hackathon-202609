import type { ConcernProcessingMessage } from "../../application/port/concern-processing-queue";
import type { IConcernProcessingUseCase } from "../../application/usecase/concern-processing.usecase";

/** Connects the Workers Queue consumer event to the application use case. */
export class CloudflareConcernProcessingConsumer {
  private readonly useCase: IConcernProcessingUseCase;

  constructor(useCase: IConcernProcessingUseCase) {
    this.useCase = useCase;
  }

  readonly handle = async (
    batch: MessageBatch<ConcernProcessingMessage>,
  ): Promise<void> => {
    for (const message of batch.messages) {
      try {
        await this.useCase.execute(message.body);
        message.ack();
      } catch {
        message.retry();
      }
    }
  };
}
