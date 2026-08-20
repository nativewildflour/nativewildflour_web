import { ButtonLink } from '@/components/ButtonLink';
import { Section } from '@/components/Section';
import { ChatIcon } from '@/components/home/HomeIcons';
import { FACEBOOK_URL, OWNER } from '@/data/business';

/** Closing call to action: the daily specials live on Facebook. A dark blueberry panel. */
export function FacebookCta() {
  return (
    <Section width="6xl">
      <div className="flex flex-col gap-6 rounded-[2rem] bg-gradient-to-br from-blueberry to-blueberry-deep p-8 text-snow shadow-lift sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-snow/15 text-sky">
            <ChatIcon className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black text-snow sm:text-3xl">
              Daily specials are posted on Facebook
            </h2>
            {/* The heading already says where; this line adds why it is worth the tap. */}
            <p className="mt-2 max-w-xl text-snow/85">
              The savory bannock special changes most days — see what {OWNER.firstName} is making
              today before you walk over.
            </p>
          </div>
        </div>

        <ButtonLink href={FACEBOOK_URL} variant="light" size="lg" className="shrink-0">
          Follow us on Facebook
        </ButtonLink>
      </div>
    </Section>
  );
}
