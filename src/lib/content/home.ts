/**
 * The home page as an owner-editable document: its shape, and the field spec that validates it
 * and draws the editor.
 *
 * Labels and hints here are what the owner reads in the admin editor, so they name things the
 * way she would ("the big line at the top"), not the way the code does.
 *
 * The menu cards under "Menu highlights" and the contact details under "Visit us" are NOT here:
 * those come from the menu document and `src/data/business.ts`, so one edit keeps every page in
 * step. This document holds only the words written specifically for the home page.
 *
 * Relative imports only — the Netlify Functions import this module without Next's `@/` alias.
 */

import type { DocumentSpec, ExtraChecks, SelectOption } from '../content-schema';
import type { CopyIssue } from '../copy-rules';
import type { PhotoContent } from './images';

/** Icon names drawn by `src/components/home/HomeIcons.tsx`. */
export const FEATURE_ICONS = ['heart', 'sunrise', 'cup', 'clock', 'pin', 'ship', 'chat'] as const;

export type FeatureIcon = (typeof FEATURE_ICONS)[number];

/** What the owner sees for each icon. Keyed by `FeatureIcon`, so a new icon must be named here. */
const ICON_LABELS: Readonly<Record<FeatureIcon, string>> = {
  heart: 'Heart',
  sunrise: 'Sunrise',
  cup: 'Coffee cup',
  clock: 'Clock',
  pin: 'Map pin',
  ship: 'Cruise ship',
  chat: 'Speech bubble',
};

const ICON_OPTIONS: readonly SelectOption[] = FEATURE_ICONS.map((value) => ({
  value,
  label: ICON_LABELS[value],
}));

/** One of the small cards under the bannock explainer. */
export interface HomeFeature {
  readonly icon: FeatureIcon;
  readonly title: string;
  readonly body: string;
}

export interface HomeContent {
  readonly version: 1;
  /** ISO 8601 timestamp, set by the publish endpoint on save; the committed seed omits it. */
  readonly updatedAt?: string;
  readonly hero: {
    /** The page `<h1>`. */
    readonly heading: string;
    /** Wrapped in the fireweed span at its first occurrence in `heading`. May be blank. */
    readonly accentWord: string;
    readonly lede: string;
  };
  readonly bannock: {
    readonly eyebrow: string;
    readonly title: string;
    readonly paragraphs: readonly string[];
    readonly photo: PhotoContent;
    readonly features: readonly HomeFeature[];
  };
  /** The heading block only — the cards themselves come from the menu document. */
  readonly highlights: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lead: string;
  };
  readonly visit: {
    readonly eyebrow: string;
    readonly title: string;
    readonly locationNote: string;
    readonly cruiseTitle: string;
    readonly cruiseBody: string;
  };
  readonly testimonial: {
    readonly quote: string;
    readonly attribution: string;
  };
  readonly meetKelly: {
    readonly eyebrow: string;
    readonly title: string;
    readonly paragraphs: readonly string[];
  };
  readonly facebook: {
    readonly title: string;
    readonly body: string;
  };
}

export const HOME_SPEC: DocumentSpec = {
  fields: {
    hero: {
      kind: 'group',
      label: 'Top of the page',
      hint: 'The first thing a visitor sees, above the buttons and the hours.',
      fields: {
        heading: {
          kind: 'text',
          label: 'Headline',
          hint: 'The big line at the top of the page. (The title shown in search results is set separately and does not change with it.)',
        },
        accentWord: {
          kind: 'text',
          label: 'Word to highlight',
          hint: 'One word from the headline, printed in pink. Leave it blank for no highlight.',
          optional: true,
        },
        lede: {
          kind: 'text',
          label: 'Opening paragraph',
          multiline: true,
          hint: 'A sentence or two under the headline.',
        },
      },
    },
    bannock: {
      kind: 'group',
      label: 'What is bannock?',
      fields: {
        eyebrow: {
          kind: 'text',
          label: 'Small line above the heading',
          hint: 'A few words, printed in capitals.',
        },
        title: { kind: 'text', label: 'Heading' },
        paragraphs: {
          kind: 'paragraphs',
          label: 'Body copy',
          hint: 'The first paragraph starts with the large decorative letter.',
          min: 1,
        },
        photo: {
          kind: 'photo',
          label: 'Photo',
          hint: 'Until you add one, the space shows a placeholder with the caption underneath.',
        },
        features: {
          kind: 'list',
          label: 'The three small cards',
          itemLabel: 'Card',
          titleField: 'title',
          max: 3,
          item: {
            icon: { kind: 'select', label: 'Icon', options: ICON_OPTIONS },
            title: { kind: 'text', label: 'Card heading' },
            body: { kind: 'text', label: 'Card text', multiline: true },
          },
        },
      },
    },
    highlights: {
      kind: 'group',
      label: 'Menu highlights',
      hint: 'Only the heading is edited here — the cards below it come from the menu.',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
      },
    },
    visit: {
      kind: 'group',
      label: 'Visit us',
      hint: 'The address, phone number and hours are filled in for you and are not edited here.',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        locationNote: {
          kind: 'text',
          label: 'Line under the address',
          hint: 'The landmark that helps someone find the corner.',
        },
        cruiseTitle: { kind: 'text', label: 'Cruise panel heading' },
        cruiseBody: { kind: 'text', label: 'Cruise panel text', multiline: true },
      },
    },
    testimonial: {
      kind: 'group',
      label: 'What a visitor said',
      hint: 'Quote it word for word, and credit it the way the visitor wrote it.',
      fields: {
        quote: { kind: 'text', label: 'The quote', multiline: true },
        attribution: { kind: 'text', label: 'Who said it' },
      },
    },
    meetKelly: {
      kind: 'group',
      label: 'Meet Kelly',
      hint: 'The short version. The full story lives on the about page.',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        paragraphs: { kind: 'paragraphs', label: 'Body copy', min: 1 },
      },
    },
    facebook: {
      kind: 'group',
      label: 'Facebook panel',
      hint: 'The blue panel that closes the page.',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        body: { kind: 'text', label: 'Text', multiline: true },
      },
    },
  },
};

/**
 * The checks the field spec cannot express. Both exist because the page would render something
 * broken or pointless, not because of a rule about wording.
 */
export const homeExtraChecks: ExtraChecks<HomeContent> = (document) => {
  const issues: CopyIssue[] = [];

  if (document.bannock.features.length === 0) {
    issues.push({
      path: 'bannock.features',
      message: 'The row of small cards is empty — add at least one card, or the strip vanishes.',
    });
  }

  // A highlight word that is not in the headline highlights nothing, which looks like a bug.
  const accent = document.hero.accentWord.trim();
  if (accent !== '' && !document.hero.heading.includes(accent)) {
    issues.push({
      path: 'hero.accentWord',
      message: `"${accent}" is not in the headline, so nothing would be highlighted — use a word that appears in it, or leave this blank.`,
    });
  }

  return issues;
};
