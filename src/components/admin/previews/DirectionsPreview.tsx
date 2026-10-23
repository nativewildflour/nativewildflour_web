'use client';

/**
 * The directions page, drawn from the draft with the published page's own component
 * (`DirectionsSections`). The breadcrumb trail and the structured data are left out; the map is
 * not, because the card it sits in is most of what the top of this page looks like.
 */

import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { DirectionsSections } from '@/components/directions/DirectionsSections';
import type { DirectionsContent } from '@/lib/content/directions';

export interface DirectionsPreviewProps {
  readonly content: DirectionsContent;
}

export function DirectionsPreview({ content }: DirectionsPreviewProps) {
  return <DirectionsSections directions={content} imageBase={PREVIEW_IMAGE_BASE} />;
}
