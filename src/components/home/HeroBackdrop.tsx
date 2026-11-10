import './hero-backdrop.css';

// The four wave lines, top to bottom. The first and third are the lit edges of the two ribbons.
const WAVE_TOP = 'M-20 70C90 190 175 340 330 300S490 140 580 150';
const WAVE_TOP_ECHO = 'M-20 150C80 280 190 400 335 350S505 220 580 250';
const WAVE_BOTTOM = 'M-20 470C85 400 175 540 300 530S475 420 580 470';
const WAVE_BOTTOM_ECHO = 'M-20 560C105 520 170 630 310 600S490 520 580 560';

// Decorative backdrop of the home page hero: a navy-to-denim glow, two soft ribbons and four thin
// gold wave lines, all in the strip to the left of the text. Phase A is static; the styles (and
// the note on text contrast) are in hero-backdrop.css. The parent must be `relative isolate`.
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="hero-bd">
      <div className="hero-bd-art">
        <svg viewBox="0 0 560 700" preserveAspectRatio="xMinYMid slice" focusable="false" className="hero-bd-waves">
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

          <path d={`${WAVE_TOP}L580 -20L-20 -20Z`} className="hero-bd-ribbon-top" />
          <path d={`${WAVE_BOTTOM}L580 720L-20 720Z`} className="hero-bd-ribbon-bottom" />

          <path d={WAVE_TOP} className="hero-bd-halo" />
          <path d={WAVE_TOP} className="hero-bd-line" />
          <path d={WAVE_TOP_ECHO} className="hero-bd-line hero-bd-line-faint" />
          <path d={WAVE_BOTTOM} className="hero-bd-halo" />
          <path d={WAVE_BOTTOM} className="hero-bd-line" />
          <path d={WAVE_BOTTOM_ECHO} className="hero-bd-line hero-bd-line-faint" />
        </svg>
      </div>
    </div>
  );
}
