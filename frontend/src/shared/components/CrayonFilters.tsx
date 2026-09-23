/**
 * クレヨン風の輪郭に使う SVG フィルタ定義。
 *
 * Safari は filter: url("#localref") しか解決せず、外部SVGファイルも data URI も無視する。
 * そのため同一ドキュメント内に置く必要があり、LIFF (iOS = WebKit) では必須の条件になる。
 * 紙片は AppShell 内と standalone-page の両方に現れるので、アプリのルートで一度だけ描画する。
 */
export function CrayonFilters() {
  return (
    <svg className="svg-defs" aria-hidden="true" focusable="false">
      <filter id="crayon-edge" x="-16%" y="-16%" width="132%" height="132%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.026"
          numOctaves="3"
          seed="19"
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
