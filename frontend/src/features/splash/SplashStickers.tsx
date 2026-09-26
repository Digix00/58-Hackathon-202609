import type { CSSProperties } from 'react'
import styles from './SplashScreen.module.css'

/**
 * 題字のまわりに貼った3枚のシール。
 *
 * クレヨンが線を引き終えたあと、色が入るのと同じ拍で1枚ずつ貼られる。
 * 枚数を3枚に留めるのは、起動画面の主題がクレヨンだからで、
 * ここを賑やかにすると、引かれていく線より先にシールを見てしまう。
 *
 * 形は CrayonMark と同じ作法。パスは feed/CoverStickers と重ねて持つ。
 * 起動画面とフィードで貼る場所も枚数も違うので、共有すると
 * 「どちらの画面のための表なのか」が読めなくなる。
 */

/** 塗りは輪郭から少しずらす。CrayonMark と同じずらし幅にそろえる。 */
const FILL_SHIFT = 'translate(1.1 -1.1)'

/** ほし。5つの角の長さをそろえないのは、定規で割った形にしないため。 */
const STAR =
  'M16 2.8 20.4 11.4 29.6 12.8 22.9 19.5 24.6 28.8 16 24.3 7.3 28.5 9.1 19.3 2.5 12.7 11.7 11.6Z'

/** きらり。細い4つの角で、ほしとは別の光り方にする。 */
const SPARKLE =
  'M16 1.8c1.3 6.9 3.8 10.5 11.1 12.1-7.3 1.7-9.8 5.3-11.1 12.2-1.3-6.9-3.8-10.5-11.1-12.2C12.2 12.3 14.7 8.7 16 1.8Z'

/** ぐるぐる。中から外へ2巻き半。巻きが少ないと、渦ではなく数字に見える。 */
const SWIRL =
  'M16.8 14.9c-1.3-.3-2.5 1-2.1 2.4.4 1.7 2.7 2.3 4.1 1.2 2-1.5 1.8-4.6-.3-6-2.9-1.9-6.8-.4-8.1 2.8-1.5 3.9 1.1 8.4 5.3 9.5 5 1.3 10.1-2.3 11.1-7.4'

type Sticker = {
  /** 塗る形。輪郭だけのシール（ぐるぐる）は持たない。 */
  body?: string
  /** 輪郭として引く線。塗る形と同じ d を重ねることが多い。 */
  outline: string
  fill?: string
  line: string
  /** 貼った場所。題字の組みを中心に、外側へ置く。 */
  top?: string
  bottom?: string
  left?: string
  right?: string
  /** 大きさと、貼った角度。角度をそろえると、機械で貼った列に見える。 */
  size: string
  tilt: string
  /** 貼られる順。同時に出すと、1枚ずつ貼った手の動きにならない。 */
  order: number
}

/**
 * 3枚の置きかた。
 *
 * クレヨンは題字の右下へ抜けるので、シールはそこを避けて左と上に寄せる。
 * 同じ絵を2枚置かず、大きさも角度も隣どうしで変える。
 */
const STICKERS: readonly Sticker[] = [
  {
    body: STAR,
    outline: STAR,
    fill: '#f8d878',
    line: '#e0a72f',
    top: '-1.85em',
    right: '-1.75em',
    size: '2.1em',
    tilt: '11deg',
    order: 0,
  },
  {
    body: SPARKLE,
    outline: SPARKLE,
    fill: '#f7c9d8',
    line: '#d9738f',
    top: '-0.95em',
    left: '-2.2em',
    size: '1.55em',
    tilt: '-8deg',
    order: 1,
  },
  {
    outline: SWIRL,
    line: '#79a95f',
    bottom: '-2.9em',
    left: '-1.5em',
    size: '2.25em',
    tilt: '7deg',
    order: 2,
  },
]

/**
 * 貼りはじめ。線を引き終えて色が入るのと同じ拍から貼る。
 * SplashScreen.module.css の .fill と同じ 1000ms を起点にする。
 */
const STUCK_FROM_MS = 1000

/** 1枚ぶんの遅れ。3枚を貼り終えても、描き切る時間（DRAW_MS）を越えない間隔。 */
const STEP_MS = 80

export function SplashStickers() {
  return (
    <>
      {STICKERS.map((sticker, index) => (
        <span
          key={sticker.line}
          className={styles.sticker}
          style={
            {
              top: sticker.top,
              bottom: sticker.bottom,
              left: sticker.left,
              right: sticker.right,
              '--size': sticker.size,
              '--tilt': sticker.tilt,
              '--delay': `${STUCK_FROM_MS + sticker.order * STEP_MS}ms`,
              /* 揺れの周期と位相を1枚ずつ変える。そろえると3枚が列で揺れる。 */
              '--beat': `${3.6 + index * 0.7}s`,
              '--phase': `${index * -1.3}s`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          {/* 貼った場所・貼られた瞬間の弾み・待つ間の揺れを層で分ける。
              ひとつの要素に重ねると、あとから流れる動きが前の位置を打ち消す。 */}
          <span className={styles.stickerFloat}>
            <svg className={styles.stickerArt} viewBox="0 0 32 32" focusable="false">
              <g filter="url(#crayon-edge-art)">
                {sticker.body ? (
                  <path
                    className={styles.fill}
                    d={sticker.body}
                    style={{ fill: sticker.fill }}
                    transform={FILL_SHIFT}
                  />
                ) : null}
                <path
                  className={styles.line}
                  d={sticker.outline}
                  style={{ stroke: sticker.line }}
                />
              </g>
            </svg>
          </span>
        </span>
      ))}
    </>
  )
}
