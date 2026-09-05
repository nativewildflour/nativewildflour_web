'use client';

import type { ReactNode } from 'react';

export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'subtle';
export type ActionSize = 'sm' | 'md';

export interface ActionButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  /**
   * `primary` = blueberry, `secondary` = outlined bark, `danger` = fireweed,
   * `subtle` = quiet text button for in-card controls.
   */
  readonly variant?: ActionVariant;
  readonly size?: ActionSize;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
  /** Tooltip, e.g. a keyboard-shortcut hint. */
  readonly title?: string;
  /** For disclosure buttons (e.g. the small-screen preview toggle). */
  readonly ariaExpanded?: boolean;
  readonly ariaControls?: string;
}

/**
 * The `<button>` twin of `ButtonLink`: same press mechanics (hard base shadow, lift on hover,
 * push-down on activation), same palette, always at least a 44px touch target.
 */
const BASE =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full font-bold ' +
  'transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 ' +
  'motion-safe:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ' +
  'disabled:shadow-none motion-safe:disabled:hover:translate-y-0';

const VARIANTS: Record<ActionVariant, string> = {
  primary:
    'bg-blueberry text-snow shadow-[0_3px_0_0_var(--color-blueberry-deep)] ' +
    'hover:bg-blueberry/90 hover:shadow-lift active:shadow-press',
  secondary:
    'border-2 border-bark bg-transparent text-bark ' +
    'hover:bg-bark hover:text-snow hover:shadow-card active:shadow-press disabled:hover:bg-transparent disabled:hover:text-bark',
  danger:
    'bg-fireweed text-snow shadow-[0_3px_0_0_var(--color-fireweed-deep)] ' +
    'hover:bg-fireweed/90 hover:shadow-lift active:shadow-press',
  subtle: 'bg-transparent text-blueberry hover:bg-blueberry/10 disabled:hover:bg-transparent',
};

const SIZES: Record<ActionSize, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
};

export function ActionButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ariaLabel,
  title,
  ariaExpanded,
  ariaControls,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps {
  /** Required: the icon alone carries no text, so the label is the accessible name. */
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: 'up' | 'down' | 'remove';
  readonly disabled?: boolean;
  /**
   * Deterministic id for focus management — reorder buttons carry the validator-style path
   * of their row (e.g. `move-up-sections[2].items[0]`) so the editor can refocus the
   * matching control at the destination after a move.
   */
  readonly id?: string;
  readonly className?: string;
}

const ICON_PATHS: Record<IconButtonProps['icon'], string> = {
  up: 'M12 19V5m0 0l-6 6m6-6l6 6',
  down: 'M12 5v14m0 0l6-6m-6 6l-6-6',
  remove: 'M6 6l12 12M18 6L6 18',
};

/** Small square control for reorder/remove rows. The remove icon shows in fireweed. */
export function IconButton({ label, onClick, icon, disabled = false, id, className = '' }: IconButtonProps) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-bark/15 bg-snow shadow-press transition-colors duration-150 hover:border-bark/40 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-bark/15 ${
        icon === 'remove' ? 'text-fireweed hover:bg-fireweed/10' : 'text-bark hover:bg-wheat/20'
      } ${className}`.trim()}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICON_PATHS[icon]} />
      </svg>
    </button>
  );
}
