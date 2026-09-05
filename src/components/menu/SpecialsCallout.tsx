import { ButtonLink } from '@/components/ButtonLink';
import { FACEBOOK_URL } from '@/data/business';

export interface SpecialsCalloutProps {
  /** The menu document's specials note — the one editable sentence in this box. */
  readonly note: string;
  readonly className?: string;
}

/** The day's-special note, set like a hand-stamped ticket pointing at Facebook. */
export function SpecialsCallout({ note, className = '' }: SpecialsCalloutProps) {
  return (
    <aside
      aria-labelledby="todays-special-heading"
      className={`rounded-3xl border-2 border-dashed border-fireweed/50 bg-fireweed/5 p-6 sm:p-8 ${className}`.trim()}
    >
      <div className="flex items-start gap-4">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fireweed/10 text-fireweed">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2.8l1.9 4.5 4.9.4-3.7 3.2 1.1 4.8L12 13.2l-4.2 2.5 1.1-4.8-3.7-3.2 4.9-.4Z" />
            <path d="M18.4 17.2l.7 1.7 1.8.2-1.4 1.2.4 1.8-1.5-.9-1.6.9.4-1.8-1.3-1.2 1.8-.2Z" />
          </svg>
        </span>
        <div>
          <h2 id="todays-special-heading" className="text-2xl font-black text-bark">
            Today’s special
          </h2>
          <p className="mt-2 text-bark/80">
            The savory bannock special is different most days.{' '}
            {note}
          </p>
          <ButtonLink href={FACEBOOK_URL} variant="accent" className="mt-5">
            See today’s special on Facebook
          </ButtonLink>
        </div>
      </div>
    </aside>
  );
}
