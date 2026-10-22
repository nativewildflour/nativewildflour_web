'use client';

import type { CopyIssue } from '@/lib/copy-rules';

export interface IssuesPanelProps {
  /** Live validator issues for the current draft. */
  readonly issues: readonly CopyIssue[];
  /** Issues the server returned from a rejected publish, shown until the next edit. */
  readonly serverIssues: readonly CopyIssue[];
  /**
   * Turns a validator path into a label the owner can read — the document knows its own
   * names, e.g. `sections[2].items[0].name` → `House-Baked Goods · item 1 · name`.
   */
  readonly describePath: (path: string) => string;
  /** Focus the field the issue points at. */
  readonly onSelect: (path: string) => void;
  readonly className?: string;
}

function IssueList({
  heading,
  issues,
  describePath,
  onSelect,
}: {
  readonly heading: string | null;
  readonly issues: readonly CopyIssue[];
  readonly describePath: (path: string) => string;
  readonly onSelect: (path: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <>
      {heading ? <h4 className="mt-4 text-sm font-bold text-bark/70">{heading}</h4> : null}
      <ul className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            {issue.path === '' ? (
              // Path-less issues (e.g. the server's "this changed while you were saving"
              // answer) point at no field, so there is nothing to focus — plain message.
              <div className="rounded-xl border border-fireweed/30 bg-snow p-3">
                <span className="block text-sm text-bark/85">{issue.message}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(issue.path)}
                className="w-full cursor-pointer rounded-xl border border-fireweed/30 bg-snow p-3 text-left transition-colors duration-150 hover:border-fireweed hover:bg-fireweed/5"
              >
                <span className="block text-xs font-bold tracking-wide text-fireweed-deep uppercase">
                  {describePath(issue.path)}
                </span>
                <span className="mt-0.5 block text-sm text-bark/85">{issue.message}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Live validation results. Every entry is a button that focuses the offending field, and the
 * panel doubles as the reason the Publish button is disabled — same list, same order.
 */
export function IssuesPanel({
  issues,
  serverIssues,
  describePath,
  onSelect,
  className = '',
}: IssuesPanelProps) {
  const total = issues.length + serverIssues.length;

  if (total === 0) {
    return (
      <section aria-label="Checks" className={`rounded-2xl bg-spruce/10 p-4 ring-1 ring-spruce/30 ${className}`.trim()}>
        <p className="flex items-center gap-2.5 font-bold text-spruce-deep">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
          Everything checks out — ready to publish.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Checks"
      className={`rounded-2xl bg-fireweed/5 p-4 ring-1 ring-fireweed/30 ${className}`.trim()}
    >
      <h3 className="font-black text-bark">
        {total === 1 ? '1 thing to fix before publishing' : `${total} things to fix before publishing`}
      </h3>
      <p className="mt-1 text-sm text-bark/70">Select one to jump to the field it points at.</p>
      <IssueList heading={null} issues={issues} describePath={describePath} onSelect={onSelect} />
      <IssueList
        heading="Reported by the server on the last publish"
        issues={serverIssues}
        describePath={describePath}
        onSelect={onSelect}
      />
    </section>
  );
}
