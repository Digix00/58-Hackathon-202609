import * as MP4Box from "mp4box";

const MAX_AUDIO_DURATION_SECONDS = 60;
const MIN_AAC_SAMPLES_PER_ACCESS_UNIT = 960;
const MAX_AAC_SAMPLE_RATE = 96_000;

export function readMp4DurationSeconds(audio: Uint8Array): Promise<number> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile();
    let ready = false;
    let sampleCount = 0;
    let firstPresentationTime = Number.POSITIVE_INFINITY;
    let lastPresentationTime = Number.NEGATIVE_INFINITY;
    let samplesPerAccessUnit: number | undefined;
    let sampleRate: number | undefined;
    let maximumSampleCount = 0;
    let fragmented = false;
    let settled = false;

    const fail = (message: string) => {
      if (!settled) {
        settled = true;
        reject(new TypeError(message));
      }
    };

    file.onError = () => fail("Invalid MP4 audio");
    file.onReady = (info) => {
      ready = true;
      if (info.audioTracks.length !== 1) {
        fail("MP4 must contain exactly one audio track");
        return;
      }

      const audioTrack = info.audioTracks[0]!;
      fragmented = info.isFragmented;
      if (audioTrack.codec !== "mp4a.40.2" || !audioTrack.audio) {
        fail("MP4 must use AAC-LC audio");
        return;
      }
      sampleRate = audioTrack.audio.sample_rate;
      if (
        !Number.isFinite(sampleRate) ||
        sampleRate <= 0 ||
        sampleRate > MAX_AAC_SAMPLE_RATE
      ) {
        fail("MP4 audio sample rate is invalid");
        return;
      }
      maximumSampleCount = Math.ceil(
        (MAX_AUDIO_DURATION_SECONDS * sampleRate) /
          MIN_AAC_SAMPLES_PER_ACCESS_UNIT,
      );
      if (
        !fragmented &&
        (!Number.isSafeInteger(audioTrack.nb_samples) ||
          audioTrack.nb_samples < 1 ||
          audioTrack.nb_samples > maximumSampleCount)
      ) {
        fail("MP4 audio sample count exceeds the supported duration");
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
            fail("MP4 audio sample is incomplete");
            return;
          }

          if (samplesPerAccessUnit === undefined) {
            const aacConfig = readAacConfig(sample.description);
            if (aacConfig.sampleRate !== sampleRate) {
              fail("MP4 AAC sample rate does not match its decoder config");
              return;
            }
            samplesPerAccessUnit = aacConfig.samplesPerAccessUnit;
          }
          const startSeconds = sample.dts / sample.timescale;
          const endSeconds =
            (sample.dts + Math.max(0, sample.duration)) / sample.timescale;
          if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
            fail("MP4 audio sample timing is invalid");
            return;
          }
          firstPresentationTime = Math.min(firstPresentationTime, startSeconds);
          lastPresentationTime = Math.max(lastPresentationTime, endSeconds);
          sampleCount += 1;
          if (sampleCount > maximumSampleCount) {
            fail("MP4 audio sample count exceeds the supported duration");
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
      fail("Invalid MP4 audio");
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
      fail("MP4 contains no complete audio samples");
      return;
    }

    if (samplesPerAccessUnit === undefined || sampleRate === undefined) {
      fail("MP4 AAC configuration is unavailable");
      return;
    }
    const sampleCountDuration =
      (sampleCount * samplesPerAccessUnit) / sampleRate;
    const timelineDuration = lastPresentationTime - firstPresentationTime;
    const duration = Math.max(sampleCountDuration, timelineDuration);
    if (!Number.isFinite(duration) || duration <= 0) {
      fail("MP4 audio duration is invalid");
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
