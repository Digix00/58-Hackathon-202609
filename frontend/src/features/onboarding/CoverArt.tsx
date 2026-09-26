import type { CSSProperties } from 'react'
import styles from './CoverArt.module.css'

/**
 * はじめの1ページの表紙の絵。
 *
 * フィード・クイズの表紙と同じ作法で、紙の上（名札）と下（クレヨンの箱）に
 * 分けて絵を置く。描くのは「これから書く」という一場面だけにし、
 * 何を聞かれるのか、あと何枚あるのかを予告するものは描かない。
 *
 * 名札を白いままにするのは、そこに書くのが利用者だから。
 * あらかじめ名前や似顔絵を入れると、書く前に答えを見せたことになる。
 * 人の絵を描かないのも同じ理由で、この本の主役は読む人自身である。
 *
 * 形は素直な線で置き、揺らぎは #crayon-edge-art に任せる。塗りは輪郭から
 * わずかにずらす。線の内側にきっちり収めると、クレヨンで塗った絵ではなく
 * 印刷された図形に見える。
 */

/**
 * 名札。紙の上辺から紐で吊るす。
 *
 * 面は空のままにし、代わりに書きかけの罫線だけを2本置く。
 * 罫線を引かないとただの板に見え、3本以上引くと書かれた文字に見える。
 */
const TAG = {
  string: 'M23.4 13.4C21 8.8 19.2 4.6 18.2 0.8',
  body: 'M5.2 14.6 42.4 11.6c1.8 8.8 2.1 17.2 1 25.4L6.2 40C4.2 31.6 4 23.2 5.2 14.6Z',
  hole: 'M21.4 18.4c1.8-.2 3.4.9 3.5 2.4.1 1.6-1.3 3-3.1 3.1-1.8.1-3.3-1-3.4-2.5-.1-1.6 1.2-2.9 3-3Z',
  lines: ['M11.6 29.2 36.4 27.4', 'M11.9 34.2 28.8 33'],
}

/**
 * クレヨン。3本とも同じ形で描く。
 *
 * 一本ずつ形を変えると、描いた手が3人いることになる。
 * 変えるのは大きさ・色・傾きだけにして、同じ手が3回描いた絵にする。
 */
const CRAYON = {
  tip: 'M16 1.8 23.8 14.4 8.2 14.8Z',
  body: 'M8.2 14.8 23.8 14.4c1.2 10.4 1.4 20.8.6 31.2l-16.8.4C8.4 35.6 8 25.2 8.2 14.8Z',
  band: 'M8.6 21 23.4 20.6',
}

type CrayonStick = {
  /** 軸の色と、その色で引く輪郭。輪郭を灰色にすると塗り絵の下絵に見える。 */
  wax: string
  waxLine: string
  /** 箱からの出ぐあい（箱の高さに対する比）と、入っていた向きの傾き。 */
  grown: number
  tilt: string
}

const CRAYON_STICKS: readonly CrayonStick[] = [
  { wax: '#f5a8bd', waxLine: '#d9738f', grown: 0.82, tilt: '-3deg' },
  { wax: '#f6cf63', waxLine: '#dda630', grown: 1, tilt: '1.8deg' },
  { wax: '#bcaee2', waxLine: '#8d7cc4', grown: 0.7, tilt: '-1.4deg' },
]

function Crayon({ wax, waxLine, grown, tilt }: CrayonStick) {
  return (
    <svg
      className={styles.crayon}
      viewBox="0 0 32 46"
      style={
        {
          '--wax': wax,
          '--wax-line': waxLine,
          '--grown': grown,
          '--tilt': tilt,
        } as CSSProperties
      }
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#crayon-edge-art)">
        <g transform="translate(1.1 -1.3)">
          <path className={styles.waxFill} d={CRAYON.tip} />
          <path className={styles.waxFill} d={CRAYON.body} />
        </g>
        <path className={styles.waxLine} d={CRAYON.tip} />
        <path className={styles.waxLine} d={CRAYON.body} />
        <path className={styles.waxLine} d={CRAYON.band} />
      </g>
    </svg>
  )
}

export function CoverArt() {
  return (
    <>
      <svg className={styles.tag} viewBox="0 0 48 44" aria-hidden="true" focusable="false">
        <g filter="url(#crayon-edge-art)">
          <path className={styles.tagFill} d={TAG.body} transform="translate(1.2 -1.2)" />
          <path className={styles.tagLine} d={TAG.body} />
          <path className={styles.tagLine} d={TAG.hole} />
          <path className={styles.stringLine} d={TAG.string} />
          {TAG.lines.map((line) => (
            <path key={line} className={styles.writingLine} d={line} />
          ))}
        </g>
      </svg>
      {/* クレヨンの箱。紙の下辺を箱の縁に見立て、そこから軸を出す。 */}
      <span className={styles.box} aria-hidden="true">
        {CRAYON_STICKS.map((stick) => (
          <Crayon key={stick.wax} {...stick} />
        ))}
      </span>
    </>
  )
}
