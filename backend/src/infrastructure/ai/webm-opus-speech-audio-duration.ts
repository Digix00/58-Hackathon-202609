import { readAscii } from "./audio-binary";

export const MAX_WEBM_EBML_ELEMENT_VISITS = 100_000;

export function readWebmOpusDurationSeconds(audio: Uint8Array): number {
  const budget: ParseBudget = { elementsVisited: 0 };
  const topLevel = readEbmlElement(audio, 0, audio.byteLength, budget);
  if (topLevel.id !== 0x1a45dfa3) {
    throw new TypeError("Invalid WebM header");
  }
  const docType = findEbmlChild(audio, topLevel, 0x4282, budget);
  if (
    !docType ||
    readAscii(audio, docType.dataStart, docType.dataEnd - docType.dataStart) !==
      "webm"
  ) {
    throw new TypeError("Unsupported EBML container");
  }

  const segment = readEbmlElement(
    audio,
    topLevel.dataEnd,
    audio.byteLength,
    budget,
  );
  if (segment.id !== 0x18538067) {
    throw new TypeError("Invalid WebM segment");
  }
  const segmentEnd = segment.unknownSize ? audio.byteLength : segment.dataEnd;
  let timestampScaleNs = 1_000_000;
  let audioTrackCount = 0;
  let audioTrackNumber = 0;
  let audioTrackCodec: string | null = null;

  for (const element of iterateSegmentChildren(
    audio,
    segment.dataStart,
    segmentEnd,
    budget,
  )) {
    if (element.id === 0x1549a966) {
      const scale = findEbmlChild(audio, element, 0x2ad7b1, budget);
      if (scale) {
        timestampScaleNs = readEbmlUnsigned(audio, scale);
      }
    } else if (element.id === 0x1654ae6b) {
      for (const trackEntry of iterateEbmlChildren(
        audio,
        element.dataStart,
        element.dataEnd,
        budget,
      )) {
        if (trackEntry.id !== 0xae) {
          continue;
        }
        const trackNumber = findEbmlChild(audio, trackEntry, 0xd7, budget);
        const trackType = findEbmlChild(audio, trackEntry, 0x83, budget);
        const codecId = findEbmlChild(audio, trackEntry, 0x86, budget);
        if (!trackNumber || !trackType || !codecId) {
          throw new TypeError("Incomplete WebM track metadata");
        }
        if (readEbmlUnsigned(audio, trackType) === 2) {
          const number = readEbmlUnsigned(audio, trackNumber);
          const codec = readAscii(
            audio,
            codecId.dataStart,
            codecId.dataEnd - codecId.dataStart,
          );
          if (number < 1) {
            throw new TypeError("Invalid WebM audio track number");
          }
          if (codec === "A_OPUS") {
            const opusHead = findEbmlChild(audio, trackEntry, 0x63a2, budget);
            if (
              !opusHead ||
              opusHead.dataEnd - opusHead.dataStart < 19 ||
              readAscii(audio, opusHead.dataStart, 8) !== "OpusHead" ||
              audio[opusHead.dataStart + 8]! > 15 ||
              audio[opusHead.dataStart + 9]! < 1
            ) {
              throw new TypeError("Invalid WebM Opus track configuration");
            }
          }
          audioTrackCount += 1;
          if (audioTrackCount > 1) {
            throw new TypeError("WebM must contain one Opus audio track");
          }
          audioTrackNumber = number;
          audioTrackCodec = codec;
        }
      }
    }
  }

  if (
    audioTrackCount !== 1 ||
    audioTrackCodec !== "A_OPUS" ||
    timestampScaleNs <= 0
  ) {
    throw new TypeError("WebM must contain one Opus audio track");
  }

  const secondsPerTimecode = timestampScaleNs / 1_000_000_000;
  let packetDurationSeconds = 0;
  let firstTimeSeconds = Number.POSITIVE_INFINITY;
  let lastTimeSeconds = Number.NEGATIVE_INFINITY;
  let packetCount = 0;

  const recordBlock = (element: EbmlElement, clusterTimecode: number) => {
    const block = readWebmBlock(audio, element);
    if (block.trackNumber !== audioTrackNumber) {
      return;
    }
    const blockTimecode = clusterTimecode + block.relativeTimecode;
    const blockStartSeconds = blockTimecode * secondsPerTimecode;
    let packetOffsetSeconds = 0;
    for (const packet of block.packets) {
      const packetDuration = readOpusPacketDuration(packet);
      const packetStart = blockStartSeconds + packetOffsetSeconds;
      const packetEnd = packetStart + packetDuration;
      firstTimeSeconds = Math.min(firstTimeSeconds, packetStart);
      lastTimeSeconds = Math.max(lastTimeSeconds, packetEnd);
      packetDurationSeconds += packetDuration;
      packetOffsetSeconds += packetDuration;
      packetCount += 1;
    }
  };

  for (const cluster of iterateSegmentChildren(
    audio,
    segment.dataStart,
    segmentEnd,
    budget,
  )) {
    if (cluster.id !== 0x1f43b675) {
      continue;
    }
    const clusterTimecodeElement = findEbmlChild(audio, cluster, 0xe7, budget);
    if (!clusterTimecodeElement) {
      throw new TypeError("WebM cluster has no timecode");
    }
    const clusterTimecode = readEbmlUnsigned(audio, clusterTimecodeElement);

    for (const child of iterateEbmlChildren(
      audio,
      cluster.dataStart,
      cluster.dataEnd,
      budget,
    )) {
      if (child.id === 0xa3) {
        recordBlock(child, clusterTimecode);
      } else if (child.id === 0xa0) {
        const blockElement = findEbmlChild(audio, child, 0xa1, budget);
        if (blockElement) {
          recordBlock(blockElement, clusterTimecode);
        }
      }
    }
  }

  if (packetCount === 0) {
    throw new TypeError("WebM contains no Opus audio packets");
  }

  const timestampDuration = lastTimeSeconds - firstTimeSeconds;
  return Math.max(packetDurationSeconds, timestampDuration);
}

type EbmlElement = {
  id: number;
  dataStart: number;
  dataEnd: number;
  unknownSize: boolean;
};

type ParseBudget = { elementsVisited: number };
type EbmlVint = { value: number; length: number; unknownSize: boolean };

function readEbmlElement(
  audio: Uint8Array,
  offset: number,
  limit: number,
  budget: ParseBudget,
): EbmlElement {
  budget.elementsVisited += 1;
  if (budget.elementsVisited > MAX_WEBM_EBML_ELEMENT_VISITS) {
    throw new TypeError("Too many WebM EBML elements");
  }
  const id = readEbmlVint(audio, offset, false);
  const size = readEbmlVint(audio, offset + id.length, true);
  const dataStart = offset + id.length + size.length;
  const dataEnd = size.unknownSize ? limit : dataStart + size.value;
  if (
    dataStart > limit ||
    dataEnd > limit ||
    dataEnd < dataStart ||
    (!size.unknownSize && !Number.isSafeInteger(dataEnd))
  ) {
    throw new TypeError("Invalid EBML element size");
  }
  return { id: id.value, dataStart, dataEnd, unknownSize: size.unknownSize };
}

function readEbmlVint(
  audio: Uint8Array,
  offset: number,
  isSize: boolean,
): EbmlVint {
  const first = audio[offset];
  if (first === undefined || first === 0) {
    throw new TypeError("Invalid EBML variable integer");
  }
  let marker = 0x80;
  let length = 1;
  while ((first & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > (isSize ? 8 : 4) || offset + length > audio.byteLength) {
    throw new TypeError("Invalid EBML variable integer length");
  }

  let unknownSize = isSize && (first & (marker - 1)) === marker - 1;
  for (let index = 1; index < length; index += 1) {
    if (audio[offset + index] !== 0xff) {
      unknownSize = false;
    }
  }
  if (unknownSize) {
    return { value: 0, length, unknownSize: true };
  }

  let value = isSize ? first & (marker - 1) : first;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + audio[offset + index]!;
  }
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("EBML value is too large");
  }
  return { value, length, unknownSize: false };
}

function* iterateEbmlChildren(
  audio: Uint8Array,
  start: number,
  end: number,
  budget: ParseBudget,
): Generator<EbmlElement> {
  for (let offset = start; offset < end; ) {
    const child = readEbmlElement(audio, offset, end, budget);
    if (child.unknownSize) {
      throw new TypeError("Unexpected unknown-size EBML child");
    }
    yield child;
    offset = child.dataEnd;
  }
}

function* iterateSegmentChildren(
  audio: Uint8Array,
  start: number,
  segmentEnd: number,
  budget: ParseBudget,
): Generator<EbmlElement> {
  for (let offset = start; offset < segmentEnd; ) {
    const child = readEbmlElement(audio, offset, segmentEnd, budget);
    if (child.unknownSize) {
      if (child.id !== 0x1f43b675) {
        throw new TypeError("Unexpected unknown-size WebM element");
      }
      const clusterEnd = findUnknownClusterEnd(
        audio,
        child.dataStart,
        segmentEnd,
        budget,
      );
      yield { ...child, dataEnd: clusterEnd, unknownSize: false };
      offset = clusterEnd;
    } else {
      yield child;
      offset = child.dataEnd;
    }
  }
}

function findUnknownClusterEnd(
  audio: Uint8Array,
  start: number,
  segmentEnd: number,
  budget: ParseBudget,
): number {
  const levelOneIds = new Set([
    0x114d9b74, // SeekHead
    0x1549a966, // Info
    0x1654ae6b, // Tracks
    0x1c53bb6b, // Cues
    0x1f43b675, // Cluster
    0x1941a469, // Attachments
    0x1043a770, // Chapters
    0x1254c367, // Tags
  ]);
  for (let offset = start; offset < segmentEnd; ) {
    const child = readEbmlElement(audio, offset, segmentEnd, budget);
    if (levelOneIds.has(child.id)) {
      return offset;
    }
    if (child.unknownSize) {
      throw new TypeError("Unexpected unknown-size WebM element");
    }
    offset = child.dataEnd;
  }
  return segmentEnd;
}

function findEbmlChild(
  audio: Uint8Array,
  parent: EbmlElement,
  id: number,
  budget: ParseBudget,
): EbmlElement | undefined {
  let match: EbmlElement | undefined;
  for (const child of iterateEbmlChildren(
    audio,
    parent.dataStart,
    parent.dataEnd,
    budget,
  )) {
    if (match === undefined && child.id === id) {
      match = child;
    }
  }
  return match;
}

function readEbmlUnsigned(audio: Uint8Array, element: EbmlElement): number {
  const length = element.dataEnd - element.dataStart;
  if (length < 1 || length > 8) {
    throw new TypeError("Invalid EBML integer");
  }
  let value = 0;
  for (let offset = element.dataStart; offset < element.dataEnd; offset += 1) {
    value = value * 256 + audio[offset]!;
  }
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("EBML integer is too large");
  }
  return value;
}

function readWebmBlock(
  audio: Uint8Array,
  element: EbmlElement,
): { trackNumber: number; relativeTimecode: number; packets: Uint8Array[] } {
  const track = readEbmlVint(audio, element.dataStart, true);
  const headerOffset = element.dataStart + track.length;
  if (headerOffset + 3 > element.dataEnd) {
    throw new TypeError("Truncated WebM block header");
  }
  let relativeTimecode = (audio[headerOffset]! << 8) | audio[headerOffset + 1]!;
  if ((relativeTimecode & 0x8000) !== 0) {
    relativeTimecode -= 0x1_0000;
  }
  const flags = audio[headerOffset + 2]!;
  const packetStart = headerOffset + 3;
  const lacing = (flags >> 1) & 0x03;
  const packets = readWebmLacedPackets(
    audio,
    packetStart,
    element.dataEnd,
    lacing,
  );
  return { trackNumber: track.value, relativeTimecode, packets };
}

function readWebmLacedPackets(
  audio: Uint8Array,
  start: number,
  end: number,
  lacing: number,
): Uint8Array[] {
  if (lacing === 0) {
    if (end <= start) {
      throw new TypeError("WebM audio block has an empty packet");
    }
    return [audio.subarray(start, end)];
  }
  if (start >= end) {
    throw new TypeError("Truncated WebM lacing data");
  }

  const frameCount = audio[start]! + 1;
  if (frameCount < 2 || frameCount > 256) {
    throw new TypeError("Invalid WebM lacing frame count");
  }
  let offset = start + 1;
  const sizes: number[] = [];

  if (lacing === 1) {
    for (let frame = 0; frame < frameCount - 1; frame += 1) {
      let size = 0;
      let byte: number;
      do {
        if (offset >= end) {
          throw new TypeError("Truncated Xiph lacing data");
        }
        byte = audio[offset++]!;
        size += byte;
      } while (byte === 255);
      sizes.push(size);
    }
  } else if (lacing === 2) {
    const dataLength = end - offset;
    if (dataLength % frameCount !== 0) {
      throw new TypeError("Invalid fixed-size lacing data");
    }
    return Array.from({ length: frameCount }, (_, frame) => {
      const packetSize = dataLength / frameCount;
      return audio.subarray(
        offset + frame * packetSize,
        offset + (frame + 1) * packetSize,
      );
    });
  } else {
    const firstSize = readEbmlVint(audio, offset, true);
    if (firstSize.unknownSize) {
      throw new TypeError("Invalid EBML lacing size");
    }
    offset += firstSize.length;
    sizes.push(firstSize.value);
    for (let frame = 1; frame < frameCount - 1; frame += 1) {
      const encodedDelta = readEbmlVint(audio, offset, true);
      if (encodedDelta.unknownSize) {
        throw new TypeError("Invalid EBML lacing delta");
      }
      offset += encodedDelta.length;
      const bias = 2 ** (7 * encodedDelta.length - 1) - 1;
      sizes.push(sizes[frame - 1]! + encodedDelta.value - bias);
    }
  }

  const payloadLength = end - offset;
  const lastSize = payloadLength - sizes.reduce((sum, size) => sum + size, 0);
  sizes.push(lastSize);
  if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1)) {
    throw new TypeError("Invalid WebM lacing frame size");
  }
  if (sizes.reduce((sum, size) => sum + size, 0) !== payloadLength) {
    throw new TypeError("WebM lacing does not cover the block payload");
  }

  const packets: Uint8Array[] = [];
  let packetOffset = offset;
  for (const size of sizes) {
    packets.push(audio.subarray(packetOffset, packetOffset + size));
    packetOffset += size;
  }
  return packets;
}

function readOpusPacketDuration(packet: Uint8Array): number {
  if (packet.byteLength < 1) {
    throw new TypeError("Truncated Opus packet");
  }
  const toc = packet[0]!;
  const config = toc >> 3;
  const frameCode = toc & 0x03;
  if (packet.byteLength < 2 && frameCode >= 2) {
    throw new TypeError("Truncated Opus packet");
  }
  const frameCount =
    frameCode === 0 ? 1 : frameCode < 3 ? 2 : packet[1]! & 0x3f;
  if (frameCount < 1 || frameCount > 48) {
    throw new TypeError("Invalid Opus frame count");
  }

  const frameDurationMs =
    config < 12
      ? [10, 20, 40, 60][config & 0x03]!
      : config < 16
        ? (config & 1) === 0
          ? 10
          : 20
        : [2.5, 5, 10, 20][config & 0x03]!;
  const durationSeconds = (frameCount * frameDurationMs) / 1_000;
  if (durationSeconds > 0.12) {
    throw new TypeError("Opus packet duration exceeds 120 ms");
  }
  return durationSeconds;
}
