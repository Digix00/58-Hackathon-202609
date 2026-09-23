/**
 * 紙の色。
 *
 * 絵本は見開きごとに地色が変わる。フィードも1枚めくるたびに
 * しおりと紙の地色を替え、「同じページを見ている」感覚を断つ。
 * 色はテーマではなくページに従う。テーマから引くと隣り合う2枚が
 * 同じ色になることがあり、めくっても景色が変わらなくなるため。
 */
export type PagePalette = {
  /** テーマのしおり。 */
  bookmark: string
  /**
   * 紙の地色。まわりが生成りなので、青や桃に振らず暖色寄りのまま濃度だけ変える。
   * 冷たい白を混ぜると紙ではなく画面に見える。
   */
  tint: string
}

const palettes: readonly PagePalette[] = [
  { bookmark: '#f8d9b0', tint: '#fffcf1' },
  { bookmark: '#cbe3b8', tint: '#fcfdf4' },
  { bookmark: '#c9d6ef', tint: '#fbfcf8' },
  { bookmark: '#f3cad5', tint: '#fffbf6' },
  { bookmark: '#f0e199', tint: '#fffdec' },
]

/** page は1始まりのページ番号。 */
export function paletteForPage(page: number): PagePalette {
  const index = (((page - 1) % palettes.length) + palettes.length) % palettes.length
  return palettes[index]
}
