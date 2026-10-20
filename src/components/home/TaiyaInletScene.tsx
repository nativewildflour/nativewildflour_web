/**
 * The view down Taiya Inlet from Skagway: steep Coast Mountains on either side, the inlet
 * running away between them toward lower, snow-tipped peaks in the distance. Flat layers, back
 * to front — the far range (a glacier spilling off the tallest summit on the left), a nearer
 * blue-green range, the water, two rows of spruce, and a snow-white shore with fireweed that
 * runs straight into the section below.
 *
 * Every shape is plain geometry in the palette's own colors (see the `--color-peak-*` and
 * `--color-inlet` tokens), lit from the upper right where the hero's sun sits: each summit's
 * left face carries a translucent blueberry shadow and each snowcap a sky-blue one.
 *
 * Drawn on a 1920×400 canvas and scaled with `xMidYMax slice`, so it keeps its proportions at
 * any width: wide screens see the whole view, narrow ones its middle. The composition follows
 * the hero's layout — the tall massifs sit left and right, and the low valley falls behind the
 * text column (roughly x 860–1440 at every desktop width), so no summit rises behind the copy.
 * Nothing important lives above y≈60, the band the widest screens crop off the top.
 */

/** One decimal place is all the precision this canvas needs. */
const round = (value: number) => Math.round(value * 10) / 10;

/** Fixed, hand-tuned variation, so every render draws the identical treeline. */
const JITTER = [0, 9, -6, 4, -9, 7, -3];
const HEIGHT_STEPS = [0.78, 1, 0.66, 0.9, 0.72, 1.12, 0.84, 0.95, 0.7];

/** 0 at the center of the canvas, 1 at either edge — trees grow toward the edges to frame it. */
const edgeness = (x: number) => Math.abs(x - 960) / 960;

/**
 * A tiered spruce: four drooping branch tiers and a short trunk, symmetric about `x`.
 * Each pair is a branch tip or the notch above the next tier, as fractions of the tree's
 * width and height.
 */
const SPRUCE_OUTLINE: readonly (readonly [number, number])[] = [
  [0.16, 0.22],
  [0.07, 0.2],
  [0.3, 0.45],
  [0.13, 0.42],
  [0.44, 0.7],
  [0.19, 0.67],
  [0.56, 0.94],
  [0.05, 0.94],
  [0.05, 1],
];

function spruce(x: number, base: number, height: number): string {
  const top = base - height;
  const width = height * 0.36;
  const point = ([dx, dy]: readonly [number, number], side: 1 | -1) =>
    `L${round(x + side * dx * width)} ${round(top + dy * height)}`;
  const right = SPRUCE_OUTLINE.map((pair) => point(pair, 1));
  const left = [...SPRUCE_OUTLINE].reverse().map((pair) => point(pair, -1));
  return `M${round(x)} ${round(top)}${right.join('')}${left.join('')}Z`;
}

/** The near row, one tiered tree about every 44 units. */
const FRONT_TREES = Array.from({ length: 45 }, (_, index) => {
  const x = 12 + index * 44 + (JITTER[index % JITTER.length] ?? 0);
  const step = HEIGHT_STEPS[index % HEIGHT_STEPS.length] ?? 1;
  return spruce(x, 368, 44 * step * (0.8 + edgeness(x) * 0.7));
}).join('');

/** The far row: one serrated band of narrow spires, irregularly spaced, filled to the floor. */
const BACK_TREES = (() => {
  const base = 352;
  let path = `M0 ${base}`;
  for (let index = 0, x = 6; x < 1940; index += 1) {
    const step = HEIGHT_STEPS[(index * 4) % HEIGHT_STEPS.length] ?? 1;
    const height = 30 * step * (0.8 + edgeness(x) * 0.6);
    path += `L${round(x - 10)} ${base - 5}L${round(x)} ${round(base - height)}L${round(x + 10)} ${base - 5}`;
    // Floored, so an edit to JITTER can never stall the loop.
    x += Math.max(12, 26 + (JITTER[(index * 3) % JITTER.length] ?? 0) * 0.6);
  }
  return `${path}L1920 400L0 400Z`;
})();

/**
 * A fireweed spike: a slightly leaning stem, narrow leaves on its lower half, and a raceme of
 * blossoms up the top that shrink into darker buds at the tip — the site's fireweed sprig,
 * drawn at shoreline scale.
 */
function Fireweed({ x, height, lean }: { x: number; height: number; lean: number }) {
  const base = 392;
  const size = height / 100;
  /** A point on the stem, `t` from 0 (foot) to 1 (tip). */
  const at = (t: number) => ({
    x: x + lean * t * t,
    y: base - height * t,
  });
  const tip = at(1);
  const mid = at(0.5);
  const leaves = [0.24, 0.36, 0.48].map((t, index) => {
    const { x: sx, y: sy } = at(t);
    const side = index % 2 === 0 ? -1 : 1;
    const reach = 15 * size * side;
    return `M${round(sx)} ${round(sy)}Q${round(sx + reach * 0.45)} ${round(sy - 11 * size)} ${round(sx + reach)} ${round(sy - 13 * size)}Q${round(sx + reach * 0.5)} ${round(sy - 3 * size)} ${round(sx)} ${round(sy)}Z`;
  });
  const blossoms = Array.from({ length: 8 }, (_, index) => {
    const t = 0.56 + index * 0.06;
    const { x: bx, y: by } = at(t);
    const radius = (5.6 - index * 0.5) * size;
    const side = index % 2 === 0 ? -1 : 1;
    return {
      cx: round(bx + side * radius * 0.75),
      cy: round(by),
      rx: round(radius * 0.85),
      ry: round(radius),
      bud: index >= 6,
    };
  });

  return (
    <g>
      <path
        d={`M${x} ${base}Q${round(mid.x - lean * 0.25)} ${round(mid.y)} ${round(tip.x)} ${round(tip.y)}`}
        stroke="var(--color-spruce)"
        strokeWidth={round(2.6 * size)}
        strokeLinecap="round"
        fill="none"
      />
      <path d={leaves.join('')} fill="var(--color-spruce)" />
      {blossoms.map((blossom) => (
        <ellipse
          key={blossom.cy}
          cx={blossom.cx}
          cy={blossom.cy}
          rx={blossom.rx}
          ry={blossom.ry}
          fill={blossom.bud ? 'var(--color-fireweed-deep)' : 'var(--color-fireweed)'}
        />
      ))}
    </g>
  );
}

/**
 * Fireweed clumps on the shore: [x, height, lean]. The middle two clumps flank the logo badge
 * on phones, where it stands in front of the scene's center; the outer ones frame wide screens.
 */
const FIREWEED: readonly (readonly [number, number, number])[] = [
  [48, 96, -6],
  [82, 116, 4],
  [120, 84, 9],
  [158, 70, -3],
  [598, 66, -5],
  [628, 84, 5],
  [656, 58, 8],
  [1266, 72, -6],
  [1296, 90, 4],
  [1766, 92, -5],
  [1804, 114, 3],
  [1842, 80, 8],
  [1878, 98, -4],
];

/** A summit's shadowed left face and its snowcap, lit side then shaded side. */
interface Peak {
  readonly shadow: string;
  readonly snow: string;
  readonly snowShadow: string;
}

const FAR_PEAKS: readonly Peak[] = [
  {
    shadow: 'M190 120L110 195L120 320L175 320L186 190Z',
    snow: 'M190 120L232 148L220 154L210 145L198 160L186 147L172 156L158 150Z',
    snowShadow: 'M190 120L158 150L172 156L186 147L188 132Z',
  },
  {
    shadow: 'M360 95L300 140L290 320L345 320L354 180Z',
    snow: 'M360 95L396 128L384 134L374 124L364 140L352 127L338 136L320 125Z',
    snowShadow: 'M360 95L320 125L338 136L352 127L357 110Z',
  },
  {
    shadow: 'M560 62L470 130L450 320L535 320L552 170Z',
    // The tallest summit. Its snowfield runs over the col to the shoulder on its right and
    // feeds the glacier tongue that curls down between them.
    snow:
      'M560 62L620 110L660 100L692 128L680 134L668 124L654 138L640 128L630 142' +
      'L638 176L644 214L640 254L624 254L616 214L608 176L604 142' +
      'L592 132L580 146L568 128L552 140L540 122L524 132L503 105Z',
    snowShadow: 'M560 62L503 105L524 132L540 122L552 140L556 100Z',
  },
  {
    shadow: 'M1590 125L1520 200L1515 320L1575 320L1584 200Z',
    snow: 'M1590 125L1621 150L1610 156L1600 147L1590 162L1578 150L1568 158L1562 155Z',
    snowShadow: 'M1590 125L1562 155L1568 158L1578 150L1587 140Z',
  },
  {
    shadow: 'M1760 78L1690 150L1680 320L1745 320L1754 170Z',
    snow: 'M1760 78L1797 110L1786 116L1776 106L1766 122L1754 108L1742 118L1727 112Z',
    snowShadow: 'M1760 78L1727 112L1742 118L1754 108L1757 94Z',
  },
];

/** Snow on the far range's lesser tops: two shoulders and three distant peaks down the inlet. */
const FAR_MINOR_SNOW = [
  'M800 160L813 172L805 175L797 168L786 172L764 166Z',
  'M1870 118L1886 128L1878 132L1870 126L1860 131L1837 126Z',
  'M1010 214L1021 218L1012 221L1004 218L997 218Z',
  'M1250 222L1260 226L1252 228L1245 226L1239 226Z',
  'M1370 219L1381 224L1372 226L1364 223L1358 223Z',
];

const NEAR_SHADOWS = [
  'M200 196L120 240L130 330L190 330L195 240Z',
  'M450 226L390 250L395 330L445 330L447 262Z',
  'M1620 230L1560 262L1565 330L1615 330L1617 266Z',
  'M1760 210L1690 250L1695 330L1755 330L1757 250Z',
];

/** Sun glints on the water: [x, y, length]. */
const GLINTS: readonly (readonly [number, number, number])[] = [
  [230, 314, 70],
  [760, 320, 54],
  [980, 306, 110],
  [1180, 316, 70],
  [1400, 308, 96],
  [1700, 322, 50],
];

export interface TaiyaInletSceneProps {
  readonly className?: string;
}

export function TaiyaInletScene({ className = '' }: TaiyaInletSceneProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1920 400"
      preserveAspectRatio="xMidYMax slice"
      className={`pointer-events-none block ${className}`.trim()}
    >
      {/* The far range: a massif either side, lower peaks far down the inlet between them. */}
      <path
        d="M0 320L0 215L60 180L110 195L190 120L250 160L300 140L360 95L420 150L470 130L560 62L620 110L660 100L740 170L800 160L860 215L900 205L960 228L1010 214L1070 232L1130 220L1190 236L1250 222L1310 238L1370 219L1420 228L1470 190L1520 200L1590 125L1640 165L1690 150L1760 78L1820 130L1870 118L1920 150L1920 320Z"
        fill="var(--color-peak-far)"
      />
      <g fill="var(--color-blueberry)" opacity="0.14">
        {FAR_PEAKS.map((peak) => (
          <path key={peak.shadow} d={peak.shadow} />
        ))}
      </g>
      <g fill="var(--color-snow)">
        {FAR_PEAKS.map((peak) => (
          <path key={peak.snow} d={peak.snow} />
        ))}
        {FAR_MINOR_SNOW.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="var(--color-sky)">
        {FAR_PEAKS.map((peak) => (
          <path key={peak.snowShadow} d={peak.snowShadow} />
        ))}
        {/* The glacier tongue's shaded left edge. */}
        <path d="M604 142L608 176L616 214L624 254L631 254L626 214L620 176L616 142Z" />
      </g>
      {/* Ogives: the pressure bands that ripple across a glacier's tongue. */}
      <g stroke="var(--color-sky)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M609 172Q623 178 637 172" />
        <path d="M613 196Q627 202 641 196" />
        <path d="M618 222Q630 228 642 222" />
      </g>

      {/* The nearer range, high on the flanks and low where the inlet runs out of sight. */}
      <path
        d="M0 330L0 245L50 222L120 240L200 196L270 232L320 214L390 250L450 226L520 246L580 238L640 262L700 250L760 270L830 262L900 280L980 272L1060 284L1140 276L1220 286L1300 274L1380 282L1440 266L1500 248L1560 262L1620 230L1690 250L1760 210L1830 240L1880 226L1920 238L1920 330Z"
        fill="var(--color-peak-near)"
      />
      <g fill="var(--color-blueberry)" opacity="0.12">
        {NEAR_SHADOWS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Taiya Inlet: the far shore's shadow, then the sun on the water. */}
      <rect x="0" y="294" width="1920" height="62" fill="var(--color-inlet)" />
      <rect x="0" y="294" width="1920" height="5" fill="var(--color-peak-near)" opacity="0.45" />
      <g fill="var(--color-snow)" opacity="0.55">
        {GLINTS.map(([x, y, length]) => (
          <rect key={x} x={x} y={y} width={length} height="2" rx="1" />
        ))}
      </g>

      {/* Two rows of spruce along the near shore, taller toward the edges. */}
      <path d={BACK_TREES} fill="var(--color-spruce)" />
      <path d={FRONT_TREES} fill="var(--color-spruce-deep)" />

      {/* The shore, in the next section's snow white, so the scene runs straight into it. */}
      <path
        d="M0 372C240 360 420 380 700 373S1200 362 1440 372S1760 366 1920 370L1920 400L0 400Z"
        fill="var(--color-snow)"
      />
      {FIREWEED.map(([x, height, lean]) => (
        <Fireweed key={x} x={x} height={height} lean={lean} />
      ))}
    </svg>
  );
}
