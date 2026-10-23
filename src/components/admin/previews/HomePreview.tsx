'use client';

/**
 * The home page, drawn from the draft with the very component the published page renders
 * (`HomeSections`).
 *
 * The highlight cards and their topping chips come from the menu document, which is edited on
 * its own screen: the preview shows the published menu (the built-in one until a menu has been
 * published, or when it can't be loaded). Everything the home page document owns is live as it
 * is typed.
 */

import { PREVIEW_IMAGE_BASE } from '@/components/admin/previews/PreviewFrame';
import { HomeSections } from '@/components/home/HomeSections';
import type { HomeContent } from '@/lib/content/home';
import type { MenuContent } from '@/lib/menu-content';

export interface HomePreviewProps {
  readonly content: HomeContent;
  /** The menu the highlights are drawn from. */
  readonly menu: MenuContent;
}

export function HomePreview({ content, menu }: HomePreviewProps) {
  return <HomeSections home={content} menu={menu} imageBase={PREVIEW_IMAGE_BASE} />;
}
