import { PlayTriangle } from '@/components/ui/PlayTriangle';
import { HeroParallax } from './HeroParallax';
import './hero-backdrop.css';

// The four wave lines, top to bottom. The first and third are the lit edges of the two ribbons.
const WAVE_TOP = 'M-20 70C90 190 175 340 330 300S490 140 580 150';
const WAVE_TOP_ECHO = 'M-20 150C80 280 190 400 335 350S505 220 580 250';
const WAVE_BOTTOM = 'M-20 470C85 400 175 540 300 530S475 420 580 470';
const WAVE_BOTTOM_ECHO = 'M-20 560C105 520 170 630 310 600S490 520 580 560';

// Starts a wave further off the left edge, along its own direction, so a layer that drifts and
// follows the mouse never shows where the line begins.
const lead = (from: string, wave: string) => `M${from}L${wave.slice(1)}`;
const TOP = lead('-57 30', WAVE_TOP);
const TOP_ECHO = lead('-53 107', WAVE_TOP_ECHO);
const BOTTOM = lead('-56 494', WAVE_BOTTOM);
const BOTTOM_ECHO = lead('-58 572', WAVE_BOTTOM_ECHO);

// Every wave layer is the same drawing area, so the layers line up however the strip is sized.
const waveBox = {
  viewBox: '0 0 560 700',
  preserveAspectRatio: 'xMinYMid slice',
  focusable: false,
  className: 'hero-bd-waves',
} as const;

// The frame's curves, in a 1000 x 100 box stretched over a band along the hero's top or bottom
// edge. Each dips into the band at the two corners and runs out of sight along the middle.
const FRAME_TOP = 'M-40 78C140 74 300 6 500 8S860 74 1040 66';
const FRAME_TOP_ECHO = 'M-40 50C160 48 320 22 500 26S840 52 1040 40';
const FRAME_BOTTOM = 'M-40 30C150 24 310 94 500 92S850 28 1040 36';
const FRAME_BOTTOM_ECHO = 'M-40 56C170 60 330 76 500 72S830 46 1040 60';
// The soft ribbons: the space between a curve and its echo (the echo traced back from the right).
// They cross twice, so each ribbon twists, and it never touches the hero's edge.
const FRAME_TOP_RIBBON = `${FRAME_TOP}L1040 40C840 52 680 30 500 26C320 22 160 48 -40 50Z`;
const FRAME_BOTTOM_RIBBON = `${FRAME_BOTTOM}L1040 60C830 46 670 68 500 72C330 76 170 60 -40 56Z`;

const frameBox = {
  viewBox: '0 0 1000 100',
  preserveAspectRatio: 'none',
  focusable: false,
  className: 'hero-bd-frame-art',
} as const;

// Decorative backdrop of the home page hero. In the strip to the left of the text: a
// navy-to-denim glow, two soft ribbons, four thin gold wave lines that drift slowly, and a
// floating play logo with gold orbit rings. Along the top and bottom edges: a thin organic frame.
// Everything follows the mouse a little (HeroParallax). The styles, the motion (off under reduced
// motion) and the note on text contrast are in hero-backdrop.css. The parent must be
// `relative isolate`.
export function HeroBackdrop() {
  return (
    <HeroParallax>
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
          {/* Frame: bright at the two corners, almost nothing along the middle. */}
          <linearGradient id="hero-bd-frame-streak" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0" className="hero-bd-frame-edge" />
            <stop offset="0.12" className="hero-bd-streak-hot" />
            <stop offset="0.4" className="hero-bd-frame-mid" />
            <stop offset="0.6" className="hero-bd-frame-mid" />
            <stop offset="0.88" className="hero-bd-streak-hot" />
            <stop offset="1" className="hero-bd-frame-edge" />
          </linearGradient>
          <linearGradient id="hero-bd-frame-ribbon-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
            <stop offset="0" className="hero-bd-frame-ribbon-edge" />
            <stop offset="0.45" className="hero-bd-frame-ribbon-mid" />
            <stop offset="0.55" className="hero-bd-frame-ribbon-mid" />
            <stop offset="1" className="hero-bd-frame-ribbon-edge" />
          </linearGradient>
        </defs>
      </svg>

      <div className="hero-bd-art">
        <div className="hero-bd-wave hero-bd-wave-a">
          <svg {...waveBox}>
            <path d={`${TOP}L580 -60L-57 -60Z`} className="hero-bd-ribbon-top" />
            <path d={TOP} className="hero-bd-halo" />
            <path d={TOP} className="hero-bd-line" />
          </svg>
          {/* The travelling highlight has its own drawing, so the wave under it is not repainted. */}
          <svg {...waveBox}>
            <path d={WAVE_TOP} pathLength={1} className="hero-bd-glint" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-b">
          <svg {...waveBox}>
            <path d={TOP_ECHO} className="hero-bd-line hero-bd-line-faint" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-c">
          <svg {...waveBox}>
            <path d={`${BOTTOM}L580 760L-56 760Z`} className="hero-bd-ribbon-bottom" />
            <path d={BOTTOM} className="hero-bd-halo" />
            <path d={BOTTOM} className="hero-bd-line" />
          </svg>
        </div>
        <div className="hero-bd-wave hero-bd-wave-d">
          <svg {...waveBox}>
            <path d={BOTTOM_ECHO} className="hero-bd-line hero-bd-line-faint" />
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

      <div className="hero-bd-frame hero-bd-frame-top">
        <span className="hero-bd-corner hero-bd-corner-left" />
        <span className="hero-bd-corner hero-bd-corner-right" />
        <svg {...frameBox}>
          <path d={FRAME_TOP_RIBBON} className="hero-bd-frame-ribbon" />
          <path d={FRAME_TOP} className="hero-bd-frame-line" />
          <path d={FRAME_TOP_ECHO} className="hero-bd-frame-line hero-bd-frame-line-faint" />
        </svg>
      </div>
      <div className="hero-bd-frame hero-bd-frame-bottom">
        <span className="hero-bd-corner hero-bd-corner-left" />
        <span className="hero-bd-corner hero-bd-corner-right" />
        <svg {...frameBox}>
          <path d={FRAME_BOTTOM_RIBBON} className="hero-bd-frame-ribbon" />
          <path d={FRAME_BOTTOM} className="hero-bd-frame-line" />
          <path d={FRAME_BOTTOM_ECHO} className="hero-bd-frame-line hero-bd-frame-line-faint" />
        </svg>
      </div>
    </HeroParallax>
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
