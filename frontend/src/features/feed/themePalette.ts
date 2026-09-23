/**
 * 紙の色。
 *
 * 絵本は見開きごとに地色が変わる。フィードも1枚めくるたびに
 * 上辺の付箋と紙の地色を替え、「同じページを見ている」感覚を断つ。
 * 色はテーマではなくページに従う。テーマから引くと隣り合う2枚が
 * 同じ色になることがあり、めくっても景色が変わらなくなるため。
 *
 * 付箋の3色は、そのページの色の近い色どうしで組む。
 * 固定色にすると、ページの色によっては同じ色が2枚並んでしまう。
 */
export type PagePalette = {
  /** テーマのしおり。3枚のうち一番濃く、上辺の主役にする。 */
  bookmark: string
  /** 年代の付箋。 */
  tagAge: string
  /** 地域の付箋。 */
  tagRegion: string
  /**
   * 紙の地色。まわりが生成りなので、青や桃に振らず暖色寄りのまま濃度だけ変える。
   * 冷たい白を混ぜると紙ではなく画面に見える。
   */
  tint: string
}

const palettes: readonly PagePalette[] = [
  { bookmark: '#f8d9b0', tagAge: '#f5cdc4', tagRegion: '#e9e0bd', tint: '#fffcf1' },
  { bookmark: '#cbe3b8', tagAge: '#dfe9c0', tagRegion: '#c2e0dc', tint: '#fcfdf4' },
  { bookmark: '#c9d6ef', tagAge: '#d6cfe9', tagRegion: '#c8e0e6', tint: '#fbfcf8' },
  { bookmark: '#f3cad5', tagAge: '#eed2e6', tagRegion: '#f6dcc4', tint: '#fffbf6' },
  { bookmark: '#f0e199', tagAge: '#dfe7ae', tagRegion: '#f3d9b5', tint: '#fffdec' },
]

/** page は1始まりのページ番号。 */
export function paletteForPage(page: number): PagePalette {
  const index = (((page - 1) % palettes.length) + palettes.length) % palettes.length
  return palettes[index]
}
