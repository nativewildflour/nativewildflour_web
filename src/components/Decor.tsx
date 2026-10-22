/**
 * Decorative inline SVGs shared across the site. All are `aria-hidden`:
 * they carry brand character, never meaning.
 *
 * - `RidgeDivider` — the Skagway skyline as a band between two section tones.
 * - `FireweedSprig` — a small fireweed stem, the site's recurring flourish.
 * - `TitleStroke` — a short hand-drawn honey stroke under headings.
 */

export interface DecorProps {
  readonly className?: string;
}

export interface RidgeDividerProps extends DecorProps {
  /** Flip upside-down when the ridge should point at the section above. */
  readonly flip?: boolean;
}

/**
 * A jagged mountain ridge, two layers deep. Color contract: set the *upper*
 * section's tone as `bg-*` and the *lower* section's tone as `text-*` —
 * the paths fill with `currentColor`, so the ridge reads as the lower
 * section's skyline rising into the upper one.
 */
export function RidgeDivider({ className = '', flip = false }: RidgeDividerProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 88"
      preserveAspectRatio="none"
      className={`block h-10 w-full sm:h-14 ${flip ? 'rotate-180' : ''} ${className}`.trim()}
    >
      <path
        d="M0 88 L0 50 L160 24 L300 48 L460 16 L620 46 L780 20 L940 50 L1100 26 L1240 50 L1440 28 L1440 88 Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M0 88 L0 64 L120 42 L240 58 L360 30 L480 54 L600 26 L760 56 L880 36 L1020 60 L1140 40 L1260 58 L1360 46 L1440 60 L1440 88 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export interface FireweedSprigProps extends DecorProps {
  /**
   * Play the bloom entrance once on load: the stem draws upward, the leaves
   * unfurl, the blossoms pop open (see `.sprig-bloom` in globals.css). Reserve
   * it for the one sprig a page leads with — the hero motto, the 404 mark.
   */
  readonly bloom?: boolean;
}

/** A small fireweed stem — spruce leaves, fireweed blooms. Skagway's summer flower. */
export function FireweedSprig({ className = 'h-8 w-6', bloom = false }: FireweedSprigProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 32"
      fill="none"
      className={`${bloom ? 'sprig-bloom ' : ''}${className}`}
    >
      <path
        d="M12 30.5 C11 23 11 15 12.2 6"
        className="sprig-stem"
        pathLength={1}
        stroke="var(--color-spruce)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11.6 23.5 C8.6 22.8 6.8 20.6 6.3 17.8 C9.5 18.6 11.2 20.6 11.6 23.5 Z"
        className="sprig-leaf"
        fill="var(--color-spruce)"
        opacity="0.75"
      />
      <path
        d="M12.1 19.5 C15 18.8 16.8 16.6 17.3 13.8 C14.1 14.6 12.5 16.6 12.1 19.5 Z"
        className="sprig-leaf"
        fill="var(--color-spruce)"
        opacity="0.75"
      />
      <ellipse className="sprig-flower" cx="12.4" cy="4" rx="1.7" ry="2.3" fill="var(--color-fireweed)" />
      <ellipse className="sprig-flower" cx="9.4" cy="7.4" rx="2" ry="2.4" fill="var(--color-fireweed)" opacity="0.9" />
      <ellipse className="sprig-flower" cx="15.2" cy="8" rx="2" ry="2.4" fill="var(--color-fireweed)" opacity="0.9" />
      <ellipse className="sprig-flower" cx="10.6" cy="11.4" rx="2.1" ry="2.5" fill="var(--color-fireweed)" opacity="0.8" />
      <ellipse className="sprig-flower" cx="14.2" cy="12.2" rx="1.9" ry="2.3" fill="var(--color-fireweed)" opacity="0.8" />
    </svg>
  );
}

export interface TitleStrokeProps extends DecorProps {
  /**
   * Draw the stroke in on load (see `.stroke-draw` in globals.css). Reserve it
   * for the stroke under a page `<h1>` — section strokes stay still.
   */
  readonly draw?: boolean;
}

/** A short, slightly bowed underline stroke. Defaults to honey; tint via `text-*`. */
export function TitleStroke({ className = 'mt-3 h-2 w-24 text-honey', draw = false }: TitleStrokeProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 8"
      fill="none"
      className={`block ${draw ? 'stroke-draw ' : ''}${className}`.trim()}
    >
      <path
        d="M2 6 C 30 2, 62 2, 118 4"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
