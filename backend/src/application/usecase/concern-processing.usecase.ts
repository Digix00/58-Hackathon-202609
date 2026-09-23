import { CONCERN_BODY_MAX_LENGTH } from "../entity/concern";
import {
  CONCERN_PROCESSING_MESSAGE_TYPE,
  type ConcernProcessingMessage,
} from "../port/concern-processing-queue";
import type { TextEmbeddingGenerator } from "../port/text-embedding-generator";
import type { TextTranslator } from "../port/text-translator";

export interface ConcernProcessingResult {
  concernId: string;
  representations: {
    jaHira: string;
    en: string;
  };
  embedding: readonly number[];
}

export interface IConcernProcessingUseCase {
  execute(message: ConcernProcessingMessage): Promise<ConcernProcessingResult>;
}

/**
 * Runs the AI work for one concern. Persistence of the derived values is
 * intentionally left for a later step because this PoC has no representation
 * or embedding tables yet.
 */
export class ConcernProcessingUseCase implements IConcernProcessingUseCase {
  private readonly translator: TextTranslator;
  private readonly embeddingGenerator: TextEmbeddingGenerator;

  constructor(
    translator: TextTranslator,
    embeddingGenerator: TextEmbeddingGenerator,
  ) {
    this.translator = translator;
    this.embeddingGenerator = embeddingGenerator;
  }

  readonly execute = async (
    message: ConcernProcessingMessage,
  ): Promise<ConcernProcessingResult> => {
    const input = validateMessage(message);
    const [jaHira, en, embeddings] = await Promise.all([
      this.translator.convertToHiragana(input.body),
      this.translator.translateToEnglish(input.body),
      this.embeddingGenerator.generateEmbeddings([input.body]),
    ]);
    const embedding = embeddings[0];

    if (!embedding) {
      throw new Error("Workers AI returned no embedding for the concern");
    }

    return {
      concernId: input.concernId,
      representations: { jaHira, en },
      embedding,
    };
  };
}

function validateMessage(
  message: ConcernProcessingMessage,
): ConcernProcessingMessage {
  if (
    message.type !== CONCERN_PROCESSING_MESSAGE_TYPE ||
    message.concernId.trim().length === 0 ||
    message.body.trim().length === 0 ||
    message.body.trim().length > CONCERN_BODY_MAX_LENGTH
  ) {
    throw new TypeError("invalid concern processing message");
  }

  return {
    ...message,
    concernId: message.concernId.trim(),
    body: message.body.trim(),
  };
}
