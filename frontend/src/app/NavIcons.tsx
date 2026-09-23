import type { ReactNode } from 'react'
import styles from './AppShell.module.css'

/**
 * 下部ナビの手描きアイコン。
 *
 * 線は定規で引かず、クレヨンで二度なぞったものとして描く。
 * 本線の上に、細く薄い線（trace）をわずかにずらして重ねると、
 * 一筆で引ききれなかった跡に見える。閉じるアイコンと同じ作法。
 *
 * 輪郭の揺らぎは #crayon-edge に任せるため、形そのものは素直な線で置く。
 * アイコンは必ずラベルと一緒に使う。絵だけを操作にしない。
 */
export type NavIconName = 'read' | 'quiz' | 'post' | 'history' | 'settings'

const shapes: Record<NavIconName, ReactNode> = {
  // 開いた本。左右の紙が綴じ目から立ち上がる。
  read: (
    <>
      <path d="M12 7.3C9.5 5.4 6.8 5 4.1 5.8v11.3c2.7-.8 5.4-.4 7.9 1.5 2.5-1.9 5.2-2.3 7.9-1.5V5.8c-2.7-.8-5.4-.4-7.9 1.5Z" />
      <path d="M12 7.4v11.2" />
      <path
        className={styles.trace}
        d="M12 7.8C9.6 6 7 5.6 4.5 6.3v10.5c2.5-.7 5.1-.3 7.5 1.4 2.4-1.7 5-2.1 7.5-1.4V6.3c-2.5-.7-5.1-.3-7.5 1.5Z"
      />
    </>
  ),
  /*
   * 手紙。クイズは「1通ずつ読んで対応を選ぶ」体験なので、
   * ふきだしと「？」より、この画面の語彙に近い。
   * 問いかけの記号はこの大きさでは潰れて落書きに見えるため使わない。
   */
  quiz: (
    <>
      <path d="M3.9 6.1h16.2v11.8H3.9z" />
      <path d="M3.9 6.4 12 12.7l8.1-6.3" />
      <path className={styles.trace} d="M4.4 6.6h15.2v10.8H4.4z" />
    </>
  ),
  // えんぴつ。芯の側を下へ向け、書く姿勢で置く。
  post: (
    <>
      <path d="M4.9 19.3l1-4 10.3-10.2 3 3L8.9 18.3z" />
      <path d="M14.2 7l3 3" />
      <path className={styles.trace} d="M5.4 18.9l.9-3.6 9.9-9.8 2.6 2.6-9.8 9.9z" />
    </>
  ),
  // しおり。読んだ声のしるしとして、履歴の語彙に合わせる。
  history: (
    <>
      <path d="M6.7 4.3h10.6v15.9L12 16.4l-5.3 3.8z" />
      <path className={styles.trace} d="M7.1 4.7h9.8v14.7L12 15.9l-4.9 3.5z" />
    </>
  ),
  /*
   * 歯車。歯は6枚に留める。これ以上増やすとこの大きさでは潰れる。
   *
   * 歯車と太陽を分けるのは、輪の太さに対する歯の長さの比。
   * 細い輪に長い歯を生やすと、この大きさでは太陽の落書きになる。
   * 太陽は storybook の落書きで使っている絵なので、取り違えさせない。
   * 輪を絵の半径の半分まで太らせ、歯は輪に触れる短さに留める。
   */
  settings: (
    <>
      <path d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
      <path d="M19.2 12h2.1M4.8 12H2.7" />
      <path d="M15.6 5.8l1.1-1.8M8.4 18.2l-1.1 1.8" />
      <path d="M15.6 18.2l1.1 1.8M8.4 5.8L7.3 4" />
      <path className={styles.trace} d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" />
    </>
  ),
}

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg
      className={`${styles.navIcon}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#crayon-edge-fine)">{shapes[name]}</g>
    </svg>
  )
}
