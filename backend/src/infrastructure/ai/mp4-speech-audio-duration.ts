import * as MP4Box from "mp4box";
import { SpeechAudioDurationLimitExceededError } from "../../application/port/speech-audio-duration-reader";

const MAX_AUDIO_DURATION_SECONDS = 60;
const MAX_AAC_SAMPLE_RATE = 96_000;
// A supported AAC-LC track needs at most 6,000 access units for 60 seconds.
export const MAX_MP4_SAMPLE_ENTRIES = 10_000;
const MAX_MP4_BOX_VISITS = 100_000;
const MAX_MP4_BOX_DEPTH = 16;
const MP4_CONTAINER_BOXES = new Set([
  "dinf",
  "edts",
  "mdia",
  "meta",
  "minf",
  "moof",
  "moov",
  "mvex",
  "stbl",
  "traf",
  "trak",
]);

export function readMp4DurationSeconds(audio: Uint8Array): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      enforceMp4SampleEntryBudget(audio);
    } catch (error) {
      reject(error);
      return;
    }

    const file = MP4Box.createFile();
    let ready = false;
    let sampleCount = 0;
    let firstPresentationTime = Number.POSITIVE_INFINITY;
    let lastPresentationTime = Number.NEGATIVE_INFINITY;
    let samplesPerAccessUnit: number | undefined;
    let sampleRate: number | undefined;
    let fragmented = false;
    let settled = false;

    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const failInvalid = (message: string) => fail(new TypeError(message));

    const failTooLong = (stopExtraction: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (stopExtraction) {
        try {
          file.stop();
        } finally {
          reject(new SpeechAudioDurationLimitExceededError());
        }
      } else {
        reject(new SpeechAudioDurationLimitExceededError());
      }
    };

    file.onError = () => failInvalid("Invalid MP4 audio");
    file.onReady = (info) => {
      ready = true;
      if (info.audioTracks.length !== 1) {
        failInvalid("MP4 must contain exactly one audio track");
        return;
      }

      const audioTrack = info.audioTracks[0]!;
      fragmented = info.isFragmented;
      if (audioTrack.codec !== "mp4a.40.2" || !audioTrack.audio) {
        failInvalid("MP4 must use AAC-LC audio");
        return;
      }
      sampleRate = audioTrack.audio.sample_rate;
      if (
        !Number.isFinite(sampleRate) ||
        sampleRate <= 0 ||
        sampleRate > MAX_AAC_SAMPLE_RATE
      ) {
        failInvalid("MP4 audio sample rate is invalid");
        return;
      }
      if (
        !fragmented &&
        (!Number.isSafeInteger(audioTrack.nb_samples) ||
          audioTrack.nb_samples < 1)
      ) {
        failInvalid("MP4 audio sample count is invalid");
        return;
      }
      file.onSamples = (trackId, _user, samples) => {
        if (trackId !== audioTrack.id || settled) {
          return;
        }

        for (const sample of samples) {
          if (
            sample.size <= 0 ||
            !sample.data ||
            sample.data.byteLength !== sample.size ||
            sample.timescale <= 0
          ) {
            failInvalid("MP4 audio sample is incomplete");
            return;
          }

          if (samplesPerAccessUnit === undefined) {
            const aacConfig = readAacConfig(sample.description);
            if (aacConfig.sampleRate !== sampleRate) {
              failInvalid(
                "MP4 AAC sample rate does not match its decoder config",
              );
              return;
            }
            samplesPerAccessUnit = aacConfig.samplesPerAccessUnit;
          }
          if (samplesPerAccessUnit === undefined || sampleRate === undefined) {
            failInvalid("MP4 AAC configuration is unavailable");
            return;
          }
          const startSeconds = sample.dts / sample.timescale;
          const endSeconds =
            (sample.dts + Math.max(0, sample.duration)) / sample.timescale;
          if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
            failInvalid("MP4 audio sample timing is invalid");
            return;
          }
          firstPresentationTime = Math.min(firstPresentationTime, startSeconds);
          lastPresentationTime = Math.max(lastPresentationTime, endSeconds);
          sampleCount += 1;
          const sampleCountDuration =
            (sampleCount * samplesPerAccessUnit) / sampleRate;
          const timelineDuration = lastPresentationTime - firstPresentationTime;
          if (
            sampleCountDuration > MAX_AUDIO_DURATION_SECONDS ||
            timelineDuration > MAX_AUDIO_DURATION_SECONDS
          ) {
            failTooLong(true);
            return;
          }
        }
      };

      file.setExtractionOptions(audioTrack.id, undefined, { nbSamples: 256 });
      file.start();
    };

    try {
      const data = audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength,
      );
      file.appendBuffer(MP4Box.MP4BoxBuffer.fromArrayBuffer(data, 0), true);
      file.flush();
    } catch {
      failInvalid("Invalid MP4 audio");
      return;
    }

    if (settled) {
      return;
    }
    if (
      !ready ||
      sampleCount === 0 ||
      (!fragmented && sampleCount !== file.getInfo().audioTracks[0]?.nb_samples)
    ) {
      failInvalid("MP4 contains no complete audio samples");
      return;
    }

    if (samplesPerAccessUnit === undefined || sampleRate === undefined) {
      failInvalid("MP4 AAC configuration is unavailable");
      return;
    }
    const sampleCountDuration =
      (sampleCount * samplesPerAccessUnit) / sampleRate;
    const timelineDuration = lastPresentationTime - firstPresentationTime;
    const duration = Math.max(sampleCountDuration, timelineDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      failInvalid("MP4 audio duration is invalid");
      return;
    }

    settled = true;
    resolve(duration);
  });
}

function readAacConfig(description: object): {
  sampleRate: number;
  samplesPerAccessUnit: number;
} {
  const esds = Reflect.get(description, "esds");
  const esd = esds && Reflect.get(esds, "esd");
  const descriptors = esd && Reflect.get(esd, "descs");
  const decoderConfig = Array.isArray(descriptors)
    ? descriptors.find((descriptor) => Reflect.get(descriptor, "tag") === 4)
    : undefined;
  const decoderDescriptors =
    decoderConfig && Reflect.get(decoderConfig, "descs");
  const specificInfo = Array.isArray(decoderDescriptors)
    ? decoderDescriptors.find(
        (descriptor) => Reflect.get(descriptor, "tag") === 5,
      )
    : undefined;
  const config = specificInfo && Reflect.get(specificInfo, "data");
  if (!(config instanceof Uint8Array) || config.byteLength < 2) {
    throw new TypeError("MP4 AAC decoder configuration is invalid");
  }

  let bitOffset = 0;
  const readBits = (count: number): number => {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = config[bitOffset >> 3];
      if (byte === undefined) {
        throw new TypeError("MP4 AAC decoder configuration is truncated");
      }
      value = (value << 1) | ((byte >> (7 - (bitOffset & 7))) & 1);
      bitOffset += 1;
    }
    return value;
  };

  const audioObjectType = readBits(5);
  if (audioObjectType !== 2) {
    throw new TypeError("MP4 audio must use AAC-LC");
  }
  const samplingFrequencyIndex = readBits(4);
  const commonSampleRates = [
    96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000,
    12_000, 11_025, 8_000, 7_350,
  ];
  const sampleRate =
    samplingFrequencyIndex === 15
      ? readBits(24)
      : commonSampleRates[samplingFrequencyIndex];
  if (sampleRate === undefined || sampleRate <= 0) {
    throw new TypeError("MP4 AAC sample rate is invalid");
  }
  const channelConfiguration = readBits(4);
  if (channelConfiguration === 0) {
    throw new TypeError("Program-config AAC is unsupported");
  }
  const frameLengthFlag = readBits(1);
  return {
    sampleRate,
    samplesPerAccessUnit: frameLengthFlag === 1 ? 960 : 1_024,
  };
}

type Mp4ParseBudget = {
  boxVisits: number;
  sampleEntries: number;
};

function enforceMp4SampleEntryBudget(audio: Uint8Array): void {
  const budget: Mp4ParseBudget = { boxVisits: 0, sampleEntries: 0 };
  visitMp4Boxes(audio, 0, audio.byteLength, 0, budget);
}

function visitMp4Boxes(
  audio: Uint8Array,
  start: number,
  end: number,
  depth: number,
  budget: Mp4ParseBudget,
): void {
  if (depth > MAX_MP4_BOX_DEPTH) {
    throw new TypeError("MP4 box nesting is too deep");
  }

  for (let offset = start; offset < end; ) {
    budget.boxVisits += 1;
    if (budget.boxVisits > MAX_MP4_BOX_VISITS) {
      throw new TypeError("MP4 contains too many boxes");
    }
    if (offset + 8 > end) {
      throw new TypeError("Invalid MP4 box header");
    }

    const size32 = readUint32Be(audio, offset);
    const type = String.fromCharCode(
      audio[offset + 4]!,
      audio[offset + 5]!,
      audio[offset + 6]!,
      audio[offset + 7]!,
    );
    let headerSize = 8;
    let boxSize: number;
    if (size32 === 1) {
      if (offset + 16 > end || readUint32Be(audio, offset + 8) !== 0) {
        throw new TypeError("Invalid extended MP4 box size");
      }
      boxSize = readUint32Be(audio, offset + 12);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - offset;
    } else {
      boxSize = size32;
    }

    if (boxSize < headerSize || boxSize > end - offset) {
      throw new TypeError("Invalid MP4 box size");
    }
    const boxEnd = offset + boxSize;
    const payloadStart = offset + headerSize;
    if (type === "stsz") {
      visitSampleSizeBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "stz2") {
      visitCompactSampleSizeBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "trun") {
      visitTrackRunBox(audio, payloadStart, boxEnd, budget);
    }

    if (MP4_CONTAINER_BOXES.has(type)) {
      const containerPrefix = type === "meta" ? 4 : 0;
      if (payloadStart + containerPrefix > boxEnd) {
        throw new TypeError("Invalid MP4 container box");
      }
      visitMp4Boxes(
        audio,
        payloadStart + containerPrefix,
        boxEnd,
        depth + 1,
        budget,
      );
    }
    offset = boxEnd;
  }
}

function visitSampleSizeBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 12 > boxEnd) {
    throw new TypeError("Invalid MP4 sample size box");
  }
  const sampleSize = readUint32Be(audio, payloadStart + 4);
  const sampleCount = readUint32Be(audio, payloadStart + 8);
  addMp4SampleEntries(sampleCount, budget);
  if (
    sampleSize === 0 &&
    sampleCount > Math.floor((boxEnd - (payloadStart + 12)) / 4)
  ) {
    throw new TypeError("Invalid MP4 sample size table");
  }
}

function visitCompactSampleSizeBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 12 > boxEnd) {
    throw new TypeError("Invalid MP4 compact sample size box");
  }
  const fieldSize = audio[payloadStart + 7]!;
  const sampleCount = readUint32Be(audio, payloadStart + 8);
  if (![4, 8, 16].includes(fieldSize)) {
    throw new TypeError("Invalid MP4 compact sample size field");
  }
  addMp4SampleEntries(sampleCount, budget);
  const tableBytes = Math.ceil((sampleCount * fieldSize) / 8);
  if (tableBytes > boxEnd - (payloadStart + 12)) {
    throw new TypeError("Invalid MP4 compact sample size table");
  }
}

function visitTrackRunBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 8 > boxEnd) {
    throw new TypeError("Invalid MP4 track run box");
  }
  addMp4SampleEntries(readUint32Be(audio, payloadStart + 4), budget);
}

function addMp4SampleEntries(
  sampleCount: number,
  budget: Mp4ParseBudget,
): void {
  if (sampleCount > MAX_MP4_SAMPLE_ENTRIES - budget.sampleEntries) {
    throw new TypeError("MP4 sample count exceeds parser budget");
  }
  budget.sampleEntries += sampleCount;
}

function readUint32Be(audio: Uint8Array, offset: number): number {
  return (
    audio[offset]! * 0x1_000_000 +
    (audio[offset + 1]! << 16) +
    (audio[offset + 2]! << 8) +
    audio[offset + 3]!
  );
}
