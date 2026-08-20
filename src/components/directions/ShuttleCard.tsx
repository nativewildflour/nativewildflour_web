import { SMART_SHUTTLE } from '@/data/directions';

import { ShuttleIcon } from '@/components/directions/Icons';

export interface ShuttleCardProps {
  readonly className?: string;
}

/** The SMART shuttle option, shown under the dock cards. Heading is an `h3`. */
export function ShuttleCard({ className = '' }: ShuttleCardProps) {
  return (
    <article
      className={`rounded-3xl bg-sky/45 p-6 shadow-card ring-1 ring-blueberry/20 sm:p-8 ${className}`.trim()}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-snow text-blueberry shadow-press">
          <ShuttleIcon />
        </span>
        <h3 className="text-xl font-black text-bark sm:text-2xl">
          Rather ride? The {SMART_SHUTTLE.name}
        </h3>
      </div>

      <p className="mt-4 text-bark/85">{SMART_SHUTTLE.description}</p>

      <ul className="mt-4 space-y-2">
        {SMART_SHUTTLE.notes.map((note) => (
          <li key={note} className="flex gap-3 text-bark/85">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-blueberry" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
