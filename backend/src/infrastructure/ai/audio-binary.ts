export function readAscii(
  audio: Uint8Array,
  offset: number,
  length: number,
): string {
  if (offset < 0 || length < 0 || offset + length > audio.byteLength) {
    return "";
  }
  let value = "";
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(audio[index]!);
  }
  return value;
}

export function readUint32Le(audio: Uint8Array, offset: number): number {
  return new DataView(audio.buffer, audio.byteOffset + offset, 4).getUint32(
    0,
    true,
  );
}
