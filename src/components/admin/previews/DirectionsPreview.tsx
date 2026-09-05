'use client';

/**
 * The directions page, drawn from the draft with the published page's own components. The
 * breadcrumb trail and the structured data are left out; the map is not, because the card it
 * sits in is most of what the top of this page looks like.
 */

import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { DirectionsArriving } from '@/components/directions/DirectionsArriving';
import { DirectionsDocks } from '@/components/directions/DirectionsDocks';
import { DirectionsFaq } from '@/components/directions/DirectionsFaq';
import { DirectionsIntro } from '@/components/directions/DirectionsIntro';
import { DirectionsOrientation } from '@/components/directions/DirectionsOrientation';
import { DirectionsTips } from '@/components/directions/DirectionsTips';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsPreviewProps {
  readonly content: DirectionsContent;
}

export function DirectionsPreview({ content }: DirectionsPreviewProps) {
  return (
    <>
      <DirectionsIntro content={content.intro} />
      <DirectionsOrientation content={content.orientation} imageBase={PREVIEW_IMAGE_BASE} />
      <DirectionsDocks content={content.docks} shuttle={content.shuttle} />
      <DirectionsArriving content={content.arriving} />
      <DirectionsTips content={content.tips} />
      <DirectionsFaq content={content.faq} />
    </>
  );
}
