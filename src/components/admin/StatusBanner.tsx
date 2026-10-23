'use client';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export interface StatusMessage {
  readonly tone: StatusTone;
  readonly text: string;
}

export interface StatusBannerProps {
  /** `null` renders the (empty) live region only, so announcements always have a home. */
  readonly status: StatusMessage | null;
  readonly onDismiss: () => void;
  readonly className?: string;
}

const TONES: Record<StatusTone, { readonly box: string; readonly dot: string }> = {
  success: { box: 'bg-spruce/10 ring-spruce/40 text-spruce-deep', dot: 'bg-spruce' },
  error: { box: 'bg-fireweed/10 ring-fireweed/40 text-fireweed-deep', dot: 'bg-fireweed' },
  warning: { box: 'bg-wheat/25 ring-honey/60 text-bark', dot: 'bg-honey' },
  info: { box: 'bg-sky/40 ring-blueberry/30 text-bark', dot: 'bg-blueberry' },
};

/**
 * The editor's one status voice. The `role="status"` live region is always mounted (screen
 * readers only announce content added to an existing region), and every publish/restore/load
 * outcome speaks through it.
 */
export function StatusBanner({ status, onDismiss, className = '' }: StatusBannerProps) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {status ? (
        <div
          className={`flex items-start gap-3 rounded-2xl p-4 ring-1 ${TONES[status.tone].box}`.trim()}
        >
          <span
            aria-hidden="true"
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${TONES[status.tone].dot}`}
          />
          <p className="flex-1 font-semibold">{status.text}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss this message"
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-current transition-colors duration-150 hover:bg-bark/10"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
