'use client';

import { useEffect, useState } from 'react';

import type { DocumentKey, VersionEntry } from '@/components/admin/api';
import { loadVersions } from '@/components/admin/api';
import { ActionButton } from '@/components/admin/buttons';
import { formatWhen } from '@/components/admin/use-document-editor';

export interface VersionHistoryProps {
  /** Which document's history to list — snapshots are kept per document. */
  readonly doc: DocumentKey;
  /** Lowercase noun for the restore buttons' accessible names: "menu", "home page". */
  readonly label: string;
  /** False while the API is unreachable (plain `next dev`): the panel explains instead. */
  readonly enabled: boolean;
  /** Bump to refetch an open panel — the editor increments it after each publish/restore. */
  readonly reloadKey: number;
  /** Ask the editor to confirm and restore this snapshot. */
  readonly onRestore: (version: VersionEntry) => void;
  /** True while a publish/restore is in flight; restore buttons disable. */
  readonly busy: boolean;
  readonly className?: string;
}

type FetchState =
  /** Nothing fetched yet — rendered as loading whenever the panel is open. */
  | { readonly kind: 'idle' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly versions: readonly VersionEntry[] };

/**
 * Collapsed by default; fetches `/admin/api/content/<doc>/versions` on first open and again
 * whenever `reloadKey` changes, so the list stays current after a publish. Each saved version
 * offers Restore — the editor confirms before anything happens.
 */
export function VersionHistory({
  doc,
  label,
  enabled,
  reloadKey,
  onRestore,
  busy,
  className = '',
}: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    // No synchronous "loading" state: `idle` renders the same, and on a refetch the previous
    // list simply stays put until the fresh one lands.
    void loadVersions(doc).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        setState({ kind: 'ready', versions: result.versions });
      } else if (result.kind === 'unauthorized') {
        setState({ kind: 'error', message: 'Your sign-in expired — reload the page.' });
      } else {
        setState({ kind: 'error', message: 'The version list could not be loaded. Try again in a moment.' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, open, enabled, reloadKey]);

  return (
    <section aria-labelledby="version-history-heading" className={className}>
      <h3 id="version-history-heading" className="sr-only">
        Version history
      </h3>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="version-history-panel"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 font-bold text-bark transition-colors duration-150 hover:text-blueberry"
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
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`.trim()}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        Version history
      </button>

      <div id="version-history-panel" hidden={!open} className="mt-3">
        {!enabled ? (
          <p className="text-sm text-bark/70">
            Version history lives on the published site — it is not available from this preview
            server.
          </p>
        ) : state.kind === 'idle' ? (
          <p className="text-sm text-bark/70">Loading saved versions…</p>
        ) : state.kind === 'error' ? (
          <p className="text-sm font-semibold text-fireweed-deep">{state.message}</p>
        ) : state.versions.length === 0 ? (
          <p className="text-sm text-bark/70">
            No saved versions yet — one is kept each time you publish.
          </p>
        ) : (
          <ul className="space-y-2">
            {state.versions.map((version) => (
              <li
                key={version.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-snow p-3 ring-1 ring-bark/10"
              >
                <div>
                  <p className="font-bold text-bark">{formatWhen(version.updatedAt)}</p>
                  <p className="text-xs text-bark/75">Saved before the publish that replaced it</p>
                </div>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRestore(version)}
                  ariaLabel={`Restore the ${label} saved ${formatWhen(version.updatedAt)}`}
                >
                  Restore
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
