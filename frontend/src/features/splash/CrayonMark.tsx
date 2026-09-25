import styles from './SplashScreen.module.css'

/**
 * 起動画面のクレヨン。
 *
 * 第1幕で線が引かれる画面には、「誰が引いているのか」の答えが要る。
 * それを画面に出せるのはクレヨン自身だけなので、起動画面の絵はこれ一本にする。
 * 太陽・雲・チューリップは表紙（feed/CoverArt）、シールは本のまわり
 * （feed/CoverStickers）の持ち分なので、ここへは持ち込まない。
 *
 * 形は表紙の絵と同じ作法で描く。素直な線で置き、揺らぎはフィルタに任せ、
 * 塗りは輪郭からわずかにずらす。パスを表紙の絵と共有しないのは、指針が
 * 「絵を一枚の絵として置けるのは表紙だけ」とフィード固有の例外として書いており、
 * shared へ出すとその境界が消えるため。重ねて持つほうを選ぶ。
 *
 * 先を上に向けて描く。下向きに描くと、軸が題字へ重なって字を隠す。
 * 上向きなら、先が波線に触れたまま軸は題字の下の余白へ伸びる。
 *
 * 揺らぎは #crayon-edge-fine を使う。表紙の絵の揺らぎ（#crayon-edge-art）は
 * 周期が絵の中に数回しか入らない長さで作ってあり、30四方のこの絵にかけると
 * 波が軸を横切って、クレヨンの命である平行な2辺がうねる。羽根に見えてしまう。
 */

/** 塗りは輪郭から少しずらす。線の内側に収めると、印刷した絵に見える。 */
const FILL_SHIFT = 'translate(1.1 -1.1)'

/**
 * 先。軸より細いところから立ち上げて、肩を作る。
 * 軸と同じ幅から立てると、輪郭が一続きの雫になってクレヨンに見えない。
 */
const TIP = 'M18.8 18.2H11.2l3-13.5c.3-1.3 1.4-1.4 1.7 0Z'

/**
 * 軸。下端だけを丸めるのは、握っている側だから。
 * 上下を同じ形にすると、クレヨンではなく棒に見える。
 */
const BODY = 'M9.2 18.2h11.6l.5 30.2c.1 4.6-2.4 7.8-6.3 7.8s-6.4-3.2-6.3-7.8Z'

/** 巻紙。クレヨンの紙は軸の真ん中に一周巻いてある。 */
const LABEL = 'M9.5 28.4 20.6 28.4 20.7 43 9.6 43Z'

/** 巻紙のふち。上下の2本だけ引く。側面まで囲むと、貼った付箋に見える。 */
const LABEL_EDGES = ['M9.5 28.6h11.1', 'M9.6 42.8h11']

export function CrayonMark() {
  return (
    <svg className={styles.penArt} viewBox="0 0 30 60" aria-hidden="true" focusable="false">
      <g filter="url(#crayon-edge-fine)">
        <g className={styles.fill} transform={FILL_SHIFT}>
          <path className={styles.bodyFill} d={BODY} />
          <path className={styles.bodyFill} d={TIP} />
          <path className={styles.labelFill} d={LABEL} />
        </g>
        <path className={styles.line} d={TIP} />
        <path className={styles.line} d={BODY} />
        {LABEL_EDGES.map((edge) => (
          <path key={edge} className={styles.line} d={edge} />
        ))}
      </g>
    </svg>
  )
}
