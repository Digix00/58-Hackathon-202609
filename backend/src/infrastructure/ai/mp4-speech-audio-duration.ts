import * as MP4Box from "mp4box";
import { SpeechAudioDurationLimitExceededError } from "../../application/port/speech-audio-duration-reader";

const MAX_AUDIO_DURATION_SECONDS = 60;
const MAX_AAC_SAMPLE_RATE = 96_000;
// A supported AAC-LC track needs at most 6,000 access units for 60 seconds.
export const MAX_MP4_SAMPLE_ENTRIES = 10_000;
const MAX_MP4_BOX_VISITS = 100_000;
const MAX_MP4_TABLE_ENTRIES = 100_000;
const MAX_MP4_BOX_DEPTH = 16;
const MP4_CONTAINER_BOXES = new Set([
  "dinf",
  "edts",
  "mdia",
  "meta",
  "minf",
  "mfra",
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
  tableEntries: number;
};

function enforceMp4SampleEntryBudget(audio: Uint8Array): void {
  const budget: Mp4ParseBudget = {
    boxVisits: 0,
    sampleEntries: 0,
    tableEntries: 0,
  };
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
    } else if (type === "subs") {
      visitSubsampleBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "sgpd") {
      visitSampleGroupDescriptionBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "sbgp") {
      visitSampleGroupBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "saio") {
      visitSampleAuxiliaryOffsetsBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "saiz") {
      visitSampleAuxiliarySizesBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "tfra") {
      visitTrackFragmentRandomAccessBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "sidx") {
      visitSegmentIndexBox(audio, payloadStart, boxEnd, budget);
    } else if (type === "stsd" || type === "dref") {
      visitBoxEntryTable(audio, payloadStart, boxEnd, budget, type);
    } else if (type === "elst") {
      const version = audio[payloadStart];
      visitCountedTable(
        audio,
        payloadStart,
        boxEnd,
        budget,
        type,
        4,
        version === 1 ? 20 : 12,
      );
    } else if (
      type === "stts" ||
      type === "ctts" ||
      type === "stsc" ||
      type === "stco" ||
      type === "co64" ||
      type === "stss" ||
      type === "stps" ||
      type === "stsh"
    ) {
      const recordSize = {
        stts: 8,
        ctts: 8,
        stsc: 12,
        stco: 4,
        co64: 8,
        stss: 4,
        stps: 4,
        stsh: 8,
      }[type];
      visitCountedTable(
        audio,
        payloadStart,
        boxEnd,
        budget,
        type,
        4,
        recordSize,
      );
    } else if (type === "sdtp") {
      const entries = boxEnd - payloadStart - 4;
      if (entries < 0) {
        throw new TypeError("Invalid MP4 sdtp table");
      }
      addMp4TableEntries(entries, budget, type);
    } else if (type === "stdp") {
      const payloadBytes = boxEnd - payloadStart - 4;
      if (payloadBytes < 0 || payloadBytes % 2 !== 0) {
        throw new TypeError("Invalid MP4 stdp table");
      }
      addMp4TableEntries(payloadBytes / 2, budget, type);
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
  const flags =
    (audio[payloadStart + 1]! << 16) |
    (audio[payloadStart + 2]! << 8) |
    audio[payloadStart + 3]!;
  const sampleCount = readUint32Be(audio, payloadStart + 4);
  addMp4SampleEntries(sampleCount, budget);
  let sampleRecordsStart = payloadStart + 8;
  if (flags & 1) {
    sampleRecordsStart += 4;
  }
  if (flags & 4) {
    sampleRecordsStart += 4;
  }
  if (sampleRecordsStart > boxEnd) {
    throw new TypeError("Invalid MP4 track run box");
  }
  const recordSize =
    4 *
    (Number(Boolean(flags & 0x100)) +
      Number(Boolean(flags & 0x200)) +
      Number(Boolean(flags & 0x400)) +
      Number(Boolean(flags & 0x800)));
  if (
    recordSize > 0 &&
    sampleCount > Math.floor((boxEnd - sampleRecordsStart) / recordSize)
  ) {
    throw new TypeError("Invalid MP4 track run table");
  }
}

function addMp4SampleEntries(
  sampleCount: number,
  budget: Mp4ParseBudget,
): void {
  addMp4TableEntries(sampleCount, budget, "sample");
  if (sampleCount > MAX_MP4_SAMPLE_ENTRIES - budget.sampleEntries) {
    throw new TypeError("MP4 sample count exceeds parser budget");
  }
  budget.sampleEntries += sampleCount;
}

function visitCountedTable(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
  type: string,
  countOffset: number,
  recordSize: number,
): void {
  const countPosition = payloadStart + countOffset;
  if (countPosition + 4 > boxEnd) {
    throw new TypeError(`Invalid MP4 ${type} table`);
  }
  const entryCount = readUint32Be(audio, countPosition);
  addMp4TableEntries(entryCount, budget, type);
  const recordsStart = countPosition + 4;
  if (entryCount > Math.floor((boxEnd - recordsStart) / recordSize)) {
    throw new TypeError(`Invalid MP4 ${type} table`);
  }
}

function visitBoxEntryTable(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
  type: string,
): void {
  const countPosition = payloadStart + 4;
  if (countPosition + 4 > boxEnd) {
    throw new TypeError(`Invalid MP4 ${type} table`);
  }
  const entryCount = readUint32Be(audio, countPosition);
  addMp4TableEntries(entryCount, budget, type);

  let offset = countPosition + 4;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 8 > boxEnd) {
      throw new TypeError(`Invalid MP4 ${type} table`);
    }
    const size32 = readUint32Be(audio, offset);
    let headerSize = 8;
    let boxSize: number;
    if (size32 === 1) {
      if (offset + 16 > boxEnd || readUint32Be(audio, offset + 8) !== 0) {
        throw new TypeError(`Invalid MP4 ${type} entry size`);
      }
      boxSize = readUint32Be(audio, offset + 12);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = boxEnd - offset;
    } else {
      boxSize = size32;
    }
    if (boxSize < headerSize || boxSize > boxEnd - offset) {
      throw new TypeError(`Invalid MP4 ${type} entry size`);
    }
    offset += boxSize;
  }
}

function visitSampleGroupBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 8 > boxEnd) {
    throw new TypeError("Invalid MP4 sbgp table");
  }
  const version = audio[payloadStart]!;
  visitCountedTable(
    audio,
    payloadStart,
    boxEnd,
    budget,
    "sbgp",
    version === 1 ? 12 : 8,
    8,
  );
}

function visitSampleGroupDescriptionBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 8 > boxEnd) {
    throw new TypeError("Invalid MP4 sgpd table");
  }
  const version = audio[payloadStart]!;
  const countOffset = version === 0 ? 8 : 12;
  const countPosition = payloadStart + countOffset;
  if (countPosition + 4 > boxEnd) {
    throw new TypeError("Invalid MP4 sgpd table");
  }
  const entryCount = readUint32Be(audio, countPosition);
  addMp4TableEntries(entryCount, budget, "sgpd");
  if (version === 1) {
    const defaultLength = readUint32Be(audio, payloadStart + 8);
    const minimumRecordSize = defaultLength === 0 ? 4 : defaultLength;
    if (
      entryCount >
      Math.floor((boxEnd - (countPosition + 4)) / minimumRecordSize)
    ) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
  }
}

function visitSubsampleBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 8 > boxEnd) {
    throw new TypeError("Invalid MP4 subs table");
  }
  const version = audio[payloadStart]!;
  const entryCount = readUint32Be(audio, payloadStart + 4);
  addMp4TableEntries(entryCount, budget, "subs");
  const subsampleRecordSize = version === 1 ? 10 : 8;
  let offset = payloadStart + 8;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 6 > boxEnd) {
      throw new TypeError("Invalid MP4 subs table");
    }
    const subsampleCount = (audio[offset + 4]! << 8) | audio[offset + 5]!;
    offset += 6;
    addMp4TableEntries(subsampleCount, budget, "subs");
    if (subsampleCount > Math.floor((boxEnd - offset) / subsampleRecordSize)) {
      throw new TypeError("Invalid MP4 subsample table");
    }
    offset += subsampleCount * subsampleRecordSize;
  }
}

function visitSampleAuxiliaryOffsetsBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 4 > boxEnd) {
    throw new TypeError("Invalid MP4 saio table");
  }
  const flags =
    (audio[payloadStart + 1]! << 16) |
    (audio[payloadStart + 2]! << 8) |
    audio[payloadStart + 3]!;
  const version = audio[payloadStart]!;
  const countOffset = flags & 1 ? 12 : 4;
  visitCountedTable(
    audio,
    payloadStart,
    boxEnd,
    budget,
    "saio",
    countOffset,
    version === 0 ? 4 : 8,
  );
}

function visitSampleAuxiliarySizesBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 9 > boxEnd) {
    throw new TypeError("Invalid MP4 saiz table");
  }
  const flags =
    (audio[payloadStart + 1]! << 16) |
    (audio[payloadStart + 2]! << 8) |
    audio[payloadStart + 3]!;
  const countOffset = flags & 1 ? 13 : 5;
  const countPosition = payloadStart + countOffset;
  if (countPosition + 4 > boxEnd) {
    throw new TypeError("Invalid MP4 saiz table");
  }
  const entryCount = readUint32Be(audio, countPosition);
  const defaultSampleInfoSize = audio[payloadStart + (flags & 1 ? 12 : 4)]!;
  if (defaultSampleInfoSize === 0) {
    addMp4TableEntries(entryCount, budget, "saiz");
    if (entryCount > boxEnd - (countPosition + 4)) {
      throw new TypeError("Invalid MP4 saiz table");
    }
  }
}

function visitTrackFragmentRandomAccessBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 16 > boxEnd) {
    throw new TypeError("Invalid MP4 tfra table");
  }
  const version = audio[payloadStart]!;
  const lengthSizes = audio[payloadStart + 7]!;
  const entryCount = readUint32Be(audio, payloadStart + 12);
  const recordSize =
    (version === 1 ? 16 : 8) +
    ((lengthSizes >> 4) & 3) +
    ((lengthSizes >> 2) & 3) +
    (lengthSizes & 3) +
    3;
  addMp4TableEntries(entryCount, budget, "tfra");
  if (entryCount > Math.floor((boxEnd - (payloadStart + 16)) / recordSize)) {
    throw new TypeError("Invalid MP4 tfra table");
  }
}

function visitSegmentIndexBox(
  audio: Uint8Array,
  payloadStart: number,
  boxEnd: number,
  budget: Mp4ParseBudget,
): void {
  if (payloadStart + 24 > boxEnd) {
    throw new TypeError("Invalid MP4 sidx table");
  }
  const version = audio[payloadStart]!;
  const countPosition = payloadStart + (version === 0 ? 22 : 30);
  if (countPosition + 2 > boxEnd) {
    throw new TypeError("Invalid MP4 sidx table");
  }
  const entryCount = (audio[countPosition]! << 8) | audio[countPosition + 1]!;
  addMp4TableEntries(entryCount, budget, "sidx");
  if (entryCount > Math.floor((boxEnd - countPosition - 2) / 12)) {
    throw new TypeError("Invalid MP4 sidx table");
  }
}

function addMp4TableEntries(
  entryCount: number,
  budget: Mp4ParseBudget,
  type: string,
): void {
  if (entryCount > MAX_MP4_TABLE_ENTRIES - budget.tableEntries) {
    throw new TypeError(`MP4 ${type} table exceeds parser budget`);
  }
  budget.tableEntries += entryCount;
}

function readUint32Be(audio: Uint8Array, offset: number): number {
  return (
    audio[offset]! * 0x1_000_000 +
    (audio[offset + 1]! << 16) +
    (audio[offset + 2]! << 8) +
    audio[offset + 3]!
  );
}
