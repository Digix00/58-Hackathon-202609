import * as MP4Box from "mp4box";
import { SpeechAudioDurationLimitExceededError } from "../../application/port/speech-audio-duration-reader";
import { readAscii } from "./audio-binary";

const MAX_AUDIO_DURATION_SECONDS = 60;
const MAX_AAC_SAMPLE_RATE = 96_000;
// A supported AAC-LC track needs at most 6,000 access units for 60 seconds.
export const MAX_MP4_SAMPLE_ENTRIES = 10_000;
const MAX_MP4_BOX_VISITS = 100_000;
export const MAX_MP4_TABLE_ENTRIES = 100_000;
const MAX_MP4_BOX_DEPTH = 16;
const MP4_CONTAINER_BOXES = new Set([
  "dinf",
  "edts",
  "ilst",
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
  "udta",
  "----",
]);

export function readMp4DurationSeconds(audio: Uint8Array): Promise<number> {
  return new Promise((resolve, reject) => {
    let gapless: AacGapless | undefined;
    try {
      gapless = validateMp4BeforeParsing(audio);
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
    let mediaTimescale: number | undefined;
    let movieTimescale: number | undefined;
    let trackEdits: Mp4Edit[] | undefined;
    let totalSampleDurationTicks = 0;
    let previousPresentationEndTicks: number | undefined;
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
      trackEdits = audioTrack.edits;
      mediaTimescale = audioTrack.timescale;
      movieTimescale = audioTrack.movie_timescale;
      if (audioTrack.codec !== "mp4a.40.2" || !audioTrack.audio) {
        failInvalid("MP4 must use AAC-LC audio");
        return;
      }
      const audioTrackData = file.getTrackById(audioTrack.id);
      if (audioTrackData.mdia.minf.stbl.stsd.entries.length !== 1) {
        failInvalid(
          "MP4 audio track must contain exactly one sample description",
        );
        return;
      }
      sampleRate = audioTrack.audio.sample_rate;
      if (!Number.isSafeInteger(mediaTimescale) || mediaTimescale! <= 0) {
        failInvalid("MP4 audio timescale is invalid");
        return;
      }
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
          if (sample.description_index !== 0) {
            failInvalid("MP4 audio sample uses an unsupported description");
            return;
          }
          if (
            sample.size <= 0 ||
            !sample.data ||
            sample.data.byteLength !== sample.size ||
            !Number.isSafeInteger(sample.timescale) ||
            sample.timescale !== mediaTimescale
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
          const expectedSampleDurationTicks =
            (samplesPerAccessUnit * sample.timescale) / sampleRate;
          const isLastSample =
            !fragmented && sampleCount + 1 === audioTrack.nb_samples;
          if (
            !Number.isSafeInteger(sample.duration) ||
            sample.duration <= 0 ||
            (isLastSample
              ? sample.duration > expectedSampleDurationTicks + 1
              : Math.abs(sample.duration - expectedSampleDurationTicks) > 1)
          ) {
            failInvalid("MP4 sample duration does not match AAC configuration");
            return;
          }
          if (
            !Number.isSafeInteger(sample.cts) ||
            (previousPresentationEndTicks !== undefined &&
              sample.cts !== previousPresentationEndTicks)
          ) {
            failInvalid("MP4 AAC presentation timestamps are inconsistent");
            return;
          }
          previousPresentationEndTicks = sample.cts + sample.duration;
          totalSampleDurationTicks += sample.duration;
          const startSeconds = sample.cts / sample.timescale;
          const endSeconds = (sample.cts + sample.duration) / sample.timescale;
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
          const maximumTrim = gapless
            ? (5 * samplesPerAccessUnit) / sampleRate
            : 0;
          if (
            (trackEdits === undefined &&
              sampleCountDuration > MAX_AUDIO_DURATION_SECONDS + maximumTrim) ||
            (trackEdits === undefined &&
              timelineDuration > MAX_AUDIO_DURATION_SECONDS + maximumTrim)
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
    const expectedSampleDurationTicks =
      (sampleCount * samplesPerAccessUnit * mediaTimescale!) / sampleRate;
    const maximumFinalSampleTrimTicks =
      (samplesPerAccessUnit * mediaTimescale!) / sampleRate;
    if (
      totalSampleDurationTicks > expectedSampleDurationTicks + 1 ||
      expectedSampleDurationTicks - totalSampleDurationTicks >
        maximumFinalSampleTrimTicks + 1
    ) {
      failInvalid("MP4 sample timeline does not match AAC access units");
      return;
    }
    const timelineDuration = lastPresentationTime - firstPresentationTime;
    const encodedDuration = Math.max(sampleCountDuration, timelineDuration);
    let duration: number;
    if (trackEdits === undefined) {
      duration = encodedDuration;
      if (gapless) {
        const encodedSamples = sampleCount * samplesPerAccessUnit;
        if (
          fragmented ||
          gapless.priming > 4 * samplesPerAccessUnit ||
          gapless.padding >= samplesPerAccessUnit ||
          gapless.samples + gapless.priming + gapless.padding !== encodedSamples
        ) {
          failInvalid("MP4 gapless metadata does not match AAC samples");
          return;
        }
        duration = gapless.samples / sampleRate;
      }
    } else {
      try {
        duration = getEditedPlaybackDuration(
          trackEdits,
          movieTimescale,
          mediaTimescale,
          firstPresentationTime,
          lastPresentationTime,
        );
      } catch (error) {
        failInvalid(
          error instanceof Error ? error.message : "Invalid MP4 edit list",
        );
        return;
      }
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      failInvalid("MP4 audio duration is invalid");
      return;
    }
    if (duration > MAX_AUDIO_DURATION_SECONDS) {
      failTooLong(false);
      return;
    }

    settled = true;
    resolve(duration);
  });
}

type Mp4Edit = {
  segment_duration: number;
  media_time: number;
  media_rate_integer: number;
  media_rate_fraction: number;
};

function getEditedPlaybackDuration(
  edits: Mp4Edit[],
  movieTimescale: number | undefined,
  mediaTimescale: number | undefined,
  firstSampleTimeSeconds: number,
  lastSampleEndSeconds: number,
): number {
  if (
    edits.length === 0 ||
    !Number.isSafeInteger(movieTimescale) ||
    movieTimescale! <= 0 ||
    !Number.isSafeInteger(mediaTimescale) ||
    mediaTimescale! <= 0
  ) {
    throw new TypeError("Invalid MP4 edit list timescale");
  }

  let durationSeconds = 0;
  let hasMediaEdit = false;
  const mediaBoundaryTolerance = 1 / mediaTimescale! + 1 / movieTimescale!;
  for (const edit of edits) {
    if (
      !Number.isSafeInteger(edit.segment_duration) ||
      edit.segment_duration < 0 ||
      !Number.isSafeInteger(edit.media_time) ||
      edit.media_rate_integer !== 1 ||
      edit.media_rate_fraction !== 0
    ) {
      throw new TypeError("Invalid MP4 edit list entry");
    }

    const segmentDurationSeconds = edit.segment_duration / movieTimescale!;
    durationSeconds += segmentDurationSeconds;
    if (edit.media_time === -1) {
      continue;
    }
    if (edit.media_time < 0) {
      throw new TypeError("Invalid MP4 edit list media time");
    }
    if (segmentDurationSeconds === 0) {
      continue;
    }

    const mediaStartSeconds = edit.media_time / mediaTimescale!;
    const mediaEndSeconds = mediaStartSeconds + segmentDurationSeconds;
    if (
      mediaStartSeconds < firstSampleTimeSeconds - mediaBoundaryTolerance ||
      mediaEndSeconds > lastSampleEndSeconds + mediaBoundaryTolerance
    ) {
      throw new TypeError("MP4 edit list exceeds the verified audio samples");
    }
    hasMediaEdit = true;
  }

  if (!hasMediaEdit || !Number.isFinite(durationSeconds)) {
    throw new TypeError("MP4 edit list contains no playable audio");
  }
  return durationSeconds;
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

type AacGapless = { priming: number; padding: number; samples: number };
type ItunesItem = { mean?: string; name?: string; data?: string };

type Mp4ParseBudget = {
  boxVisits: number;
  sampleEntries: number;
  tableEntries: number;
  gapless?: AacGapless;
};

export function validateMp4BeforeParsing(
  audio: Uint8Array,
): AacGapless | undefined {
  const budget: Mp4ParseBudget = {
    boxVisits: 0,
    sampleEntries: 0,
    tableEntries: 0,
  };
  visitMp4Boxes(audio, 0, audio.byteLength, 0, budget);
  return budget.gapless;
}

function visitMp4Boxes(
  audio: Uint8Array,
  start: number,
  end: number,
  depth: number,
  budget: Mp4ParseBudget,
  item?: ItunesItem,
  path = "",
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
    // iTunes の自由形式タグだけを読む。サイズ・深さ・件数は既存の走査予算で制限する。
    if (item && (type === "mean" || type === "name" || type === "data")) {
      const prefix = type === "data" ? 8 : 4;
      if (boxEnd - payloadStart >= prefix && boxEnd - payloadStart <= 256) {
        if (item[type] !== undefined) {
          throw new TypeError("Duplicate MP4 metadata field");
        }
        if (readUint32Be(audio, payloadStart) !== (type === "data" ? 1 : 0)) {
          throw new TypeError("Invalid MP4 metadata field encoding");
        }
        item[type] = readAscii(
          audio,
          payloadStart + prefix,
          boxEnd - payloadStart - prefix,
        );
      }
    }
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
      if (payloadStart + 8 > boxEnd || version! > 1) {
        throw new TypeError("Unsupported MP4 edit list version");
      }
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
      const childItem: ItunesItem | undefined =
        type === "----" && path === "moov/udta/meta/ilst" ? {} : undefined;
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
        childItem,
        path ? `${path}/${type}` : type,
      );
      if (
        childItem?.mean === "com.apple.iTunes" &&
        childItem.name === "iTunSMPB"
      ) {
        const fields = childItem.data?.trim().split(/\s+/);
        if (
          budget.gapless ||
          !fields ||
          fields.length < 4 ||
          !fields.slice(0, 3).every((field) => /^[0-9a-f]{8}$/i.test(field)) ||
          !/^[0-9a-f]{16}$/i.test(fields[3]!)
        ) {
          throw new TypeError("Invalid MP4 gapless metadata");
        }
        const samples = Number.parseInt(fields[3]!, 16);
        if (!Number.isSafeInteger(samples) || samples <= 0) {
          throw new TypeError("Invalid MP4 gapless sample count");
        }
        budget.gapless = {
          priming: Number.parseInt(fields[1]!, 16),
          padding: Number.parseInt(fields[2]!, 16),
          samples,
        };
      }
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
  if (version > 2) {
    throw new TypeError("Unsupported MP4 sgpd version");
  }

  let defaultLength = 0;
  let defaultSampleDescriptionIndex = 0;
  let countOffset = 8;
  if (version >= 1) {
    if (payloadStart + 12 > boxEnd) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
    defaultLength = readUint32Be(audio, payloadStart + 8);
    countOffset = 12;
  }
  if (version >= 2) {
    if (payloadStart + 16 > boxEnd) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
    defaultSampleDescriptionIndex = readUint32Be(audio, payloadStart + 12);
    countOffset = 16;
  }

  const countPosition = payloadStart + countOffset;
  if (countPosition + 4 > boxEnd) {
    throw new TypeError("Invalid MP4 sgpd table");
  }
  const entryCount = readUint32Be(audio, countPosition);
  addMp4TableEntries(entryCount, budget, "sgpd");

  if (version === 2) {
    // The installed MP4Box parser reads this v2 field as its entry count.
    // Keep it within the already-capped actual count before passing the file on.
    if (defaultSampleDescriptionIndex > entryCount) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
  }

  if (version >= 1) {
    validateSampleGroupDescriptionEntries(
      audio,
      countPosition + 4,
      boxEnd,
      entryCount,
      defaultLength,
    );
  }
}

function validateSampleGroupDescriptionEntries(
  audio: Uint8Array,
  entriesStart: number,
  boxEnd: number,
  entryCount: number,
  defaultLength: number,
): void {
  if (defaultLength > 0) {
    const availableLength = boxEnd - entriesStart;
    if (
      entryCount > Math.floor(availableLength / defaultLength) ||
      entryCount * defaultLength !== availableLength
    ) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
    return;
  }

  let offset = entriesStart;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 4 > boxEnd) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
    const descriptionLength = readUint32Be(audio, offset);
    offset += 4;
    if (descriptionLength > boxEnd - offset) {
      throw new TypeError("Invalid MP4 sgpd table");
    }
    offset += descriptionLength;
  }
  if (offset !== boxEnd) {
    throw new TypeError("Invalid MP4 sgpd table");
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
