import type { CSSProperties } from 'react'
import type { OnboardingPage } from './onboardingSteps'
import styles from './SheetDoodles.module.css'

/**
 * 問いの紙の余白に描いたラクガキ。
 *
 * 表紙をめくった先も、書いているあいだずっと同じ紙が続く。問いと入力欄だけを置くと、
 * 表紙で開いた本が、めくった先で用紙に戻ってしまう。そこで紙の余白に、
 * その問いの場面だけを小さく描く。生まれた年月にはふうせんとケーキ、
 * 言葉を選ぶ紙には吹き出し、地域の紙にはおうちと木、書き終えた紙にはクラッカー。
 *
 * 描くのは余白だけにする。問いと入力欄にかかる場所には置かない。本文より先に
 * 絵を見てしまうと、読んで答える紙ではなく、絵の付いた用紙になる。
 * 同じ理由で、絵は紙の中身（答え）を先に示さない。答えの例も、残り枚数も描かない。
 *
 * 形は素直な線で置き、揺らぎは #crayon-edge-art に任せ、塗りは輪郭からわずかにずらす。
 * 表紙の絵（CoverArt）・まわりの文房具（CoverStickers）と同じ手にそろえる。
 */

/** 塗りは輪郭から少しずらす。線の内側に収めると、印刷した図版に見える。 */
const FILL_SHIFT = 'translate(1.1 -1.1)'

type DoodlePart = {
  d: string
  fill?: string
  /** その部品だけ別の色で引くとき。省いたら絵の輪郭色で引く。 */
  line?: string
}

type DoodleArt = {
  /** 絵ごとに縦横が違うので、枠も絵が持つ。 */
  viewBox: string
  /** 幅に対する高さ。枠と同じ比で置き、絵がつぶれないようにする。 */
  ratio: number
  line: string
  parts: readonly DoodlePart[]
}

/** ふうせん。ひもは風で流れた形にする。まっすぐ引くと糸に見える。 */
const BALLOON = {
  body: 'M16 3c5.3 0 9.6 4.2 9.6 9.4 0 5.7-5.5 10.1-9.6 13.4-4.1-3.3-9.6-7.7-9.6-13.4C6.4 7.2 10.7 3 16 3Z',
  knot: 'M16 25.8 13.8 29.2h4.4Z',
  string: 'M16 29.2c1.8 3 1.6 5.8-.6 8.4',
}

/** ケーキ。ろうそくは1本だけ。本数を描くと、書く前に年を決めたことになる。 */
const CAKE = {
  flame: 'M16 2.6c1.7 2 2.5 3.4 2.5 4.6 0 1.4-1.1 2.4-2.5 2.4s-2.5-1-2.5-2.4c0-1.2.8-2.6 2.5-4.6Z',
  candle: 'M14.8 9.8 17.4 9.7c.3 2.4.3 4.8.1 7.2l-2.8.1c-.3-2.4-.3-4.8.1-7.2Z',
  cream:
    'M5.4 17.6c2-1.5 3.8-1.5 5.4 0s3.4 1.5 5.2 0 3.6-1.5 5.4 0 3.6 1.5 5.2 0c1 3.1 1.2 5.5.6 7.3L5 24.9c-.8-2.1-.6-4.5.4-7.3Z',
  base: 'M4.9 24.9 26.6 24.1c.6 2.3.7 4.6.3 6.9L4.4 31.6c-.6-2.3-.4-4.6.5-6.7Z',
}

/** 吹き出し。中は空のままにする。言葉を入れると、答えの例を先に見せたことになる。 */
const BUBBLE = {
  body: 'M16 3.6c6.6 0 12 3.9 12 8.9s-5.4 8.9-12 8.9c-1.4 0-2.7-.2-3.9-.5-2.1 1.9-4.6 3.2-7 3.6 1-1.9 1.6-3.7 1.7-5.5C5 17.4 4 15.2 4 12.5 4 7.5 9.4 3.6 16 3.6Z',
  dots: ['M10.8 12.4h.1', 'M16 12.4h.1', 'M21.2 12.4h.1'],
}

/** おうち。窓は描かない。この大きさでは、窓を入れると面が潰れて汚れに見える。 */
const HOUSE = {
  body: 'M6.6 14.6 25.4 13.8c.8 5 .9 10 .3 15.1L6.2 29.6c-.8-5-.7-10 .4-15Z',
  roof: 'M3.2 15.2 16 4.2l12.8 11Z',
  door: 'M13.2 29.4c-.2-3.3.2-5.5 1.2-6.5s2.2-1 3.6 0c.6 2.2.8 4.4.6 6.4Z',
}

/** 木。葉は1つの塊で描く。枝分かれを入れると、この大きさでは線が団子になる。 */
const TREE = {
  crown: 'M16 3.6c4.7 4.2 7.6 9 8.6 14.2-5.7 1.7-11.5 1.7-17.2 0C8.4 12.6 11.3 7.8 16 3.6Z',
  trunk: 'M16 17.8c.3 4.4.4 8.2.3 11.6',
}

/** クラッカー。はじけた線は3本だけ。増やすと筒から出た煙に見える。 */
const POPPER = {
  cone: 'M3.8 28.8 17 11.6c2.9 2.2 4.8 5.7 5.2 9.9L3.8 28.8Z',
  band: 'M8.6 22 14.4 26.6',
  pops: ['M22.4 8.4 24.6 5.2', 'M26.2 13.4 29.8 12.2', 'M19.4 6 19 2.6'],
}

/** 紙吹雪。4枚とも形と色を変える。そろえると、まかれた紙ではなく模様に見える。 */
const CONFETTI = [
  { d: 'M5.6 7.4 11.8 5l.6 6.4Z', fill: '#f5a8bd', line: '#d9738f' },
  { d: 'M21.2 6.2 27 8.2l-3.4 4.4Z', fill: '#f6cf63', line: '#dda630' },
  { d: 'M10.4 20.2 16.6 18.4l.4 6.2Z', fill: '#bcaee2', line: '#8d7cc4' },
  { d: 'M22 20.6 27.6 22.8 23.4 26.4Z', fill: '#c3e2c8', line: '#6fae87' },
]

const DOODLE_ART = {
  balloonPink: {
    viewBox: '0 0 32 40',
    ratio: 40 / 32,
    line: '#d9738f',
    parts: [
      { d: BALLOON.body, fill: '#f5a8bd' },
      { d: BALLOON.knot, fill: '#f5a8bd' },
      { d: BALLOON.string, line: '#c3ab75' },
    ],
  },
  balloonYellow: {
    viewBox: '0 0 32 40',
    ratio: 40 / 32,
    line: '#dda630',
    parts: [
      { d: BALLOON.body, fill: '#f6cf63' },
      { d: BALLOON.knot, fill: '#f6cf63' },
      { d: BALLOON.string, line: '#c3ab75' },
    ],
  },
  balloonBlue: {
    viewBox: '0 0 32 40',
    ratio: 40 / 32,
    line: '#7e9cb6',
    parts: [
      { d: BALLOON.body, fill: '#dbe8f2' },
      { d: BALLOON.knot, fill: '#dbe8f2' },
      { d: BALLOON.string, line: '#c3ab75' },
    ],
  },
  cake: {
    viewBox: '0 0 32 34',
    ratio: 34 / 32,
    line: '#dda630',
    parts: [
      { d: CAKE.base, fill: '#f6cf63' },
      { d: CAKE.cream, fill: '#fdf4ef', line: '#c3ab75' },
      { d: CAKE.candle, fill: '#f7c9d8', line: '#d9738f' },
      { d: CAKE.flame, fill: '#f6b45e', line: '#e08b33' },
    ],
  },
  bubblePurple: {
    viewBox: '0 0 32 30',
    ratio: 30 / 32,
    line: '#8d7cc4',
    parts: [{ d: BUBBLE.body, fill: '#e4ddf6' }, ...BUBBLE.dots.map((d) => ({ d }))],
  },
  bubblePink: {
    viewBox: '0 0 32 30',
    ratio: 30 / 32,
    line: '#d9738f',
    parts: [{ d: BUBBLE.body, fill: '#f9dde5' }, ...BUBBLE.dots.map((d) => ({ d }))],
  },
  house: {
    viewBox: '0 0 32 32',
    ratio: 1,
    line: '#c3ab75',
    parts: [
      { d: HOUSE.body, fill: '#fdf4ef' },
      { d: HOUSE.roof, fill: '#f5a8bd', line: '#d9738f' },
      { d: HOUSE.door, fill: '#f6cf63', line: '#dda630' },
    ],
  },
  tree: {
    viewBox: '0 0 32 32',
    ratio: 1,
    line: '#6fae87',
    parts: [
      { d: TREE.crown, fill: '#c3e2c8' },
      { d: TREE.trunk, line: '#c3ab75' },
    ],
  },
  treeYellow: {
    viewBox: '0 0 32 32',
    ratio: 1,
    line: '#9cae5c',
    parts: [
      { d: TREE.crown, fill: '#dfe7ae' },
      { d: TREE.trunk, line: '#c3ab75' },
    ],
  },
  popper: {
    viewBox: '0 0 32 32',
    ratio: 1,
    line: '#8d7cc4',
    parts: [
      { d: POPPER.cone, fill: '#bcaee2' },
      { d: POPPER.band },
      ...POPPER.pops.map((d) => ({ d, line: '#dda630' })),
    ],
  },
  confetti: { viewBox: '0 0 32 32', ratio: 1, line: '#c3ab75', parts: CONFETTI },
} satisfies Record<string, DoodleArt>

type DoodleName = keyof typeof DOODLE_ART

type Doodle = {
  art: DoodleName
  /** 置く場所。紙に対する割合で、絵の中心を指す。 */
  at: readonly [x: number, y: number]
  size: number
  tilt: number
  /**
   * 背の低い端末では描かない1つ。
   *
   * 紙の高さは画面に合わせて縮むが、問いと入力欄は縮まないので、余白だけが減る。
   * 減った余白に同じ数を描くと、絵が問いや入力欄の裏へ回り、半分だけ覗く。
   * 描き切れないぶんは、小さくするのではなく描かない。
   */
  short?: false
}

/**
 * 紙ごとのラクガキ。
 *
 * 置くのは紙の上下の余白と、右側の空きだけにする。左はとじ代なので置かない。
 * 問いは紙の中ほどに組まれるので、上下の余白はどの紙でも空いている。
 * 数は1枚につき2〜3個まで。増やすほど、問いより絵のほうが目立つ。
 */
const DOODLES: Partial<Record<OnboardingPage, readonly Doodle[]>> = {
  // 生まれた年月。誕生日の場面を、紙の上と下に分けて置く。
  birth: [
    { art: 'balloonPink', at: [83, 10], size: 3.7, tilt: -7 },
    { art: 'balloonBlue', at: [93, 17], size: 2.7, tilt: 9 },
    // ケーキは入力欄のすぐ下。紙が縮むと欄に隠れるので、背の低い端末では描かない。
    { art: 'cake', at: [77, 87], size: 5.2, tilt: -3, short: false },
  ],
  // 言葉を選ぶ紙。中は空の吹き出しにして、答えの例を先に見せない。
  gender: [
    { art: 'bubblePurple', at: [84, 12], size: 4.4, tilt: -6 },
    { art: 'bubblePink', at: [16, 91], size: 3.2, tilt: 8 },
  ],
  // 地域の紙。紙の下辺を地面に見立てて、おうちと木を並べる。
  // 一覧が開いても下辺までは届かないので、ここは隠れない。
  region: [
    { art: 'house', at: [72, 84], size: 6, tilt: -2 },
    { art: 'tree', at: [89, 86], size: 4.4, tilt: 4 },
    { art: 'treeYellow', at: [21, 87], size: 3.8, tilt: -5 },
  ],
  // 書き終えた紙。名札の上下で、はじけたところを描く。
  done: [
    { art: 'popper', at: [82, 13], size: 5.2, tilt: -8 },
    { art: 'confetti', at: [22, 12], size: 4, tilt: 6 },
    { art: 'confetti', at: [78, 85], size: 3.8, tilt: -5 },
    { art: 'confetti', at: [24, 88], size: 3.2, tilt: 12 },
  ],
}

/** 現れる順の1つぶんの遅れ。紙が座ってから、絵が順に降りてくる。 */
const STEP_MS = 90

function DoodleShape({ art }: { art: DoodleName }) {
  const { viewBox, line, parts } = DOODLE_ART[art] as DoodleArt

  return (
    <svg className={styles.art} viewBox={viewBox} aria-hidden="true" focusable="false">
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

/**
 * Intent: 問いの紙の余白に、その問いの場面を小さく描く。
 * Boundary: いま見えている紙の種類だけを受け取る。押せず、読み上げにも出さない。
 * Composition: 紙（.card）の中に敷き、本文より後ろへ回す。
 */
export function SheetDoodles({ page }: { page: OnboardingPage }) {
  const doodles = DOODLES[page]
  if (!doodles) return null

  return (
    <span className={styles.layer} aria-hidden="true">
      {doodles.map(({ art, at, size, tilt, short }, order) => (
        <span
          key={`${art}-${at[0]}-${at[1]}`}
          className={`${styles.doodle} ${short === false ? styles.tallOnly : ''}`}
          style={
            {
              '--x': `${at[0]}%`,
              '--y': `${at[1]}%`,
              '--size': `${size}em`,
              '--height': `${(size * DOODLE_ART[art].ratio).toFixed(2)}em`,
              '--tilt': `${tilt}deg`,
              '--in-delay': `${order * STEP_MS}ms`,
              /** 揺れは1つずつずらす。そろえると、絵ではなく模様が波打って見える。 */
              '--beat': `${(4.2 + ((order * 5) % 4) * 0.7).toFixed(1)}s`,
              '--phase': `${-order * 810}ms`,
              '--swing': `${(order % 2 ? 1.6 : -1.9).toFixed(1)}deg`,
            } as CSSProperties
          }
        >
          <span className={styles.float}>
            <DoodleShape art={art} />
          </span>
        </span>
      ))}
    </span>
  )
}
