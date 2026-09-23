import type { CSSProperties } from 'react'
import styles from './CoverArt.module.css'

/**
 * クイズの表紙の絵。
 *
 * フィードの表紙と同じ作法で、紙の上（空）と下（机の上）に分けて絵を置く。
 * 描くのは「これから読む手紙が届いた」という一場面だけにし、
 * 誰が書いたのか、何通合っているのかを予告するものは描かない。
 *
 * 形は素直な線で置き、揺らぎは #crayon-edge-art に任せる。塗りは輪郭から
 * わずかにずらす。線の内側にきっちり収めると、クレヨンで塗った絵ではなく
 * 印刷された図形に見える。
 */

/** 飛んできた紙飛行機と、その通り道。手紙が届くところを一枚の絵にする。 */
const TRAIL = 'M2.4 30.6C10.2 28 16.8 23.8 22 18.2'
const PLANE = {
  body: 'M26.8 15.6 61.4 2.6 51.4 28.4 44.2 19.4Z',
  fold: 'M61.4 2.6 44.2 19.4',
}

/**
 * 封筒。3つとも同じ形で描く。
 *
 * 一通ずつ形を変えると、届いた手紙の差出人を絵で描き分けたことになる。
 * 誰が書いたのかはこの画面の問いそのものなので、変えるのは大きさと傾きだけにして、
 * 同じ手が3回描いた絵にする。
 */
const ENVELOPE = {
  body: 'M2.6 4.6 37.2 3.4 38.4 26.6 3.4 27.8Z',
  flap: 'M2.6 4.6C8 9.2 14.4 13.8 20.6 16.4 26.6 13 32 8.4 37.2 3.4',
  /** 封の蝋。フィードのハートと同じ一筆で描き、同じ世界の絵にする。 */
  seal: 'M12 20.3C11.3 19.8 3.4 14.5 2.5 8.6 2 5.1 4.2 2.3 7.2 2.1c2.2-.2 4 1.1 4.9 3.1.8-2.1 2.6-3.5 4.8-3.3 3 .2 5.3 3 4.7 6.5-.9 5.8-8.9 11.3-9.6 11.9Z',
}

type EnvelopeStack = {
  /** 机に置かれた高さ（並びの高さに対する比）と、置いた向きの傾き。 */
  grown: number
  tilt: string
}

const ENVELOPES: readonly EnvelopeStack[] = [
  { grown: 0.82, tilt: '-4.2deg' },
  { grown: 1, tilt: '1.8deg' },
  { grown: 0.88, tilt: '-1.6deg' },
]

function Envelope({ grown, tilt }: EnvelopeStack) {
  return (
    <svg
      className={styles.envelope}
      viewBox="0 0 41 30"
      style={{ '--grown': grown, '--tilt': tilt } as CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#crayon-edge-art)">
        <path className={styles.paperFill} d={ENVELOPE.body} transform="translate(1.1 -1.2)" />
        <path className={styles.paperLine} d={ENVELOPE.body} />
        <path className={styles.paperLine} d={ENVELOPE.flap} />
        <g transform="translate(17.4 17.2) scale(0.36)">
          <path className={styles.sealFill} d={ENVELOPE.seal} transform="translate(2.4 -2.8)" />
          <path className={styles.sealLine} d={ENVELOPE.seal} />
        </g>
      </g>
    </svg>
  )
}

export function CoverArt() {
  return (
    <>
      <svg className={styles.plane} viewBox="0 0 64 34" aria-hidden="true" focusable="false">
        <g filter="url(#crayon-edge-art)">
          <path className={styles.trail} d={TRAIL} />
          <path className={styles.planeFill} d={PLANE.body} transform="translate(1.2 -1.2)" />
          <path className={styles.planeLine} d={PLANE.body} />
          <path className={styles.planeLine} d={PLANE.fold} />
        </g>
      </svg>
      {/* 机の上。紙の下辺を机に見立て、届いた封筒をそこに並べる。 */}
      <span className={styles.desk} aria-hidden="true">
        {ENVELOPES.map((envelope) => (
          <Envelope key={envelope.tilt} {...envelope} />
        ))}
      </span>
    </>
  )
}
