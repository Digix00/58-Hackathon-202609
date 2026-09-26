import { useId } from 'react'
import styles from './QiiteLogo.module.css'

/**
 * Qiite の題字。
 *
 * アプリの名前を、書体ではなくクレヨンで書いた一枚の絵として持つ。書体で組むと、
 * 端末に載っている丸ゴシックの出来にアプリの顔が左右され、iOS と Android で
 * 別の名前のように見える。字の形をこちらで持てば、どの端末でも同じ手が書く。
 *
 * 作法は表紙の絵（feed/CoverArt）と起動画面のクレヨン（splash/CrayonMark）に合わせる。
 * 素直な線で置き、揺らぎと砂目はフィルタに任せ、色はトークンから取る。
 * ただしフィルタはこのファイルの中に持つ。題字は 96px から 16px まで同じ形で出るので、
 * 画面用に調整された #crayon-edge-fine（24四方の絵向け）では、周期が字の中を
 * 何度も横切って線がうねる。
 *
 * 字は1字ずつ傾け、ベースラインも上下させる。まっすぐ並べると、手で書いた線の
 * ゆらぎだけが残って「かすれた印刷」に見える。傾きは3度まで。これを超えると、
 * 崩した字を狙ったように見えて、名前が読みにくくなる。
 *
 * 同じ絵を静的ファイルとしても持つ（public/logo.svg）。あちらは OGP や外部資料の
 * ための一枚で、色も形もここと同じ値を写してある。片方を直したらもう片方も直す。
 */

/** Q の輪。文字の中でここだけ薄い紫にして、名前の頭を目で拾えるようにする。 */
const Q_BOWL = 'M76 58c0 17-11 31-25 31S26 75 26 58s11-31 25-31 25 14 25 31Z'

/** Q のしっぽ。輪の内側から出して、題字の下の波線へ渡す。 */
const Q_TAIL = 'M64 74c8 11 14 21 22 29'

const I_STEM_LEFT = 'M106 56v36'
const I_STEM_RIGHT = 'M134 56v36'

/** t は下端を右へ流す。縦棒と横棒だけで組むと、字ではなく記号に見える。 */
const T_STEM = 'M164 30v52c0 6 4 9 11 8'
const T_BAR = 'M150 54h30'

/** e は一筆で書く。中棒から入り、上を回って、右下へ抜ける。 */
const E = 'M196 73h39c1-16-16-23-29-15-14 8-15 27-1 32 10 4 23 2 31-6'

/**
 * 題字の下の波線。
 *
 * 表紙の題字が持っていた text-decoration: underline wavy の代わりに、Q のしっぽが
 * そのまま渡っていく線として持つ。起動画面だけは、この線をクレヨンが引く過程を
 * 見せるため、波線を自分で持っている（splash/SplashScreen の TitleRule）。
 */
const WAVE = 'M86 110c6-9 12-9 18 0s12 9 18 0 12-9 18 0 12 9 18 0 12-9 18 0 12 9 18 0 12-9 18 0'

/** 波線を含む枠と、含まない枠。含まないときは下の余白を残さない。 */
const VIEW_BOX_WITH_WAVE = '12 18 276 106'
const VIEW_BOX_WORD_ONLY = '12 18 276 84'

type QiiteLogoProps = {
  className?: string
  /** 波線を描くか。起動画面はクレヨンが引くので、こちらでは描かない。 */
  wave?: boolean
}

/**
 * Intent: アプリ名を、どの端末でも同じクレヨンの字で出す。
 * Boundary: 大きさと配置は呼び出し側の CSS が決める。ここは字と色だけを持つ。
 * Composition: 起動画面の題字、フィードの表紙の題字に置く。
 */
export function QiiteLogo({ className, wave = true }: QiiteLogoProps) {
  // フィルタは同じ文書内の id でしか引けない。同じ画面に2つ置いても衝突させない。
  const filterId = `qiite-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      className={`${styles.logo} ${className ?? ''}`}
      viewBox={wave ? VIEW_BOX_WITH_WAVE : VIEW_BOX_WORD_ONLY}
      role="img"
      aria-label="Qiite"
      focusable="false"
    >
      <defs>
        {/*
         * クレヨンの揺らぎと砂目。
         *
         * 揺らぎ（feDisplacementMap）は線の太さの3分の1までにする。これ以上かけると、
         * 平行な2辺を持つ字の軸がうねって、別の字に見える。
         * 砂目（feComposite operator="out"）は横に伸ばし、抜く濃さを45%で止める。
         * 完全に抜くと、小さく置いたときに線が点線へ割れて読めなくなる。
         */}
        <filter id={filterId} x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="2"
            seed="11"
            result="wobble"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="wobble"
            scale="3"
            xChannelSelector="R"
            yChannelSelector="G"
            result="wobbled"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.3 0.52"
            numOctaves="3"
            seed="5"
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 3 0 0 -1.55"
            result="grainAlpha"
          />
          <feComponentTransfer in="grainAlpha" result="grainMask">
            <feFuncA type="table" tableValues="0 0.45" />
          </feComponentTransfer>
          <feComposite in="wobbled" in2="grainMask" operator="out" />
        </filter>
      </defs>

      <g className={styles.ink} filter={`url(#${filterId})`}>
        <g transform="rotate(-3 51 58)">
          <path className={styles.head} d={Q_BOWL} />
          <path className={styles.headTail} d={Q_TAIL} />
        </g>
        <g transform="translate(0 -1.5) rotate(3 106 74)">
          <path className={styles.stroke} d={I_STEM_LEFT} />
          <circle className={styles.dot} cx="106" cy="38" r="6" />
        </g>
        <g transform="translate(0 1.5) rotate(-2.5 134 74)">
          <path className={styles.stroke} d={I_STEM_RIGHT} />
          {/* 点をひとつだけ山吹にする。表紙の太陽と同じ色で、書いた手のごきげんを残す。 */}
          <circle className={styles.dotAccent} cx="134" cy="38" r="6" />
        </g>
        <g transform="translate(0 -1) rotate(2 165 60)">
          <path className={styles.stroke} d={T_STEM} />
          <path className={styles.stroke} d={T_BAR} />
        </g>
        <g transform="translate(0 -1) rotate(-3 215 73)">
          <path className={styles.stroke} d={E} />
        </g>
        {wave ? <path className={styles.wave} d={WAVE} /> : null}
      </g>
    </svg>
  )
}
