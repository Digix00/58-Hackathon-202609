import type { CSSProperties } from 'react'
import styles from './CoverStickers.module.css'

/**
 * 表紙のまわりに置いた文房具。
 *
 * 表紙の絵（CoverArt）が「これから書く本」を紙の上で伝えるのに対して、こちらは紙の外側。
 * 机の上に出したままの道具として置く。フィードの表紙にも紙の外の飾りはあるが、
 * あちらは読む本なので、ほし・ハート・ロケットのシールを外へ散らす。こちらは書く本なので、
 * 貼ったシールではなく書く道具を並べ、表紙を開くと道具がノートの中へ入っていく。
 * 同じ絵を同じ動きで置くと、2冊が同じ表紙の使い回しに見える。
 *
 * 形は素直な線で置き、揺らぎは #crayon-edge-art に任せ、塗りは輪郭からわずかにずらす。
 * ここは CoverArt と同じ作法にそろえる。線の太さと塗りのずらし幅は、
 * どの道具でも変えない。同じ手が描いた絵に見せるため。
 */

/** 塗りは輪郭から少しずらす。線の内側に収めると、印刷したシールに見える。 */
const FILL_SHIFT = 'translate(1.1 -1.1)'

/** 絵の部品。塗る部品は fill を持ち、線だけの部品は持たない。 */
type StickerPart = {
  d: string
  fill?: string
  /** その部品だけ別の色で引くとき。省いたら絵の輪郭色で引く。 */
  line?: string
}

type StickerArt = {
  /** 輪郭の色。部品が色を持たないときはこれで引く。 */
  line: string
  parts: readonly StickerPart[]
}

/**
 * えんぴつ。木の部分・芯・尻のゴムを別の色で塗る。1色で塗ると棒に見える。
 * 軸は表紙のクレヨンより細くする。同じ太さだと、紙の上の絵が机へ出てきたように見える。
 */
const PENCIL = {
  wood: 'M16 2.6 20.4 12.2 11.6 12.4Z',
  lead: 'M16 2.6 17.9 6.4 14.1 6.5Z',
  body: 'M11.6 12.4 20.4 12.2c.8 5 .9 10 .4 15l-9.5.3c-.5-5.1-.4-10.2.3-15.1Z',
  band: 'M11.7 16.4 20.3 16.2',
  rubber: 'M11.3 27.2 20.8 27c.3 1.4.3 2.8.2 4.2l-10 .3c-.3-1.5-.3-3-.2-4.3Z',
}

/** けしゴム。下半分の紙の帯だけ色を変える。帯がないと角の取れた箱に見える。 */
const ERASER = {
  body: 'M7.4 9.6 24.6 7.8c1.4 5 1.7 10.2 1 15.4L8.4 24.8C6.9 19.8 6.7 14.7 7.4 9.6Z',
  sleeve: 'M7.7 16.5 25.3 14.7c.3 2.8.3 5.6.1 8.5L8.4 24.8c-.6-2.7-.8-5.4-.7-8.3Z',
}

/** クリップ。塗らずに一本の線で巻く。塗ると板を曲げた形に見える。 */
const CLIP =
  'M11.6 26.4V11.2c0-3 2-5.4 4.6-5.4s4.6 2.4 4.6 5.4v14.6c0 2.2-1.4 3.9-3.3 3.9s-3.3-1.7-3.3-3.9V12.2c0-1.1.8-2 1.8-2s1.8.9 1.8 2v12.6'

/**
 * 三角定規。輪郭と、まんなかの穴だけで描く。
 * 目盛りは刻まない。この大きさでは線が潰れて、汚れにしか見えない。
 *
 * 画びょうは描かない。横から見ると頭と針になるが、この大きさでは
 * どう描いてもきのこに見え、机の道具として読めなかった。
 */
const RULER = {
  body: 'M5 27.6 5.8 7 26.4 26.8Z',
  hole: 'M11.6 22.4c0-2 1.6-3.6 3.6-3.6s3.6 1.6 3.6 3.6-1.6 3.6-3.6 3.6-3.6-1.6-3.6-3.6Z',
}

/** インクのしずく。落ちる向きに尖らせる。丸く描くと玉に見える。 */
const DROP = {
  body: 'M16 3.8c4.6 6.4 7 11.2 7 14.6 0 4.3-3.1 7.6-7 7.6s-7-3.3-7-7.6c0-3.4 2.4-8.2 7-14.6Z',
  shine: 'M12.8 19c-.1-1.7.5-3.2 1.8-4.4',
}

/** ふせん。罫線は2本だけ。3本以上引くと、書かれた文字に見える。 */
const MEMO = {
  body: 'M6.6 7.4 25.6 6.2c1.2 6.5 1.4 12.9.6 19.2L7.2 26.6C5.8 20.3 5.6 13.9 6.6 7.4Z',
  lines: ['M11 13.6 21.6 13', 'M11.2 18.4 19 17.9'],
}

/** マスキングテープ。切れはしなので、両端を直線で切らずに斜めへ流す。 */
const TAPE = {
  body: 'M3.8 12.6 28.2 9.4c.6 3.5.7 7 .2 10.4L3.4 23c-.5-3.5-.3-7 .4-10.4Z',
  stripes: ['M11.4 11.2 10 22.2', 'M19.4 10.2 18 21.2'],
}

/** 音符。玉を斜めにして、印刷の記号に見せない。 */
const NOTE = {
  head: 'M10.2 21.2c2.6-.7 5 .4 5.3 2.5.3 2.1-1.5 4.3-4.1 5s-5-.4-5.3-2.5c-.3-2.1 1.5-4.3 4.1-5Z',
  stem: 'M15.5 23.7V7.4c3.6.6 6.8 2.2 8.7 4.9',
}

/** ちいさな旗。2枚の旗を別の色で吊るす。同じ色だと1枚の帯に見える。 */
const GARLAND = {
  string: 'M2.8 9.4c9 2.8 18 3.2 27 1.2',
  flags: [
    { d: 'M8.2 11 13.4 11.9l-2.4 5.8Z', fill: '#f5a8bd', line: '#d9738f' },
    { d: 'M16.8 12.2 22 11.8l-1.6 6Z', fill: '#bcaee2', line: '#8d7cc4' },
  ],
}

/** リボン。結び目を丸で描き、2本のしっぽを下へ流す。 */
const RIBBON = {
  bow: 'M16 16.2 7 10.4c-1.7-1.1-1.4-3.6.5-4.3 3-1.2 7.1 2 8.9 8.2 1.8-6.2 5.9-9.4 8.9-8.2 1.9.7 2.2 3.2.5 4.3Z',
  knot: 'M16 13.6c1.5 0 2.8 1.2 2.8 2.7s-1.3 2.7-2.8 2.7-2.8-1.2-2.8-2.7 1.3-2.7 2.8-2.7Z',
  tails: ['M13.8 18.6 9.6 27.8', 'M18.2 18.6 22.4 27.8'],
}

const STICKER_ART = {
  pencil: {
    line: '#dda630',
    parts: [
      { d: PENCIL.body, fill: '#f6cf63' },
      { d: PENCIL.wood, fill: '#f4e3c4', line: '#c3ab75' },
      { d: PENCIL.lead, fill: '#8d8577', line: '#6f685d' },
      { d: PENCIL.rubber, fill: '#f5a8bd', line: '#d9738f' },
      { d: PENCIL.band },
    ],
  },
  // 小さい1本は色を変えて置く。同じ絵が同じ色で2つ並ぶと、印刷したシートに見える。
  pencilPurple: {
    line: '#8d7cc4',
    parts: [
      { d: PENCIL.body, fill: '#bcaee2' },
      { d: PENCIL.wood, fill: '#f4e3c4', line: '#c3ab75' },
      { d: PENCIL.lead, fill: '#8d8577', line: '#6f685d' },
      { d: PENCIL.rubber, fill: '#f0d9a4', line: '#c3ab75' },
      { d: PENCIL.band },
    ],
  },
  eraser: {
    line: '#c3ab75',
    parts: [
      { d: ERASER.body, fill: '#fdf4ef' },
      { d: ERASER.sleeve, fill: '#bcd7ea', line: '#7e9cb6' },
    ],
  },
  clip: { line: '#8fa9c2', parts: [{ d: CLIP }] },
  ruler: {
    line: '#6fae87',
    parts: [{ d: RULER.body, fill: '#d8ecd9' }, { d: RULER.hole }],
  },
  drop: {
    line: '#d9738f',
    parts: [{ d: DROP.body, fill: '#f7c9d8' }, { d: DROP.shine }],
  },
  memo: {
    line: '#dda630',
    parts: [{ d: MEMO.body, fill: '#fbeaa8' }, ...MEMO.lines.map((d) => ({ d }))],
  },
  memoMint: {
    line: '#6fae87',
    parts: [{ d: MEMO.body, fill: '#d8ecd9' }, ...MEMO.lines.map((d) => ({ d }))],
  },
  tape: {
    line: '#7e9cb6',
    parts: [{ d: TAPE.body, fill: '#dbe8f2' }, ...TAPE.stripes.map((d) => ({ d }))],
  },
  note: {
    line: '#8d7cc4',
    parts: [{ d: NOTE.head, fill: '#bcaee2' }, { d: NOTE.stem }],
  },
  garland: { line: '#c3ab75', parts: [{ d: GARLAND.string }, ...GARLAND.flags] },
  ribbon: {
    line: '#d9738f',
    parts: [
      { d: RIBBON.bow, fill: '#f7c9d8' },
      { d: RIBBON.knot, fill: '#f5a8bd' },
      ...RIBBON.tails.map((d) => ({ d })),
    ],
  },
} satisfies Record<string, StickerArt>

type StickerName = keyof typeof STICKER_ART

type Sticker = {
  art: StickerName
  /** 置いた場所。紙に対する割合で置く。0%より手前と100%より先も指せる。 */
  at: readonly [x: number, y: number]
  /** 大きさと、置いた角度。角度をそろえると、机ではなく陳列棚に見える。 */
  size: number
  tilt: number
  /** ノートへ入っていく前に、ひと息ふくらむ向き。置いた場所から本の外へ向ける。 */
  drift: readonly [x: number, y: number]
  spin: number
  /** 動きはじめる順。一斉に動かすと、吸い込まれずに画面が切り替わったように見える。 */
  step: number
}

/**
 * 本のまわりに出したままの12本。
 *
 * 種類・大きさ・角度を隣どうしで変え、同じものが並ばないようにする。
 * 上辺には旗と、紙にはさむ道具（ふせん・クリップ）を寄せ、
 * 下辺には机に転がる道具（えんぴつ・けしゴム・定規）を寄せる。
 * どこに置いても同じように散らすと、机ではなく模様に見える。
 *
 * 場所は紙そのものに対する割合で指す。紙の外へ置く道具は0%より手前と100%より先を使う。
 * 紙束の中に置いてあるので、表紙が開いて本が広がるとき、道具も一緒に大きくなる。
 * 紙だけが大きくなると、道具は置いた場所に取り残されて背景の模様に見える。
 *
 * 紙に隠れる側は隠れたままでよい。大きい1本ほど深く潜らせ、はみ出した側だけを見せる。
 * 全部が見える大きさに切りそろえると、本の下に置いた道具ではなく、背景の模様に見える。
 *
 * 動きはじめは、逃げ場のせまい左右から先にする。表紙は開くと同時に広がるので、
 * ふちすれすれの1本を後回しにすると、入っていく前に広がった紙の下へ潜ってしまう。
 */
const STICKERS: readonly Sticker[] = [
  { art: 'garland', at: [46, -12], size: 7.4, tilt: -3, drift: [0.4, -8.6], spin: 10, step: 4 },
  { art: 'pencil', at: [3, -12], size: 6.6, tilt: -18, drift: [-7.6, -6.6], spin: -30, step: 2 },
  { art: 'drop', at: [21, -13.5], size: 3.4, tilt: 8, drift: [2.4, -8.2], spin: 18, step: 4 },
  { art: 'memo', at: [106, -8], size: 6.4, tilt: 12, drift: [7.8, -6.6], spin: 32, step: 2 },
  { art: 'tape', at: [112, 22], size: 5.2, tilt: -9, drift: [9.2, -0.8], spin: 24, step: 0 },
  { art: 'note', at: [113, 58], size: 4, tilt: 11, drift: [9.2, 2.1], spin: 20, step: 1 },
  { art: 'clip', at: [109.5, 98], size: 5.6, tilt: 16, drift: [8.2, 6.2], spin: 28, step: 3 },
  { art: 'ribbon', at: [94, 122], size: 5.2, tilt: -11, drift: [5.4, 7], spin: 26, step: 6 },
  { art: 'memoMint', at: [9, 121], size: 4.6, tilt: 10, drift: [-3.4, 8.2], spin: -22, step: 5 },
  { art: 'eraser', at: [-6, 108], size: 5.8, tilt: -7, drift: [-8.2, 6.6], spin: -28, step: 3 },
  {
    art: 'pencilPurple',
    at: [-10, 72],
    size: 4.4,
    tilt: 14,
    drift: [-9.2, 1.8],
    spin: -16,
    step: 1,
  },
  { art: 'ruler', at: [-8.5, 20], size: 5, tilt: -12, drift: [-9.2, -1.4], spin: -24, step: 0 },
]

/**
 * 動きはじめの1本ぶんの遅れ。
 * 表紙は開くと同時に大きく広がるので、遅らせすぎると広がった紙に飲まれる。
 */
const STEP_MS = 28

/** はずむのは、旗・音符・リボン。ただ揺れるだけの道具と、動きで描き分ける。 */
const BOUNCING: readonly StickerName[] = ['garland', 'note', 'ribbon']

/**
 * 揺れ方。
 *
 * 振れ幅・周期・位相を1本ずつ変える。同じ値で揺らすと、並べた道具が一斉に同じ間で
 * 動く列になり、机に出した道具ではなく、風で揺れる一枚の貼り紙に見える。
 *
 * 振れ幅は大きさで割る。同じ距離・同じ角度で振ると、大きい1本ほど動く量が増えて、
 * 本の下で暴れて見える。位相と周期は並び順から作る。表に手で書き足すと、
 * 1本増やすたびに全部を並べ直すことになる。
 */
function swayStyle(order: number, size: number) {
  return {
    '--bob': `${(0.9 / size).toFixed(2)}em`,
    '--drift': `${((order % 2 ? -0.55 : 0.55) / size).toFixed(2)}em`,
    '--swing': `${(9 / size).toFixed(1)}deg`,
    '--beat': `${(3.6 + ((order * 7) % 5) * 0.6).toFixed(1)}s`,
    /** 位相は負にして、置かれた時点で揺れの途中から始める。 */
    '--phase': `${-order * 730}ms`,
    /** 置かれて現れる順。入っていく順とは別にして、12本が揃って出ないようにする。 */
    '--in-delay': `${order * 45}ms`,
  }
}

function StickerShape({ art }: { art: StickerName }) {
  const { line, parts } = STICKER_ART[art] as StickerArt

  return (
    <svg className={styles.art} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g filter="url(#crayon-edge-art)">
        {parts.map(({ d, fill }) =>
          fill ? (
            <path
              key={`${d}-fill`}
              className={styles.fill}
              d={d}
              style={{ fill }}
              transform={FILL_SHIFT}
            />
          ) : null,
        )}
        {parts.map(({ d, line: partLine }) => (
          <path key={d} className={styles.line} d={d} style={{ stroke: partLine ?? line }} />
        ))}
      </g>
    </svg>
  )
}

function StickerPin({ sticker, order }: { sticker: Sticker; order: number }) {
  const { art, at, size, tilt, drift, spin, step } = sticker

  return (
    <span
      className={styles.sticker}
      style={
        {
          '--x': `${at[0]}%`,
          '--y': `${at[1]}%`,
          '--size': `${size}em`,
          '--tilt': `${tilt}deg`,
          '--drift-x': `${drift[0]}em`,
          '--drift-y': `${drift[1]}em`,
          '--spin': `${spin}deg`,
          '--delay': `${step * STEP_MS}ms`,
          ...swayStyle(order, size),
        } as CSSProperties
      }
    >
      {/*
       * 置いた場所・入っていく動き・待っている間の揺れを、別々の層で持つ。
       * ひとつの要素に重ねると、あとから流れる動きが前の位置を打ち消す。
       */}
      <span className={`${styles.float} ${BOUNCING.includes(art) ? styles.bounces : ''}`}>
        <StickerShape art={art} />
      </span>
    </span>
  )
}

/**
 * Intent: 本のまわりに書く道具を並べ、表紙が開くときにノートの中へ入れる。
 * Boundary: 表紙が開きはじめたかどうかだけを受け取る。押せず、読み上げにも出さない。
 * Composition: OnboardingPageの紙より先に置き、紙の下へ潜らせる。
 */
export function CoverStickers({ opening }: { opening: boolean }) {
  return (
    <span className={`${styles.layer} ${opening ? styles.tucking : ''}`} aria-hidden="true">
      {STICKERS.map((sticker, index) => (
        <StickerPin
          key={`${sticker.art}-${sticker.at[0]}-${sticker.at[1]}`}
          sticker={sticker}
          order={index}
        />
      ))}
    </span>
  )
}
