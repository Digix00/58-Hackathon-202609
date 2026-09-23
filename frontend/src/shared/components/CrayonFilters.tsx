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
    </svg>
  )
}
