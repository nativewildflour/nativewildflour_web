import type { ReactNode } from 'react';

import { DirectionsArriving } from '@/components/directions/DirectionsArriving';
import { DirectionsDocks } from '@/components/directions/DirectionsDocks';
import { DirectionsFaq } from '@/components/directions/DirectionsFaq';
import { DirectionsIntro } from '@/components/directions/DirectionsIntro';
import { DirectionsOrientation } from '@/components/directions/DirectionsOrientation';
import { DirectionsTips } from '@/components/directions/DirectionsTips';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsSectionsProps {
  readonly directions: DirectionsContent;
  /** The breadcrumb trail, set inside the intro — the page passes one, the preview none. */
  readonly breadcrumbs?: ReactNode;
  /** Where photos are served from; the live uploads endpoint unless the admin preview says so. */
  readonly imageBase?: string;
}

/**
 * The directions page's sections, in order. The page renders them from the published document
 * and the admin preview from a draft, so a section added here shows up in both.
 */
export function DirectionsSections({ directions, breadcrumbs, imageBase }: DirectionsSectionsProps) {
  return (
    <>
      <DirectionsIntro content={directions.intro}>{breadcrumbs}</DirectionsIntro>

      <DirectionsOrientation content={directions.orientation} imageBase={imageBase} />
      <DirectionsDocks content={directions.docks} shuttle={directions.shuttle} />
      <DirectionsArriving content={directions.arriving} />
      <DirectionsTips content={directions.tips} />
      <DirectionsFaq content={directions.faq} />
    </>
  );
}
