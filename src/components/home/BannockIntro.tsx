import type { ComponentType } from 'react';

import { PhotoSlot } from '@/components/PhotoSlot';
import { Section } from '@/components/Section';
import { CupIcon, HeartIcon, SunriseIcon, type IconProps } from '@/components/home/HomeIcons';
import { BANNOCK_EXPLAINER, BUSINESS_NAME, COFFEE_ROASTER } from '@/data/business';

interface FeatureCard {
  readonly title: string;
  readonly body: string;
  readonly Icon: ComponentType<IconProps>;
  /** Icon badge tint — one brand color per card. */
  readonly badge: string;
}

const FEATURES: readonly FeatureCard[] = [
  {
    title: 'Family recipe',
    body: 'Our bannock comes from a recipe passed down in Kelly’s family, and every piece is fried to order.',
    Icon: HeartIcon,
    badge: 'bg-fireweed/10 text-fireweed',
  },
  {
    title: 'Made fresh daily',
    body: 'Bannock, cookies, muffins and the savory lunch special are made fresh every day — and the specials often sell out.',
    Icon: SunriseIcon,
    badge: 'bg-wheat/25 text-honey',
  },
  {
    title: 'Alaska-roasted coffee',
    body: `We proudly serve ${COFFEE_ROASTER}, roasted in Alaska, alongside hot tea and cold drinks.`,
    Icon: CupIcon,
    badge: 'bg-spruce/10 text-spruce',
  },
];

/** "What is bannock?" — the respectful, general explainer plus the three feature cards. */
export function BannockIntro() {
  return (
    <Section id="bannock" tone="snow" eyebrow="Fresh from the fryer" title="What is bannock?" width="6xl">
      {/* The photo slot reserves the food-photography space today, so the layout is
          ready the day the owner sends one picture (same pattern as /about/). */}
      <div className="grid gap-10 md:grid-cols-5 md:items-center">
        <div className="space-y-4 text-lg text-bark/85 md:col-span-3">
          <p className="first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.85] first-letter:font-black first-letter:text-wood">
            {BANNOCK_EXPLAINER}
          </p>
          <p>
            At {BUSINESS_NAME} it is fried to order and served with your choice of topping — from
            butter and honey to Kelly’s homemade rhubarb jam.
          </p>
        </div>
        <PhotoSlot caption="Fresh-fried bannock, ready for a topping" className="md:col-span-2" />
      </div>

      <ul className="mt-12 grid gap-6 sm:grid-cols-3">
        {FEATURES.map(({ title, body, Icon, badge }) => (
          <li
            key={title}
            className="rounded-3xl bg-cream p-6 shadow-card ring-1 ring-bark/10 transition duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lift"
          >
            <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${badge}`}>
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-xl font-black text-bark">{title}</h3>
            <p className="mt-2 text-bark/85">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
