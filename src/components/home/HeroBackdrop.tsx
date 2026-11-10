import { PlayTriangle } from '@/components/ui/PlayTriangle';
import './hero-backdrop.css';

// The four wave lines, top to bottom. The first and third are the lit edges of the two ribbons.
const WAVE_TOP = 'M-20 70C90 190 175 340 330 300S490 140 580 150';
const WAVE_TOP_ECHO = 'M-20 150C80 280 190 400 335 350S505 220 580 250';
const WAVE_BOTTOM = 'M-20 470C85 400 175 540 300 530S475 420 580 470';
const WAVE_BOTTOM_ECHO = 'M-20 560C105 520 170 630 310 600S490 520 580 560';

// Every wave layer is the same drawing area, so the layers line up however the strip is sized.
const waveBox = {
  viewBox: '0 0 560 700',
  preserveAspectRatio: 'xMinYMid slice',
  focusable: false,
  className: 'hero-bd-waves',
} as const;

// Decorative backdrop of the home page hero, all in the strip to the left of the text: a
// navy-to-denim glow, two soft ribbons, four thin gold wave lines that drift slowly, and a
// floating play logo with gold orbit rings. The styles, the motion (off under reduced motion) and
// the note on text contrast are in hero-backdrop.css. The parent must be `relative isolate`.
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="hero-bd">
      <div className="hero-bd-art">
        <svg focusable="false" className="hero-bd-defs">
          <defs>
            <linearGradient id="hero-bd-streak" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="560" y2="0">
              <stop offset="0" className="hero-bd-streak-dim" />
              <stop offset="0.28" className="hero-bd-streak-gold" />
              <stop offset="0.4" className="hero-bd-streak-hot" />
              <stop offset="0.62" className="hero-bd-streak-gold" />
              <stop offset="1" className="hero-bd-streak-end" />
            </linearGradient>
            <linearGradient id="hero-bd-ribbon-top-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="340">
              <stop offset="0" className="hero-bd-ribbon-clear" />
              <stop offset="1" className="hero-bd-ribbon-lit" />
            </linearGradient>
            <linearGradient id="hero-bd-ribbon-bottom-fill" gradientUnits="userSpaceOnUse" x1="0" y1="400" x2="0" y2="700">
              <stop offset="0" className="hero-bd-ribbon-lit" />
              <stop offset="1" className="hero-bd-ribbon-clear" />
            </linearGradient>
          </defs>
        </svg>

        <div className="hero-bd-wave hero-bd-wave-a">
          <svg {...waveBox}>
            <path d={`${WAVE_TOP}L580 -20L-20 -20Z`} className="hero-bd-ribbon-top" />
            <path d={WAVE_TOP} className="hero-bd-halo" />
            <path d={WAVE_TOP} className="hero-bd-line" />
          </svg>
          {/* The travelling highlight has its own drawing, so the wave under it is not repainted. */}
          <svg {...waveBox}>
            <path d={WAVE_TOP} pathLength={1} className="hero-bd-glint" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-b">
          <svg {...waveBox}>
            <path d={WAVE_TOP_ECHO} className="hero-bd-line hero-bd-line-faint" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-c">
          <svg {...waveBox}>
            <path d={`${WAVE_BOTTOM}L580 720L-20 720Z`} className="hero-bd-ribbon-bottom" />
            <path d={WAVE_BOTTOM} className="hero-bd-halo" />
            <path d={WAVE_BOTTOM} className="hero-bd-line" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-d">
          <svg {...waveBox}>
            <path d={WAVE_BOTTOM_ECHO} className="hero-bd-line hero-bd-line-faint" />
          </svg>
        </div>
      </div>

      <div className="hero-bd-stage">
        <div className="hero-bd-logo">
          <div className="hero-bd-logo-float">
            <span className="hero-bd-logo-glow" />
            <OrbitRing size="outer" />
            <OrbitRing size="inner" />
            <div className="hero-bd-logo-body">
              <span className="hero-bd-logo-side" />
              <span className="hero-bd-logo-face">
                <PlayTriangle className="hero-bd-logo-play" />
              </span>
            </div>
            <OrbitRing size="outer" front />
            <OrbitRing size="inner" front />
          </div>
        </div>
      </div>
    </div>
  );
}

// One orbit ring. The `front` copy is only the lower half, drawn over the logo.
function OrbitRing({ size, front = false }: { size: 'inner' | 'outer'; front?: boolean }) {
  return (
    <span className={`hero-bd-ring hero-bd-ring-${size} ${front ? 'hero-bd-ring-front' : ''}`}>
      <span className="hero-bd-ring-arc" />
    </span>
  );
}
