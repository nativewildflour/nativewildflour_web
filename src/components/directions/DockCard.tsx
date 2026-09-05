import type { Dock } from '@/lib/content/directions';

import { ClockIcon } from '@/components/directions/Icons';

export interface DockCardProps {
  readonly dock: Dock;
  readonly className?: string;
}

/**
 * One cruise dock: name, walking-time badge, one-line summary and the numbered
 * walk drawn as a dotted route line. Heading is an `h3` — the page supplies
 * the `h2` above it.
 */
export function DockCard({ dock, className = '' }: DockCardProps) {
  return (
    <article
      id={dock.id}
      className={`flex h-full flex-col rounded-3xl bg-snow p-6 shadow-card ring-1 ring-bark/10 transition duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lift ${className}`.trim()}
    >
      <h3 className="text-xl font-black text-bark sm:text-2xl">{dock.name}</h3>

      <p className="mt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky/60 px-3 py-1 text-sm font-bold text-bark">
          <ClockIcon className="size-4" />
          {dock.walkMinutes} walk
        </span>
      </p>

      <p className="mt-3 text-bark/80">{dock.summary}</p>

      {/* The dotted line runs behind the number badges, like a route on a map. */}
      <ol className="relative mt-5 space-y-4 border-t border-bark/10 pt-5 before:absolute before:top-7 before:bottom-3 before:left-3 before:border-l-2 before:border-dotted before:border-blueberry/30">
        {dock.steps.map((step, index) => (
          <li key={step} className="relative flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-blueberry text-sm font-bold text-snow ring-4 ring-snow"
            >
              {index + 1}
            </span>
            <span className="text-bark/85">{step}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
