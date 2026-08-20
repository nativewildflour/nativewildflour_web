/**
 * Small decorative line icons for the `/directions/` page.
 * Every icon is `aria-hidden` — the surrounding text carries the meaning.
 */

export interface IconProps {
  readonly className?: string;
}

const BASE = 'shrink-0';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function frame(className: string) {
  return {
    viewBox: '0 0 24 24',
    className: `${BASE} ${className || 'size-5'}`.trim(),
    'aria-hidden': true,
    focusable: false,
  } as const;
}

/** Map pin. */
export function PinIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <path {...STROKE} d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle {...STROKE} cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Handset. */
export function PhoneIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <path
        {...STROKE}
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z"
      />
    </svg>
  );
}

/** Clock face. */
export function ClockIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Walking figure. */
export function WalkIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <circle {...STROKE} cx="13" cy="4.5" r="2" />
      <path {...STROKE} d="m9 21 2.5-5.5L9.5 13l1-4.5 3 1.5 2 3 2.5 1" />
      <path {...STROKE} d="m10.5 8.5-3 2L6 14" />
      <path {...STROKE} d="m11.5 15.5 2.5 2 .5 3.5" />
    </svg>
  );
}

/** Signpost, for orientation notes. */
export function SignpostIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <path {...STROKE} d="M12 3v18" />
      <path {...STROKE} d="M12 6h6.5l1.5 2.25L18.5 10.5H12Z" />
      <path {...STROKE} d="M12 13H5.5L4 15.25 5.5 17.5H12Z" />
    </svg>
  );
}

/** Shuttle bus, for the SMART shuttle card. */
export function ShuttleIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <rect {...STROKE} x="4" y="4.5" width="16" height="12" rx="2.5" />
      <path {...STROKE} d="M4 10h16" />
      <path {...STROKE} d="M7.5 16.5v2.5M16.5 16.5v2.5" />
      <circle {...STROKE} cx="8" cy="13.25" r="0.75" />
      <circle {...STROKE} cx="16" cy="13.25" r="0.75" />
    </svg>
  );
}

/** Compass rose, for the arrival notes. */
export function CompassIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="m15 9-1.75 4.25L9 15l1.75-4.25L15 9Z" />
    </svg>
  );
}

/** Check mark, for the visit tips. */
export function CheckIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <path {...STROKE} d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** Info circle, for the walking-time caveat. */
export function InfoIcon({ className = '' }: IconProps) {
  return (
    <svg {...frame(className)}>
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="M12 11v5.5" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}
