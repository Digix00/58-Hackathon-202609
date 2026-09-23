/**
 * テーマごとの紙の色。
 *
 * 絵本は見開きごとに地色が変わる。フィードも1件めくるたびに
 * テープ・しおり・紙の地色を替え、「同じページを見ている」感覚を断つ。
 * テーマ名はAIが生成するため固定表では引けない。名前から決まる番号で選び、
 * 同じテーマにはいつも同じ色が付くようにする。
 */
export type ThemePalette = {
  /** 紙を留めるテープ。半透明で重ねる。 */
  tape: string
  /** テーマのしおり。 */
  bookmark: string
  /** 紙の地色。彩度は2〜3%まで。これ以上は紙に見えなくなる。 */
  tint: string
}

const palettes: readonly ThemePalette[] = [
  { tape: '#f2ba9ccc', bookmark: '#f8d9b0', tint: '#fffcf3' },
  { tape: '#b9ded2cc', bookmark: '#cbe3b8', tint: '#fbfdf7' },
  { tape: '#b9cbe4cc', bookmark: '#c9d6ef', tint: '#fbfcff' },
  { tape: '#e8bcd2cc', bookmark: '#f3cad5', tint: '#fffbfc' },
  { tape: '#ddd0a5cc', bookmark: '#f0e199', tint: '#fffdef' },
]

export function paletteFor(theme: string): ThemePalette {
  let hash = 0
  for (const character of theme) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 1_000_003
  return palettes[hash % palettes.length]
}
