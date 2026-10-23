import type { ReactNode } from 'react';

export interface IconProps {
  /** Sizing and color utilities. Icons inherit `currentColor`. */
  readonly className?: string;
}

interface IconBaseProps extends IconProps {
  readonly children: ReactNode;
}

/** Shared outline-icon shell. Every icon is decorative, so it is hidden from assistive tech. */
function IconBase({ children, className = 'h-6 w-6' }: IconBaseProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </IconBase>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 20.2 4.9 13a4.4 4.4 0 0 1 0-6.2 4.4 4.4 0 0 1 6.2 0l.9.9.9-.9a4.4 4.4 0 0 1 6.2 0 4.4 4.4 0 0 1 0 6.2L12 20.2Z" />
    </IconBase>
  );
}

export function SunriseIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 3v2.5M4.9 6.4l1.8 1.8M19.1 6.4l-1.8 1.8M2.5 16h3M18.5 16h3M8 16a4 4 0 0 1 8 0" />
      <path d="M3.5 20h17" />
    </IconBase>
  );
}

export function CupIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4.5 9h12v5.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5V9Z" />
      <path d="M16.5 10.5h1.8a2.6 2.6 0 0 1 0 5.2h-1.8" />
      <path d="M8 3.2v2.4M12 3.2v2.4" />
    </IconBase>
  );
}

export function MapPinIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </IconBase>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M7.2 3.8h2.3l1.4 3.6-1.9 1.4a11.5 11.5 0 0 0 4.8 4.8l1.4-1.9 3.6 1.4v2.3a2.4 2.4 0 0 1-2.6 2.4A14.6 14.6 0 0 1 4.8 6.4a2.4 2.4 0 0 1 2.4-2.6Z" />
    </IconBase>
  );
}

export function ShipIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4.8 13.4 12 11l7.2 2.4-1.7 5.1a2 2 0 0 1-1.9 1.3H8.4a2 2 0 0 1-1.9-1.3l-1.7-5.1Z" />
      <path d="M8 11.6V7.2h8v4.4" />
      <path d="M12 7.2V4" />
    </IconBase>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M20 12.5a7.5 7.5 0 0 1-7.5 7.5H5.4L4 21.2v-3.4A7.5 7.5 0 0 1 12.5 5 7.5 7.5 0 0 1 20 12.5Z" />
      <path d="M9 11.5h7M9 14.8h4.5" />
    </IconBase>
  );
}

export function QuoteMarkIcon({ className = 'h-8 w-8' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M9.4 5.2 10.8 7C9 8.1 8.2 9.5 8.2 11.4h3V19H4.6v-6.4c0-3.4 1.6-5.9 4.8-7.4Zm9.2 0L20 7c-1.8 1.1-2.6 2.5-2.6 4.4h3V19h-6.6v-6.4c0-3.4 1.6-5.9 4.8-7.4Z" />
    </svg>
  );
}
