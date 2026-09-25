const WAV_SAMPLE_RATE = 8_000;
const WAV_CHANNELS = 1;
const WAV_BITS_PER_SAMPLE = 16;

export function createWavAudio(durationSeconds: number): Uint8Array {
  const bytesPerSample = WAV_BITS_PER_SAMPLE / 8;
  const blockAlign = WAV_CHANNELS * bytesPerSample;
  const byteRate = WAV_SAMPLE_RATE * blockAlign;
  const dataLength = Math.round(durationSeconds * byteRate);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, WAV_CHANNELS, true);
  view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, WAV_BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);
  return new Uint8Array(buffer);
}

export function createMp3Audio(durationSeconds: number): Uint8Array {
  const frameLength = 417;
  const samplesPerFrame = 1_152;
  const sampleRate = 44_100;
  const frameCount = Math.ceil(
    (durationSeconds * sampleRate) / samplesPerFrame,
  );
  const audio = new Uint8Array(frameCount * frameLength);
  const frameHeader = Uint8Array.of(0xff, 0xfb, 0x90, 0x64);

  for (let frame = 0; frame < frameCount; frame += 1) {
    audio.set(frameHeader, frame * frameLength);
  }

  return audio;
}

export function createWebmAudio(durationSeconds: number): Uint8Array {
  const ebmlHead = ebmlElement(
    [0x1a, 0x45, 0xdf, 0xa3],
    concat(
      ebmlUint([0x42, 0x86], 1),
      ebmlUint([0x42, 0xf7], 1),
      ebmlUint([0x42, 0xf2], 4),
      ebmlUint([0x42, 0xf3], 8),
      ebmlElement([0x42, 0x82], ascii("webm")),
      ebmlUint([0x42, 0x85], 2),
    ),
  );
  const info = ebmlElement(
    [0x15, 0x49, 0xa9, 0x66],
    concat(
      ebmlUint([0x2a, 0xd7, 0xb1], 1_000_000),
      ebmlElement([0x44, 0x89], float64BigEndian(durationSeconds * 1_000)),
    ),
  );
  const audioTrack = ebmlElement(
    [0xae],
    concat(
      ebmlUint([0xd7], 1),
      ebmlUint([0x73, 0xc5], 1),
      ebmlUint([0x83], 2),
      ebmlElement([0x86], ascii("A_OPUS")),
      ebmlElement(
        [0xe1],
        concat(
          ebmlElement([0xb5], float64BigEndian(48_000)),
          ebmlUint([0x9f], 1),
        ),
      ),
    ),
  );
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], audioTrack);
  const segment = concat(
    Uint8Array.of(0x18, 0x53, 0x80, 0x67),
    Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff),
    info,
    tracks,
  );

  return concat(ebmlHead, segment);
}

export function createMp4Audio(durationSeconds: number): Uint8Array {
  const movieTimescale = 1_000;
  const audioTimescale = 48_000;
  const movieDuration = Math.round(durationSeconds * movieTimescale);
  const audioDuration = Math.round(durationSeconds * audioTimescale);
  const movieHeader = concat(
    new Uint8Array(4),
    u32be(0),
    u32be(0),
    u32be(movieTimescale),
    u32be(movieDuration),
    u32be(0x0001_0000),
    u16be(0x0100),
    u16be(0),
    new Uint8Array(8),
    new Uint8Array(36),
    new Uint8Array(24),
    u32be(2),
  );
  const trackHeader = concat(
    Uint8Array.of(0, 0, 0, 7),
    u32be(0),
    u32be(0),
    u32be(1),
    u32be(0),
    u32be(movieDuration),
    new Uint8Array(8),
    u16be(0),
    u16be(0),
    u16be(0x0100),
    u16be(0),
    new Uint8Array(36),
    u32be(0),
    u32be(0),
  );
  const mediaHeader = concat(
    new Uint8Array(4),
    u32be(0),
    u32be(0),
    u32be(audioTimescale),
    u32be(audioDuration),
    u16be(0),
    u16be(0),
  );
  const handler = concat(
    new Uint8Array(4),
    u32be(0),
    ascii("soun"),
    new Uint8Array(12),
    Uint8Array.of(0),
  );
  const audioSampleEntry = atom(
    "mp4a",
    concat(
      new Uint8Array(6),
      u16be(1),
      u16be(0),
      u16be(0),
      u32be(0),
      u16be(1),
      u16be(16),
      u16be(0),
      u16be(0),
      u32be(audioTimescale * 0x1_0000),
    ),
  );
  const sampleDescription = atom(
    "stsd",
    concat(new Uint8Array(4), u32be(1), audioSampleEntry),
  );
  const sampleSizes = atom(
    "stsz",
    concat(new Uint8Array(4), u32be(0), u32be(0)),
  );
  const sampleTable = atom("stbl", concat(sampleDescription, sampleSizes));
  const mediaInformation = atom("minf", sampleTable);
  const media = atom(
    "mdia",
    concat(atom("mdhd", mediaHeader), atom("hdlr", handler), mediaInformation),
  );
  const track = atom("trak", concat(atom("tkhd", trackHeader), media));
  const fileType = atom(
    "ftyp",
    concat(ascii("M4A "), u32be(0), ascii("M4A isom")),
  );
  const movie = atom("moov", concat(atom("mvhd", movieHeader), track));

  return concat(fileType, movie);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function u16be(value: number): Uint8Array {
  return Uint8Array.of(value >>> 8, value);
}

function u32be(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

function atom(type: string, body: Uint8Array): Uint8Array {
  return concat(u32be(body.length + 8), ascii(type), body);
}

function ebmlElement(id: number[], body: Uint8Array): Uint8Array {
  return concat(Uint8Array.from(id), ebmlSize(body.length), body);
}

function ebmlUint(id: number[], value: number): Uint8Array {
  let byteLength = 1;
  while (value >= 256 ** byteLength) {
    byteLength += 1;
  }

  const body = new Uint8Array(byteLength);
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    body[index] = value & 0xff;
    value = Math.floor(value / 256);
  }
  return ebmlElement(id, body);
}

function ebmlSize(size: number): Uint8Array {
  if (size < 127) {
    return Uint8Array.of(0x80 | size);
  }
  if (size < 16_383) {
    return Uint8Array.of(0x40 | (size >>> 8), size);
  }
  throw new RangeError("EBML test element is too large");
}

function float64BigEndian(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return bytes;
}
