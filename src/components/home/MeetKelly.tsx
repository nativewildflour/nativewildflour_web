import { ButtonLink } from '@/components/ButtonLink';
import { Section } from '@/components/Section';
import { ADDRESS, BUSINESS_NAME, OWNER } from '@/data/business';

/** "Meet Kelly" — the short about teaser that links to `/about/`. */
export function MeetKelly() {
  return (
    <Section eyebrow="The baker" title="Meet Kelly" width="3xl">
      <div className="space-y-4 text-lg text-bark/85">
        <p>
          {OWNER.firstName} trained at the {OWNER.training}, but her greatest inspiration is{' '}
          {OWNER.inspiration}, who “filled our hearts and tummies with the smell of fresh baking.”
        </p>
        <p>
          Her Grammy’s love, generosity and recipes inspire everything Kelly makes, starting with
          the bannock from the family recipe. {BUSINESS_NAME} is her small, independent cafe at{' '}
          {ADDRESS.street}.
        </p>
      </div>

      <div className="mt-8">
        <ButtonLink href="/about/" variant="secondary">
          Read our story
        </ButtonLink>
      </div>
    </Section>
  );
}
