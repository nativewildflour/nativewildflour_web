import Link from 'next/link';
import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'light';
export type ButtonSize = 'md' | 'lg';

export interface ButtonLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  /**
   * `primary` = blueberry, `secondary` = outlined bark, `accent` = fireweed,
   * `light` = snow-on-dark (only for dark panels).
   */
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Force the plain-anchor branch. Auto-detected for `http`, `tel:` and `mailto:` hrefs. */
  readonly external?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * The shared "press" mechanics: a hard 3px base shadow at rest, a slight lift
 * with a soft shadow on hover, and a physical push-down when activated.
 * Transforms are gated behind `motion-safe`.
 */
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-bold no-underline ' +
  'transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 ' +
  'motion-safe:active:translate-y-px';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-blueberry text-snow shadow-[0_3px_0_0_var(--color-blueberry-deep)] ' +
    'hover:bg-blueberry/90 hover:shadow-lift active:shadow-press',
  secondary:
    'border-2 border-bark bg-transparent text-bark ' +
    'hover:bg-bark hover:text-snow hover:shadow-card active:shadow-press',
  accent:
    'bg-fireweed text-snow shadow-[0_3px_0_0_var(--color-fireweed-deep)] ' +
    'hover:bg-fireweed/90 hover:shadow-lift active:shadow-press',
  light:
    'bg-snow text-blueberry shadow-[0_3px_0_0_color-mix(in_srgb,var(--color-bark)_25%,transparent)] ' +
    'hover:bg-cream hover:shadow-lift active:shadow-press',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3 text-lg',
};

function isExternalHref(href: string): boolean {
  return /^(https?:|tel:|mailto:)/i.test(href);
}

/** The one call-to-action link in the design system. Always at least a 44px touch target. */
export function ButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  external,
  className = '',
  ariaLabel,
}: ButtonLinkProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
  const treatAsExternal = external ?? isExternalHref(href);

  if (treatAsExternal) {
    const isHttp = /^https?:/i.test(href);
    return (
      <a
        href={href}
        className={classes}
        aria-label={ariaLabel}
        {...(isHttp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
