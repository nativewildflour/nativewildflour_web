/**
 * The directions page as an owner-editable document.
 *
 * The address, phone, hours and season note in the "Address and hours" card, and the map links
 * and embed, all come from `src/data/business.ts` and `src/data/map.ts` — a correction to the
 * coordinates has to move the pin and the buttons together, so it cannot live in editable copy.
 *
 * Relative imports only — the Netlify Functions import this module without Next's `@/` alias.
 */

import type { DocumentSpec, ExtraChecks } from '../content-schema';
import type { CopyIssue } from '../copy-rules';
import type { PhotoContent } from './images';

/** One cruise dock and the walk from it. `id` is the card's anchor, so it stays a slug. */
export interface Dock {
  readonly id: string;
  readonly name: string;
  /** Display string, e.g. `~5–8 minutes`. */
  readonly walkMinutes: string;
  readonly summary: string;
  readonly steps: readonly string[];
}

/** One question and answer. Also the source of the page's FAQPage structured data. */
export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface DirectionsContent {
  readonly version: 1;
  /** ISO 8601 timestamp, set by the publish endpoint on save; the committed seed omits it. */
  readonly updatedAt?: string;
  readonly intro: {
    /** The page `<h1>`. */
    readonly title: string;
    readonly lede: string;
    /** The pill under the opening paragraph. */
    readonly walkBadge: string;
  };
  readonly orientation: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lead: string;
    readonly notes: readonly string[];
    readonly photo: PhotoContent;
  };
  readonly docks: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lead: string;
    /** The caution shown once above the dock cards. */
    readonly caveat: string;
    readonly items: readonly Dock[];
  };
  readonly shuttle: {
    readonly name: string;
    readonly description: string;
    readonly notes: readonly string[];
  };
  readonly arriving: {
    readonly title: string;
    readonly notes: readonly string[];
  };
  readonly tips: {
    readonly title: string;
    readonly lead: string;
    readonly items: readonly string[];
  };
  readonly faq: {
    readonly title: string;
    readonly items: readonly FaqItem[];
  };
}

export const DIRECTIONS_SPEC: DocumentSpec = {
  fields: {
    intro: {
      kind: 'group',
      label: 'Top of the page',
      hint: 'The address, phone and hours card below this is filled in for you.',
      fields: {
        title: {
          kind: 'text',
          label: 'Page heading',
          hint: 'The main heading of the page. Search results use it too.',
        },
        lede: { kind: 'text', label: 'Opening paragraph', multiline: true },
        walkBadge: {
          kind: 'text',
          label: 'Walking-time badge',
          hint: 'The short line in the pill, e.g. how long the walk takes from the docks.',
        },
      },
    },
    orientation: {
      kind: 'group',
      label: 'Where we are in town',
      fields: {
        eyebrow: {
          kind: 'text',
          label: 'Small line above the heading',
          hint: 'A few words, printed in capitals.',
        },
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        notes: {
          kind: 'strings',
          label: 'Landmarks to steer by',
          itemLabel: 'Note',
          hint: 'One short line per card.',
          min: 1,
        },
        photo: {
          kind: 'photo',
          label: 'Photo of the corner',
          hint: 'Until you add one, the space shows a placeholder with the caption underneath.',
        },
      },
    },
    docks: {
      kind: 'group',
      label: 'From your cruise ship',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        caveat: {
          kind: 'text',
          label: 'Caution above the cards',
          multiline: true,
          hint: 'Shown once, in the dashed box. Keep the reminder about all-aboard times.',
        },
        items: {
          kind: 'list',
          label: 'The docks',
          itemLabel: 'Dock',
          titleField: 'name',
          slugField: 'id',
          item: {
            id: {
              kind: 'text',
              label: 'Link id',
              hint: 'Used in the web address of this card. Lowercase letters, digits and hyphens.',
            },
            name: { kind: 'text', label: 'Dock name' },
            walkMinutes: {
              kind: 'text',
              label: 'Walking time',
              hint: 'Shown in the badge, followed by the word "walk", e.g. ~5–8 minutes.',
            },
            summary: { kind: 'text', label: 'One-line summary', multiline: true },
            steps: {
              kind: 'strings',
              label: 'The walk, step by step',
              itemLabel: 'Step',
              hint: 'One instruction per step. They are numbered for you.',
              min: 1,
            },
          },
        },
      },
    },
    shuttle: {
      kind: 'group',
      label: 'The shuttle option',
      hint: 'The card under the dock cards, for anyone who would rather ride than walk.',
      fields: {
        name: { kind: 'text', label: 'Shuttle name' },
        description: { kind: 'text', label: 'What it is', multiline: true },
        notes: { kind: 'strings', label: 'Good to know', itemLabel: 'Note', min: 1 },
      },
    },
    arriving: {
      kind: 'group',
      label: 'Arriving another way',
      hint: 'By car, RV, ferry or train.',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        notes: { kind: 'strings', label: 'The notes', itemLabel: 'Note', min: 1 },
      },
    },
    tips: {
      kind: 'group',
      label: 'Tips for your visit',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        items: { kind: 'strings', label: 'The tips', itemLabel: 'Tip', min: 1 },
      },
    },
    faq: {
      kind: 'group',
      label: 'Frequently asked questions',
      hint: 'These also feed the questions and answers search engines show under the listing.',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        items: {
          kind: 'list',
          label: 'The questions',
          itemLabel: 'Question',
          titleField: 'question',
          item: {
            question: { kind: 'text', label: 'Question' },
            answer: { kind: 'text', label: 'Answer', multiline: true },
          },
        },
      },
    },
  },
};

/**
 * The checks the field spec cannot express. Both counts exist for a page contract, not a rule
 * about wording: the structured data and the whole point of the page depend on them.
 */
export const directionsExtraChecks: ExtraChecks<DirectionsContent> = (document) => {
  const issues: CopyIssue[] = [];

  if (document.faq.items.length === 0) {
    issues.push({
      path: 'faq.items',
      message:
        'Add at least one question — search engines read this list to show questions and answers under the listing, and with none the page loses that.',
    });
  }

  if (document.docks.items.length === 0) {
    issues.push({
      path: 'docks.items',
      message: 'Add at least one dock — the walking directions are what this page is for.',
    });
  }

  return issues;
};
