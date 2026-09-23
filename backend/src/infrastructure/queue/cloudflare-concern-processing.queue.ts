import type {
  ConcernProcessingMessage,
  ConcernProcessingQueue,
} from "../../application/port/concern-processing-queue";

/** Adapts the Cloudflare Queue producer binding to the application port. */
export class CloudflareConcernProcessingQueue
  implements ConcernProcessingQueue
{
  private readonly queue: Queue<ConcernProcessingMessage>;

  constructor(queue: Queue<ConcernProcessingMessage>) {
    this.queue = queue;
  }

  async enqueue(message: ConcernProcessingMessage): Promise<void> {
    await this.queue.send(message, { contentType: "json" });
  }
}
