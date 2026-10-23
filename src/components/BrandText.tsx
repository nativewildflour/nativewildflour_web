import type { ReactNode } from 'react';

import { BUSINESS_NAME } from '@/data/business';

export interface BrandTextProps {
  readonly text: string;
}

/**
 * The invisible characters a paste can carry — soft hyphens, zero-width spaces and joiners,
 * direction marks: every default-ignorable code point, exactly what `normalizeCopy` drops before
 * the casing check reads the text. So a name with one of them inside still passes, and still has
 * to be found here.
 */
const IGNORABLE = String.raw`\p{Default_Ignorable_Code_Point}`;

/** One word, matched letter for letter with invisible characters allowed between the letters. */
function spelled(word: string): string {
  return [...word]
    .map((letter) => letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(`${IGNORABLE}*`);
}

const NAME_BREAK = BUSINESS_NAME.lastIndexOf(' ');

/**
 * The name as the validator accepts it (`WRONG_CASING` in `copy-rules.ts`): its last word
 * ("WILDFlour") on its own, or after the first ("Native") with any spaces — no-break ones
 * included — or invisible characters between, plus an optional possessive ("WILDFlour’s").
 * Exact casing throughout, since anything else is refused on publish. It must stand as a word of
 * its own: inside a longer word (a run-together web address) the validator doesn't read it as the
 * name either.
 */
const BRAND = new RegExp(
  `(?<!\\w${IGNORABLE}*)` +
    `(?:${spelled(BUSINESS_NAME.slice(0, NAME_BREAK))}[\\s${IGNORABLE}]*)?` +
    `${spelled(BUSINESS_NAME.slice(NAME_BREAK + 1))}` +
    `(?:['’]s)?` +
    `(?!${IGNORABLE}*\\w)`,
  'gu',
);

/**
 * Owner text for a label set in CSS `uppercase` (eyebrows, small headings, attributions). The
 * transform would print the whole name in capitals, and the name is always written exactly
 * "Native WILDFlour", so each occurrence is pulled back to its own casing, as typed: with or
 * without "Native", a no-break space, a possessive. Everything else in the label keeps the
 * uppercase style.
 */
export function BrandText({ text }: BrandTextProps) {
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(BRAND)) {
    const start = match.index;
    parts.push(
      text.slice(end, start),
      <span key={start} className="normal-case" translate="no">
        {match[0]}
      </span>,
    );
    end = start + match[0].length;
  }
  if (parts.length === 0) return text;
  parts.push(text.slice(end));
  return parts;
}
