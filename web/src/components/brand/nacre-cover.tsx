import { PauseOffscreen } from "@/components/motion/pause-offscreen";
import { cn } from "@/lib/utils";

/**
 * « Nacre » — BeautIzzy's default cover and ambient material.
 *
 * One composition for every page — pearl base, lilac and violet light, two
 * veils, two petals that echo the BeautIzzy mark, pearl hairlines — drawn
 * with gradients only: no <filter>, no blur, no image, no text, no request.
 * Every colour is a brand token (src/styles/tokens.css); only opacities and
 * geometry are new. Decorative: hidden from assistive technologies.
 *
 * Server-rendered; the motion lives in src/styles/nacre.css (transform and
 * opacity of five layers, a 28 s seamless loop, none under reduced motion)
 * and the only script is `PauseOffscreen`. `idPrefix` keeps the gradient ids
 * of two covers on one page apart.
 */
export function NacreCover({
  animated = true,
  idPrefix = "nacre",
  className,
}: {
  /** False under a published photo: the artwork then only shows if the photo fails. */
  animated?: boolean;
  idPrefix?: string;
  className?: string;
}) {
  const p = idPrefix;
  return (
    <div aria-hidden="true" data-animated={animated ? "true" : "false"} className={cn("nacre", className)}>
      <div className="nacre-stage">
        <div className="nacre-layer nacre-pools">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
            <defs>
              <Radial id={`${p}-lilac`} color={L200} opacity={1} />
              <Radial id={`${p}-lilac-soft`} color={L200} opacity={0.75} />
              <Radial id={`${p}-pearl`} color={W} opacity={1} />
            </defs>
            <ellipse cx="300" cy="230" rx="700" ry="470" fill={`url(#${p}-lilac)`} />
            <ellipse cx="760" cy="470" rx="520" ry="300" fill={`url(#${p}-lilac-soft)`} />
            <ellipse cx="980" cy="110" rx="620" ry="280" fill={`url(#${p}-pearl)`} />
          </svg>
        </div>
        <div className="nacre-layer nacre-depth">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
            <defs>
              <Radial id={`${p}-violet`} color={ACCENT} opacity={0.34} />
              <Radial id={`${p}-deep`} color={L700} opacity={0.34} />
            </defs>
            <ellipse cx="1300" cy="590" rx="620" ry="430" fill={`url(#${p}-violet)`} />
            <ellipse cx="1570" cy="860" rx="480" ry="320" fill={`url(#${p}-deep)`} />
          </svg>
        </div>
        <div className="nacre-layer nacre-back">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
            <defs>
              <linearGradient id={`${p}-veil-back`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={L200} stopOpacity="0.15" />
                <stop offset="0.5" stopColor={L200} stopOpacity="0.7" />
                <stop offset="1" stopColor={ACCENT} stopOpacity="0.26" />
              </linearGradient>
              <linearGradient id={`${p}-petal-b`} x1="0.5" y1="0" x2="0.5" y2="1">
                <stop offset="0" stopColor={L100} stopOpacity="0" />
                <stop offset="0.35" stopColor={L200} stopOpacity="0.7" />
                <stop offset="0.75" stopColor={ACCENT} stopOpacity="0.32" />
                <stop offset="1" stopColor={L700} stopOpacity="0.46" />
              </linearGradient>
              <Hairline id={`${p}-line-b`} />
            </defs>
            <path d={BACK_VEIL} fill={`url(#${p}-veil-back)`} />
            <path d={BACK_VEIL_TOP} fill="none" stroke={W} strokeOpacity="0.75" strokeWidth="1.4" />
            <path d={BACK_VEIL_BOTTOM} fill="none" stroke={L700} strokeOpacity="0.1" strokeWidth="1.2" />
            <g transform="translate(905 590) rotate(-38) scale(0.7)">
              <path d={PETAL} fill={`url(#${p}-petal-b)`} />
              <path d="M-40 -170C-120 -80 -150 30 -138 130" fill="none" stroke={`url(#${p}-line-b)`} strokeWidth="2.4" strokeLinecap="round" />
            </g>
          </svg>
        </div>
        <div className="nacre-layer nacre-front">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
            <defs>
              <linearGradient id={`${p}-petal-a`} x1="0.5" y1="0" x2="0.5" y2="1">
                <stop offset="0" stopColor={W} stopOpacity="0" />
                <stop offset="0.3" stopColor={W} stopOpacity="0.75" />
                <stop offset="0.68" stopColor={L200} stopOpacity="0.8" />
                <stop offset="1" stopColor={ACCENT} stopOpacity="0.42" />
              </linearGradient>
              <Hairline id={`${p}-line-a`} />
              <linearGradient id={`${p}-veil`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={W} stopOpacity="0" />
                <stop offset="0.4" stopColor={W} stopOpacity="0.85" />
                <stop offset="1" stopColor={L200} stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id={`${p}-sheen`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={W} stopOpacity="0" />
                <stop offset="0.5" stopColor={W} stopOpacity="0.95" />
                <stop offset="1" stopColor={W} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g transform="translate(1235 455) rotate(-30)">
              <path d={PETAL} fill={`url(#${p}-petal-a)`} />
              <path d="M-36 -190C-116 -96 -148 20 -138 128" fill="none" stroke={`url(#${p}-line-a)`} strokeWidth="2" strokeLinecap="round" />
            </g>
            <path d={FRONT_VEIL} fill={`url(#${p}-veil)`} />
            <path d={FRONT_VEIL_TOP} fill="none" stroke={`url(#${p}-sheen)`} strokeWidth="2" />
          </svg>
        </div>
        <div className="nacre-layer nacre-glint" />
      </div>
      <div className="nacre-fade" />
      {animated ? <PauseOffscreen /> : null}
    </div>
  );
}

// Brand tokens (tokens.css): pearl, lavender-100 / 200 / 700, accent.
const W = "#FFFFFF";
const L100 = "#EFE9FD";
const L200 = "#E1D6F9";
const L700 = "#654199";
const ACCENT = "#7354C7";

/** A symmetric teardrop pointing up, drawn around (0, 0): each petal places it with a transform. */
const PETAL = "M0 -300C70 -220 170 -90 170 70C170 170 95 250 0 250C-95 250 -170 170 -170 70C-170 -90 -70 -220 0 -300Z";
const BACK_VEIL = "M-40 372C300 290 610 446 905 368C1182 294 1398 206 1640 254L1640 312C1404 270 1196 360 916 432C628 506 304 386 -40 452Z";
const BACK_VEIL_TOP = "M-40 372C300 290 610 446 905 368C1182 294 1398 206 1640 254";
const BACK_VEIL_BOTTOM = "M-40 452C304 386 628 506 916 432C1196 360 1404 270 1640 312";
const FRONT_VEIL = "M-40 652C262 552 566 730 864 650C1122 580 1352 480 1640 530L1640 622C1356 580 1136 680 884 742C584 816 284 676 -40 754Z";
const FRONT_VEIL_TOP = "M-40 652C262 552 566 730 864 650C1122 580 1352 480 1640 530";

function Radial({ id, color, opacity }: { id: string; color: string; opacity: number }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity={opacity} />
      <stop offset="0.5" stopColor={color} stopOpacity={opacity * 0.62} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
}

function Hairline({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0" stopColor={W} stopOpacity="0" />
      <stop offset="0.45" stopColor={W} stopOpacity="0.95" />
      <stop offset="1" stopColor={W} stopOpacity="0" />
    </linearGradient>
  );
}
