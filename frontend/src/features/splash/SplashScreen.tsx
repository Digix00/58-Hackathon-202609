import { useDisplaySettings } from '../../app/providers/DisplaySettingsContext'
import notebookBackground from '../../shared/styles/NotebookBackground.module.css'
import { CrayonMark } from './CrayonMark'
import { SplashStickers } from './SplashStickers'
import { useSplashPresentation } from './useSplashPresentation'
import styles from './SplashScreen.module.css'

/**
 * 起動画面。
 *
 * LIFFの初期化を待つあいだの画面であり、待たせていることを知らせるのではなく、
 * 「いま誰かがこの本の題字を書いている」時間として見せる。クレヨンが波線を
 * 引きながら渡り、引き終わってから色が入り、シールが貼られる。
 *
 * ここで本を開かない。ノートを開く動作はフィードの表紙が持っており
 * （feed/useFeedReader の coverTurnOut）、起動画面でも開くと同じ所作が
 * 二度続いて、表紙の見せ場がなくなる。起動画面は開く直前までを受け持つ。
 *
 * 退場では絵だけが抜け、方眼の紙が残る。紙が切り替わらないので、
 * 続けて現れるフィードの本が、同じ机の上に置かれたように見える。
 */

/**
 * 題字の下の波線。
 *
 * 表紙の題字は text-decoration の波線で引いているが、こちらは引かれていく
 * 過程を見せるため、線として持つ。色も太さも表紙と同じ見えにそろえる。
 * pathLength を100に正規化しておくと、実際の長さを測らずに dash で引ける。
 */
function TitleRule() {
  return (
    <svg className={styles.rule} viewBox="0 0 96 12" aria-hidden="true" focusable="false">
      <path
        className={styles.rulePath}
        pathLength="100"
        d="M1 6.2c3.1-4.6 6.1-4.6 9.2 0s6.1 4.6 9.2 0 6.1-4.6 9.2 0 6.1 4.6 9.2 0 6.1-4.6 9.2 0 6.1 4.6 9.2 0 6.1-4.6 9.2 0 6.1 4.6 9.2 0 6.1-4.6 9.2 0 6.1 4.6 9.2 0"
      />
    </svg>
  )
}

/**
 * Intent: 準備が終わるまでの画面を、絵本の作法で描く。
 * Boundary: 準備が終わったかどうかだけを受け取り、退場し終えたことだけを返す。
 * Composition: AppLayout が初期化中に描き、onDone のあと本来の画面へ移る。
 */
export function SplashScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { rootRef, phase, hint } = useSplashPresentation(ready, onDone)
  // 文字サイズの設定は、下部ナビを持つ画面の外にあるこの画面にも通す。
  const { fontSize } = useDisplaySettings()

  return (
    <main
      ref={rootRef}
      className={`${styles.screen} ${notebookBackground.grid} ${styles[phase]} ${
        fontSize === 'large' ? styles.large : ''
      }`}
      aria-busy={!ready}
    >
      <div className={styles.mark}>
        {/* 置くのは題字だけ。件数も一言も出さない。めくる前に中身を予告しない。 */}
        <h1 className={styles.title}>目安箱</h1>
        <TitleRule />
        {/* クレヨンは移動・息・絵を層で分ける。同じ要素に重ねると動きが打ち消し合う。 */}
        <span className={styles.pen} aria-hidden="true">
          <span className={styles.penBreath}>
            <CrayonMark />
          </span>
        </span>
        <SplashStickers />
      </div>
      {/*
       * 待たせていることは、間が長くなったときだけ文字で言う。
       * 文字が入る前から場所を持たせ、あとから読み上げへ届くようにする。
       */}
      <p className={styles.hint} role="status">
        {hint ? <span className={styles.hintText}>じゅんびしています…</span> : null}
      </p>
    </main>
  )
}
