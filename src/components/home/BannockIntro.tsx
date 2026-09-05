import type { ComponentType } from 'react';

import { PhotoSlot } from '@/components/PhotoSlot';
import { Section } from '@/components/Section';
import {
  ChatIcon,
  ClockIcon,
  CupIcon,
  HeartIcon,
  MapPinIcon,
  ShipIcon,
  SunriseIcon,
  type IconProps,
} from '@/components/home/HomeIcons';
import type { FeatureIcon, HomeContent } from '@/lib/content/home';

interface FeatureIconStyle {
  readonly Icon: ComponentType<IconProps>;
  /** Icon badge tint — one brand color per icon, so the card row stays varied by itself. */
  readonly badge: string;
}

const FEATURE_ICONS: Record<FeatureIcon, FeatureIconStyle> = {
  heart: { Icon: HeartIcon, badge: 'bg-fireweed/10 text-fireweed' },
  sunrise: { Icon: SunriseIcon, badge: 'bg-wheat/25 text-honey' },
  cup: { Icon: CupIcon, badge: 'bg-spruce/10 text-spruce' },
  clock: { Icon: ClockIcon, badge: 'bg-blueberry/10 text-blueberry' },
  pin: { Icon: MapPinIcon, badge: 'bg-fireweed/10 text-fireweed' },
  ship: { Icon: ShipIcon, badge: 'bg-blueberry/10 text-blueberry' },
  chat: { Icon: ChatIcon, badge: 'bg-spruce/10 text-spruce' },
};

export interface BannockIntroProps {
  readonly content: HomeContent['bannock'];
  /** Where an uploaded photo is served from. The admin preview overrides it. */
  readonly imageBase?: string;
}

/** "What is bannock?" — the respectful, general explainer plus the feature cards. */
export function BannockIntro({ content, imageBase }: BannockIntroProps) {
  return (
    <Section
      id="bannock"
      tone="snow"
      eyebrow={content.eyebrow}
      title={content.title}
      width="6xl"
    >
      {/* The photo slot reserves the food-photography space until the owner uploads one
          (same pattern as /about/). */}
      <div className="grid gap-10 md:grid-cols-5 md:items-center">
        <div className="space-y-4 text-lg text-bark/85 md:col-span-3">
          {content.paragraphs.map((paragraph, index) => (
            // The drop cap belongs to the opening paragraph only.
            <p
              key={paragraph}
              className={
                index === 0
                  ? 'first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.85] first-letter:font-black first-letter:text-wood'
                  : undefined
              }
            >
              {paragraph}
            </p>
          ))}
        </div>
        <PhotoSlot photo={content.photo} imageBase={imageBase} className="md:col-span-2" />
      </div>

      <ul className="mt-12 grid gap-6 sm:grid-cols-3">
        {content.features.map((feature) => {
          const { Icon, badge } = FEATURE_ICONS[feature.icon];
          return (
            <li
              key={feature.title}
              className="rounded-3xl bg-cream p-6 shadow-card ring-1 ring-bark/10 transition duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lift"
            >
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${badge}`}>
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-xl font-black text-bark">{feature.title}</h3>
              <p className="mt-2 text-bark/85">{feature.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
