import { useState } from 'react'
import styles from './CrayonFilters.module.css'

/**
 * クレヨン風の輪郭に使う SVG フィルタ定義。
 *
 * Safari は filter: url("#localref") しか解決せず、外部SVGファイルも data URI も無視する。
 * そのため同一ドキュメント内に置く必要があり、LIFF (iOS = WebKit) では必須の条件になる。
 * 画面遷移ごとにseedを変え、その画面にいる間は同じ揺らぎを保つ。
 */
function createCrayonSeed(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] % 10_000
}

export function CrayonFilters() {
  const [seed] = useState(createCrayonSeed)

  return (
    <svg className={styles.definitions} aria-hidden="true" focusable="false">
      <filter id="crayon-edge" x="-16%" y="-16%" width="132%" height="132%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.026"
          numOctaves="3"
          seed={seed}
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="5"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      {/*
       * 小さな絵のための揺らぎ。
       *
       * ゆらぎの周期と振れ幅は、かける図形の座標系で決まる。
       * 24四方のアイコンに crayon-edge をかけると、周期が絵より大きく、
       * 振れ幅も幅の2割に届くため、ふちが揺れるのではなく絵ごと崩れる。
       * 周期を絵の中に何度か入る細かさにし、振れ幅は線の太さの半分に留める。
       */}
      <filter id="crayon-edge-fine" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.18"
          numOctaves="2"
          seed={seed}
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="0.9"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      {/*
       * 表紙の絵のための揺らぎ。
       *
       * アイコンと違い、絵は紙いっぱいの大きさで置く。周期をアイコンと同じ細かさに
       * すると、線が震えて見えるだけで手の動きにならない。周期を絵の中に数回入る
       * 長さにし、振れ幅は線の太さと同じくらいまで広げて、引ききれなかった線にする。
       */}
      <filter id="crayon-edge-art" x="-24%" y="-24%" width="148%" height="148%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.09"
          numOctaves="2"
          seed={seed}
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="2.2"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  )
}
