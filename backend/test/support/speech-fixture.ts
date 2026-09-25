import { SpeechUseCase } from "../../src/application/usecase/speech.usecase";
import { SpeechHandler } from "../../src/presentation/speech.handler";

export function createSpeechDependencies() {
  return {
    speechHandler: new SpeechHandler(
      new SpeechUseCase(
        null,
        { getDurationSeconds: async () => 1 },
        { consume: async () => ({ allowed: true }) },
      ),
    ),
  };
}
