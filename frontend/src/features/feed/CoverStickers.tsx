import type { CSSProperties } from 'react'
import styles from './CoverStickers.module.css'

/**
 * 本の下に敷いたシール。
 *
 * 表紙の絵（CoverArt）が「何の本か」を紙の上で伝えるのに対して、こちらは紙の外側。
 * 持ち主が本のまわりに好きな絵を貼った跡として置く。紙の中に入れないのは、
 * 題字と一言より先に絵を見てしまうため。表紙をめくると、シールは本から
 * 弾かれるように外へ散っていく。開く瞬間を読みはじめの合図にする。
 *
 * 形は CoverArt と同じ作法で描く。素直な線で置き、揺らぎは #crayon-edge-art に任せ、
 * 塗りは輪郭からわずかにずらす。同じ手が描いた絵にそろえるため、
 * どのシールも輪郭の太さと塗りのずらし幅を変えない。
 */

/** 塗りは輪郭から少しずらす。線の内側に収めると、印刷したシールに見える。 */
const FILL_SHIFT = 'translate(1.1 -1.1)'

type StickerArt = {
  /** 塗りと、その塗りの上から引く輪郭。色は1枚につき1組だけにする。 */
  fill?: string
  line: string
  /** 塗る形。輪郭だけのシール（にじ・ぐるぐる）は持たない。 */
  body?: string
  /** 輪郭として引く線。塗る形と同じ d を重ねることが多い。 */
  strokes: readonly { d: string; color?: string }[]
}

/** ほし。5つの角の長さをそろえないのは、定規で割った形にしないため。 */
const STAR =
  'M16 2.8 20.4 11.4 29.6 12.8 22.9 19.5 24.6 28.8 16 24.3 7.3 28.5 9.1 19.3 2.5 12.7 11.7 11.6Z'

/** ハート。ふくらみの高さを左右で変えて、一筆で描いた形にする。 */
const HEART =
  'M16 28C14.7 27 4.4 20.2 3.5 12.6 2.9 7.8 6 4 10 3.9c2.8-.1 5 1.7 6.1 4.3 1-2.7 3.3-4.6 6.2-4.4 4 .3 6.9 4.2 6.1 8.9C27.2 20.1 17.3 27 16 28Z'

/** きらり。細い4つの角で、星とは別の光り方にする。 */
const SPARKLE =
  'M16 1.8c1.3 6.9 3.8 10.5 11.1 12.1-7.3 1.7-9.8 5.3-11.1 12.2-1.3-6.9-3.8-10.5-11.1-12.2C12.2 12.3 14.7 8.7 16 1.8Z'

/** みかづき。内側の弧を外側と同じ中心で描くと、紙を切り抜いた形になる。 */
const MOON =
  'M23.4 4.2c-5.8.3-10.4 5.1-10.4 11 0 5.9 4.6 10.7 10.4 11-2.1 1.5-4.7 2.4-7.5 2.4-7.1 0-12.9-5.9-12.9-13.4S8.8 1.8 15.9 1.8c2.8 0 5.4.9 7.5 2.4Z'

const ROCKET = {
  body: 'M16 2c4.7 3.8 7.2 9.2 7.2 15 0 2.9-.6 5.4-1.6 7.4H10.4c-1-2-1.6-4.5-1.6-7.4C8.8 11.2 11.3 5.8 16 2Z',
  window: 'M16 11.9c2 0 3.6 1.7 3.6 3.7s-1.6 3.7-3.6 3.7-3.6-1.7-3.6-3.7 1.6-3.7 3.6-3.7Z',
  fins: [
    'M10.6 16.8c-2.8 1.7-4.5 4.6-4.8 8.1l4.8-1.8Z',
    'M21.4 16.8c2.8 1.7 4.5 4.6 4.8 8.1l-4.8-1.8Z',
  ],
  flame: 'M13.2 25.6c.7 2.4 1.6 4.2 2.8 5.8 1.2-1.6 2.1-3.4 2.8-5.8Z',
}

/** にじ。3本の弧を同じ手で引き、色だけ変える。 */
const RAINBOW = [
  { d: 'M3.4 26.4C3.4 19.4 9 13.8 16 13.8s12.6 5.6 12.6 12.6', color: '#e8909f' },
  { d: 'M8.6 26.4c0-4.1 3.3-7.4 7.4-7.4s7.4 3.3 7.4 7.4', color: '#f0bd57' },
  { d: 'M13.5 26.4c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5', color: '#8fb9d8' },
]

/** ぐるぐる。中から外へ2巻き半。巻きが少ないと、渦ではなく数字に見える。 */
const SWIRL =
  'M16.8 14.9c-1.3-.3-2.5 1-2.1 2.4.4 1.7 2.7 2.3 4.1 1.2 2-1.5 1.8-4.6-.3-6-2.9-1.9-6.8-.4-8.1 2.8-1.5 3.9 1.1 8.4 5.3 9.5 5 1.3 10.1-2.3 11.1-7.4'

/** おはな。花びらは5枚。中の丸は塗り分けず、輪郭だけで芯を示す。 */
const FLOWER = {
  petals:
    'M16 2.6c2.9 0 5.2 2.3 5.2 5.2 0 1-.3 2-.8 2.8 2.4-1.7 5.8-1.2 7.5 1.2s1.2 5.8-1.2 7.5c-.8.6-1.8.9-2.7 1 .9.3 1.8.8 2.5 1.6 1.9 2.2 1.7 5.5-.5 7.4s-5.5 1.7-7.4-.5c-.7-.8-1.1-1.7-1.3-2.6-.2.9-.6 1.8-1.3 2.6-1.9 2.2-5.2 2.4-7.4.5s-2.4-5.2-.5-7.4c.7-.8 1.6-1.3 2.5-1.6-.9-.1-1.9-.4-2.7-1-2.4-1.7-2.9-5.1-1.2-7.5s5.1-2.9 7.5-1.2c-.5-.8-.8-1.8-.8-2.8 0-2.9 2.3-5.2 5.2-5.2Z',
  center: 'M16 12.8c1.8 0 3.2 1.4 3.2 3.2s-1.4 3.2-3.2 3.2-3.2-1.4-3.2-3.2 1.4-3.2 3.2-3.2Z',
}

const STICKER_ART = {
  star: { fill: '#f8d878', line: '#e0a72f', body: STAR, strokes: [{ d: STAR }] },
  starSmall: { fill: '#bcaee2', line: '#8d7cc4', body: STAR, strokes: [{ d: STAR }] },
  heart: { fill: '#f5a8bd', line: '#d9738f', body: HEART, strokes: [{ d: HEART }] },
  sparkle: { fill: '#ffeaa7', line: '#dda630', body: SPARKLE, strokes: [{ d: SPARKLE }] },
  moon: { fill: '#f6e7b4', line: '#d9ab3f', body: MOON, strokes: [{ d: MOON }] },
  rocket: {
    fill: '#dbe8f2',
    line: '#7e9cb6',
    body: ROCKET.body,
    strokes: [{ d: ROCKET.body }, { d: ROCKET.window }, ...ROCKET.fins.map((d) => ({ d }))],
  },
  rainbow: { line: '#e8909f', strokes: RAINBOW },
  swirl: { line: '#79a95f', strokes: [{ d: SWIRL }] },
  // 小さい1枚は、大きい1枚と色を変えて置く。同じ絵が2つ並ぶと、印刷したシートに見える。
  heartSmall: { fill: '#cdbdf0', line: '#8d7cc4', body: HEART, strokes: [{ d: HEART }] },
  sparkleSmall: { fill: '#f7c9d8', line: '#d9738f', body: SPARKLE, strokes: [{ d: SPARKLE }] },
  starMint: { fill: '#c3e2c8', line: '#6fae87', body: STAR, strokes: [{ d: STAR }] },
  flower: {
    fill: '#f7c9d8',
    line: '#d9738f',
    body: FLOWER.petals,
    strokes: [{ d: FLOWER.petals }, { d: FLOWER.center }],
  },
} satisfies Record<string, StickerArt>

type StickerName = keyof typeof STICKER_ART

type Sticker = {
  art: StickerName
  /** 貼った場所。紙に対する割合で置く。0%より手前と100%より先も指せる。 */
  at: readonly [x: number, y: number]
  /** 大きさと、貼った角度。角度をそろえると、機械で貼った列に見える。 */
  size: number
  tilt: number
  /** めくるときに飛んでいく向きと、回りながら離れる量。本の外へ向ける。 */
  fly: readonly [x: number, y: number]
  spin: number
  /** 散りはじめる順。一斉に動かすと、はじけ方が板を割ったように見える。 */
  step: number
}

/**
 * 本の下に敷く12枚。
 *
 * 種類・大きさ・角度を隣どうしで変え、同じものが並ばないようにする。
 *
 * 場所は紙そのものに対する割合で指す。紙の外へ貼る1枚は0%より手前と100%より先を使う。
 * 紙束の中に敷いてあるので、表紙が開いて本が広がるとき、シールも一緒に大きくなる。
 * 紙だけが大きくなると、シールは貼った場所に取り残されて背景の模様に見える。
 *
 * 紙に隠れる側は隠れたままでよい。大きい1枚ほど深く潜らせ、はみ出した側だけを見せる。
 * 全部が見える大きさに切りそろえると、本の下に貼った紙ではなく、背景の模様に見える。
 *
 * 左右に貼る1枚は、画面の端まで届かせてよい。切れ目が画面のふちと重なるぶんには、
 * 紙をはみ出して貼ったシールに見える。本文の余白の途中で切ると、断ち落としに見える。
 *
 * 飛ぶ向きは、貼った場所から本の外へまっすぐ抜ける向きにそろえる。
 * 本へ向かって飛ぶ1枚があると、開いた勢いではなく風に見える。
 * 散る順は、逃げ場のせまい左右の1枚から先にする。表紙は散ると同時に広がるので、
 * ふちすれすれの1枚を後回しにすると、飛ぶ前に広がった紙の下へ入ってしまう。
 */
const STICKERS: readonly Sticker[] = [
  { art: 'rocket', at: [1, -13], size: 6.55, tilt: -16, fly: [-8, -6.9], spin: -34, step: 2 },
  { art: 'heartSmall', at: [19, -14.5], size: 3.6, tilt: 9, fly: [2.6, -8.3], spin: 20, step: 4 },
  { art: 'sparkle', at: [40, -15.5], size: 3.8, tilt: -7, fly: [-1.5, -8.8], spin: 22, step: 4 },
  { art: 'star', at: [106, -8.5], size: 6.55, tilt: 11, fly: [8, -6.9], spin: 38, step: 2 },
  { art: 'heart', at: [112, 21.5], size: 4.75, tilt: 13, fly: [9.2, -0.7], spin: 26, step: 0 },
  { art: 'starMint', at: [113, 59.5], size: 4.05, tilt: -9, fly: [9.2, 2.3], spin: 22, step: 1 },
  { art: 'rainbow', at: [109.5, 100], size: 6.2, tilt: 7, fly: [8, 6.4], spin: 30, step: 3 },
  { art: 'flower', at: [95, 122.5], size: 5, tilt: 12, fly: [5.5, 6.9], spin: 28, step: 6 },
  {
    art: 'starSmall',
    at: [8.5, 121.5],
    size: 4.75,
    tilt: -13,
    fly: [-3.3, 8.3],
    spin: -24,
    step: 5,
  },
  { art: 'swirl', at: [-6, 108.5], size: 5.5, tilt: 8, fly: [-8, 6.9], spin: -30, step: 3 },
  { art: 'sparkleSmall', at: [-10, 74], size: 4.05, tilt: 6, fly: [-9.2, 1.9], spin: -18, step: 1 },
  { art: 'moon', at: [-8.5, 21.5], size: 5, tilt: -12, fly: [-9.2, -1.2], spin: -26, step: 0 },
]

/**
 * 散りはじめの1枚ぶんの遅れ。
 * 表紙は散ると同時に大きく広がるので、遅らせすぎると広がった紙に飲まれる。
 */
const STEP_MS = 28

/** 光るのは、きらりとほし。ただ揺れるだけの絵と、動きで描き分ける。 */
const TWINKLING: readonly StickerName[] = [
  'sparkle',
  'sparkleSmall',
  'star',
  'starSmall',
  'starMint',
]

/**
 * 揺れ方。
 *
 * 振れ幅・周期・位相を1枚ずつ変える。同じ値で揺らすと、貼った絵が一斉に同じ間で
 * 動く列になり、貼られたシールではなく、風で揺れる一枚の貼り紙に見える。
 *
 * 振れ幅は大きさで割る。同じ距離・同じ角度で振ると、大きい1枚ほど動く量が増えて、
 * 本の下で暴れて見える。位相と周期は並び順から作る。表に手で書き足すと、
 * 1枚増やすたびに全部を並べ直すことになる。
 */
function swayStyle(order: number, size: number) {
  return {
    '--bob': `${(0.9 / size).toFixed(2)}em`,
    '--drift': `${((order % 2 ? -0.55 : 0.55) / size).toFixed(2)}em`,
    '--swing': `${(9 / size).toFixed(1)}deg`,
    '--beat': `${(3.6 + ((order * 7) % 5) * 0.6).toFixed(1)}s`,
    /** 位相は負にして、貼られた時点で揺れの途中から始める。 */
    '--phase': `${-order * 730}ms`,
    /** 貼られて現れる順。散る順とは別にして、12枚が揃って出ないようにする。 */
    '--in-delay': `${order * 45}ms`,
  }
}

function StickerShape({ art }: { art: StickerName }) {
  const { fill, line, body, strokes } = STICKER_ART[art] as StickerArt

  return (
    <svg className={styles.art} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g filter="url(#crayon-edge-art)">
        {body ? (
          <path className={styles.fill} d={body} style={{ fill }} transform={FILL_SHIFT} />
        ) : null}
        {/* ロケットの火だけは本体と別の色で塗る。1色で塗ると煙に見える。 */}
        {art === 'rocket' ? (
          <>
            <path
              className={styles.fill}
              d={ROCKET.flame}
              style={{ fill: '#f6b45e' }}
              transform={FILL_SHIFT}
            />
            <path className={styles.line} d={ROCKET.flame} style={{ stroke: '#e08b33' }} />
          </>
        ) : null}
        {strokes.map(({ d, color }) => (
          <path key={d} className={styles.line} d={d} style={{ stroke: color ?? line }} />
        ))}
      </g>
    </svg>
  )
}

function StickerPin({ sticker, order }: { sticker: Sticker; order: number }) {
  const { art, at, size, tilt, fly, spin, step } = sticker

  return (
    <span
      className={styles.sticker}
      style={
        {
          '--x': `${at[0]}%`,
          '--y': `${at[1]}%`,
          '--size': `${size}em`,
          '--tilt': `${tilt}deg`,
          '--fly-x': `${fly[0]}em`,
          '--fly-y': `${fly[1]}em`,
          '--spin': `${spin}deg`,
          '--delay': `${step * STEP_MS}ms`,
          ...swayStyle(order, size),
        } as CSSProperties
      }
    >
      {/*
       * 貼った場所・散る動き・待っている間の揺れを、別々の層で持つ。
       * ひとつの要素に重ねると、あとから流れる動きが前の位置を打ち消す。
       */}
      <span className={`${styles.float} ${TWINKLING.includes(art) ? styles.twinkles : ''}`}>
        <StickerShape art={art} />
      </span>
    </span>
  )
}

/**
 * Intent: 本の下にシールを敷き、表紙が開くときに外へ散らす。
 * Boundary: 表紙が開きはじめたかどうかだけを受け取る。押せず、読み上げにも出さない。
 * Composition: FeedPageの紙より先に置き、紙の下へ潜らせる。
 */
export function CoverStickers({ scattering }: { scattering: boolean }) {
  return (
    <span className={`${styles.layer} ${scattering ? styles.scattering : ''}`} aria-hidden="true">
      {STICKERS.map((sticker, index) => (
        <StickerPin key={`${sticker.at[0]}-${sticker.at[1]}`} sticker={sticker} order={index} />
      ))}
    </span>
  )
}
