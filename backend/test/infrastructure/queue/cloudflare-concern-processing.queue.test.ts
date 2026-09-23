import { describe, expect, it, vi } from "vitest";

import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../../../src/application/port/concern-processing-queue";
import { CloudflareConcernProcessingConsumer } from "../../../src/infrastructure/queue/cloudflare-concern-processing.consumer";
import { CloudflareConcernProcessingQueue } from "../../../src/infrastructure/queue/cloudflare-concern-processing.queue";

const message: ConcernProcessingMessage = {
  type: CONCERN_PROCESSING_MESSAGE_TYPE,
  concernId: "concern-1",
  body: "疲れています",
};

describe("CloudflareConcernProcessingQueue", () => {
  it("sends JSON messages to the configured Queue binding", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const queue = new CloudflareConcernProcessingQueue({ send } as never);

    await queue.enqueue(message);

    expect(send).toHaveBeenCalledWith(message, { contentType: "json" });
  });
});

describe("CloudflareConcernProcessingConsumer", () => {
  it("connects successful messages to the use case and acknowledges them", async () => {
    const execute = vi.fn().mockResolvedValue({
      concernId: message.concernId,
      representations: { jaHira: "つかれています", en: "I am tired" },
      embedding: [0.1],
    });
    const ack = vi.fn();
    const retry = vi.fn();
    const consumer = new CloudflareConcernProcessingConsumer({ execute });

    await consumer.handle({
      messages: [{ body: message, ack, retry }],
    } as never);

    expect(execute).toHaveBeenCalledWith(message);
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries a message when the use case fails", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("AI unavailable"));
    const ack = vi.fn();
    const retry = vi.fn();
    const consumer = new CloudflareConcernProcessingConsumer({ execute });

    await consumer.handle({
      messages: [{ body: message, ack, retry }],
    } as never);

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
  });
});
