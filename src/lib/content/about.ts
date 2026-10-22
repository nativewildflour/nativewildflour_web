/**
 * The about page as an owner-editable document.
 *
 * The topping chips under "Toppings to choose from" come from the menu document, and the motto,
 * address, phone, Facebook link and hours table come from `src/data/business.ts` — so the words
 * here are only the ones written for this page.
 *
 * Relative imports only — the Netlify Functions import this module without Next's `@/` alias.
 */

import type { DocumentSpec, ExtraChecks } from '../content-schema';
import type { CopyIssue } from '../copy-rules';
import type { PhotoContent } from './images';

/** One of the cards in the "Made in Skagway" row. */
export interface AboutCard {
  readonly title: string;
  readonly body: string;
}

export interface AboutContent {
  readonly version: 1;
  /** ISO 8601 timestamp, set by the publish endpoint on save; the committed seed omits it. */
  readonly updatedAt?: string;
  readonly intro: {
    readonly eyebrow: string;
    /** The page `<h1>`. */
    readonly title: string;
    readonly lede: string;
  };
  readonly meetKelly: {
    readonly title: string;
    readonly paragraphs: readonly string[];
    readonly photo: PhotoContent;
  };
  readonly grammy: {
    readonly title: string;
    readonly paragraphs: readonly string[];
    /** Printed inside curly quotes by the page, so store it without them. */
    readonly quote: string;
    readonly quoteAttribution: string;
  };
  /** The chips between `toppingsHeading` and `outro` come from the menu document. */
  readonly recipe: {
    readonly title: string;
    readonly lead: string;
    readonly intro: string;
    readonly toppingsHeading: string;
    readonly outro: string;
  };
  readonly whatIsBannock: {
    readonly title: string;
    readonly paragraphs: readonly string[];
  };
  readonly madeInSkagway: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lead: string;
    readonly cards: readonly AboutCard[];
  };
  /** The address, phone, Facebook link and hours table below this come from the business data. */
  readonly sayHello: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lead: string;
    readonly locationNote: string;
  };
}

export const ABOUT_SPEC: DocumentSpec = {
  fields: {
    intro: {
      kind: 'group',
      label: 'Top of the page',
      fields: {
        eyebrow: {
          kind: 'text',
          label: 'Small line above the heading',
          hint: 'A few words, printed in capitals.',
        },
        title: {
          kind: 'text',
          label: 'Page heading',
          hint: 'The main heading of the page. Search results use it too.',
        },
        lede: { kind: 'text', label: 'Opening paragraph', multiline: true },
      },
    },
    meetKelly: {
      kind: 'group',
      label: 'Meet Kelly',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        paragraphs: { kind: 'paragraphs', label: 'Body copy', min: 1 },
        photo: {
          kind: 'photo',
          label: 'Photo',
          hint: 'Until you add one, the space shows a placeholder with the caption underneath.',
        },
      },
    },
    grammy: {
      kind: 'group',
      label: 'Grammy’s kitchen',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        paragraphs: { kind: 'paragraphs', label: 'Body copy', min: 1 },
        quote: {
          kind: 'text',
          label: 'Pull quote',
          multiline: true,
          hint: 'The quotation marks are added for you — just type the words.',
        },
        quoteAttribution: { kind: 'text', label: 'Who said it' },
      },
    },
    recipe: {
      kind: 'group',
      label: 'The family bannock recipe',
      hint: 'The topping chips in the middle come from the menu, so they are edited there.',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        intro: { kind: 'text', label: 'Paragraph above the toppings', multiline: true },
        toppingsHeading: { kind: 'text', label: 'Heading above the topping chips' },
        outro: { kind: 'text', label: 'Paragraph below the toppings', multiline: true },
      },
    },
    whatIsBannock: {
      kind: 'group',
      label: 'What is bannock?',
      hint: 'Keep this general and respectful — no claim about any one community or its history.',
      fields: {
        title: { kind: 'text', label: 'Heading' },
        paragraphs: { kind: 'paragraphs', label: 'Body copy', min: 1 },
      },
    },
    madeInSkagway: {
      kind: 'group',
      label: 'Made in Skagway',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        cards: {
          kind: 'list',
          label: 'The row of cards',
          itemLabel: 'Card',
          titleField: 'title',
          max: 3,
          item: {
            title: { kind: 'text', label: 'Card heading' },
            body: { kind: 'text', label: 'Card text', multiline: true },
          },
        },
      },
    },
    sayHello: {
      kind: 'group',
      label: 'Come say hello',
      hint: 'The address, phone number, Facebook link and hours table are filled in for you.',
      fields: {
        eyebrow: { kind: 'text', label: 'Small line above the heading' },
        title: { kind: 'text', label: 'Heading' },
        lead: { kind: 'text', label: 'Intro line', multiline: true },
        locationNote: {
          kind: 'text',
          label: 'Line under the address',
          hint: 'The landmark that helps someone find the corner.',
        },
      },
    },
  },
};

/** The one check the field spec cannot express: an empty row would render as blank space. */
export const aboutExtraChecks: ExtraChecks<AboutContent> = (document) => {
  const issues: CopyIssue[] = [];

  if (document.madeInSkagway.cards.length === 0) {
    issues.push({
      path: 'madeInSkagway.cards',
      message: 'The row of cards is empty — add at least one card, or the row vanishes.',
    });
  }

  return issues;
};
