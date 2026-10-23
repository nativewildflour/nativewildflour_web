import { Fragment } from 'react';

import { BUSINESS_NAME } from '@/data/business';

export interface BrandTextProps {
  readonly text: string;
}

/**
 * Owner text for a label set in CSS `uppercase` (eyebrows, small headings, attributions). The
 * transform would print the whole name in capitals, and the name is always written exactly
 * "Native WILDFlour", so each occurrence is pulled back to its own casing. Everything else in
 * the label keeps the uppercase style.
 */
export function BrandText({ text }: BrandTextProps) {
  const parts = text.split(BUSINESS_NAME);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? (
        <span className="normal-case" translate="no">
          {BUSINESS_NAME}
        </span>
      ) : null}
      {part}
    </Fragment>
  ));
}
