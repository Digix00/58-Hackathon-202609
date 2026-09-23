import type { CSSProperties } from 'react'
import styles from './CoverArt.module.css'

/**
 * 表紙の絵。
 *
 * 表紙だけは絵本の表紙として扱い、太陽・雲・チューリップを一枚の絵として置く。
 * 声の紙には持ち込まない。読んでいる紙に絵があると、本文より先に絵を見てしまう。
 *
 * 形は素直な線で置き、揺らぎは #crayon-edge-art に任せる。NavIcon と同じ作法だが、
 * 絵はアイコンより大きいので、周期の長い・振れ幅の広い方の揺らぎを使う。
 * 塗りは輪郭からわずかにずらす。線の内側にきっちり収めると、クレヨンで塗った
 * 絵ではなく印刷された図形に見える。子どもが塗ったときのはみ出しを残す。
 */

/** 太陽の光。長さをそろえないのは、8本を定規で割った形にしないため。 */
const SUN_RAYS = [
  'M24 8.6V3.4',
  'M33.2 14.2 37.4 10.1',
  'M39.4 24h5.4',
  'M33.4 33.6 37.6 37.9',
  'M24 39.4v5.2',
  'M14.6 33.6 10.3 38.1',
  'M8.6 24H3.4',
  'M14.6 14.4 10.2 10.1',
]

/** 太陽の輪。真円を置くとここだけコンパスで描いた線に見える。 */
const SUN_BODY =
  'M24 12.6c6.2-.2 11.4 4.6 11.4 11 0 6.6-5 11.7-11.4 11.8-6.5.1-11.5-5.1-11.4-11.5.1-6.4 5.2-11.1 11.4-11.3Z'

/**
 * 雲。ふくらみは3つに留める。
 * 増やすと、この大きさでは輪郭の凹凸が潰れて綿の塊に見える。
 */
const CLOUD =
  'M7.6 21.6c-4.2 0-6.2-3.4-5-6.6 1-2.7 4-3.9 6.6-3 .4-4.8 5-8 9.6-6.8 2.8-3.4 8.4-3 10.6.8.8 1.4 1.1 2.9.9 4.4 4.3-.4 8.1 2.4 8.8 6.2.6 3-1.5 5-4.5 5Z'

/**
 * チューリップ。3本とも同じ形で描く。
 *
 * 一本ずつ形を変えると、描いた手が3人いることになる。
 * 変えるのは大きさ・色・傾きだけにして、同じ手が3回描いた絵にする。
 */
const TULIP = {
  head: 'M8.2 8.4 12.6 12.8 16 5.6l3.6 7.2L24 8.4c1 7.2-3 12.8-8 12.8s-8.8-5.6-7.8-12.8Z',
  stem: 'M16 21c-1 7.6-.6 15.4.4 24.6',
  leaves: [
    'M15.4 27.6c-5.6-1.4-10.2 3-11.2 10.2 6.2-.4 10.2-4.2 11.2-10.2Z',
    'M16.2 33.2c5.6-1.2 10.4 2 11.6 8.2-5.8.4-10.4-2.6-11.6-8.2Z',
  ],
}

type TulipStem = {
  /** 花びらの色と、その色で引く輪郭。輪郭を灰色にすると塗り絵の下絵に見える。 */
  petal: string
  petalLine: string
  /** 背の高さ（花壇の高さに対する比）と、生えた向きの傾き。 */
  grown: number
  tilt: string
}

const TULIP_STEMS: readonly TulipStem[] = [
  { petal: '#f5a8bd', petalLine: '#d9738f', grown: 0.88, tilt: '-3.4deg' },
  { petal: '#f6cf63', petalLine: '#dda630', grown: 1, tilt: '1.6deg' },
  { petal: '#bcaee2', petalLine: '#8d7cc4', grown: 0.74, tilt: '-1.2deg' },
]

function Tulip({ petal, petalLine, grown, tilt }: TulipStem) {
  return (
    <svg
      className={styles.tulip}
      viewBox="0 0 32 46"
      style={
        {
          '--petal': petal,
          '--petal-line': petalLine,
          '--grown': grown,
          '--tilt': tilt,
        } as CSSProperties
      }
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#crayon-edge-art)">
        <g transform="translate(1.1 -1.3)">
          <path className={styles.petalFill} d={TULIP.head} />
          {TULIP.leaves.map((leaf) => (
            <path key={leaf} className={styles.leafFill} d={leaf} />
          ))}
        </g>
        <path className={styles.petalLine} d={TULIP.head} />
        <path className={styles.leafLine} d={TULIP.stem} />
        {TULIP.leaves.map((leaf) => (
          <path key={leaf} className={styles.leafLine} d={leaf} />
        ))}
      </g>
    </svg>
  )
}

export function CoverArt() {
  return (
    <>
      <svg className={styles.sun} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <g filter="url(#crayon-edge-art)">
          <path className={styles.sunFill} d={SUN_BODY} transform="translate(1.4 -1.4)" />
          <path className={styles.sunLine} d={SUN_BODY} />
          {SUN_RAYS.map((ray) => (
            <path key={ray} className={styles.sunLine} d={ray} />
          ))}
        </g>
      </svg>
      <svg className={styles.cloud} viewBox="0 0 44 26" aria-hidden="true" focusable="false">
        <g filter="url(#crayon-edge-art)">
          <path className={styles.cloudFill} d={CLOUD} transform="translate(1.2 -1.2)" />
          <path className={styles.cloudLine} d={CLOUD} />
        </g>
      </svg>
      {/* 花壇。紙の下辺を地面に見立て、茎をそこまで伸ばす。 */}
      <span className={styles.garden} aria-hidden="true">
        {TULIP_STEMS.map((stem) => (
          <Tulip key={stem.petal} {...stem} />
        ))}
      </span>
    </>
  )
}
