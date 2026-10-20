import type { MetadataRoute } from 'next';

import type { DocumentKey } from '@/lib/content-docs';
import { getContent } from '@/lib/server/content';
import { absoluteUrl } from '@/lib/site';

/**
 * Regenerated like the pages it lists: a publish changes a page's `lastmod`, and the revalidate
 * endpoint refreshes this route alongside them. The 60-second window is the safety net.
 */
export const revalidate = 60;

/**
 * When the page code and the committed defaults last changed materially — a deploy's own
 * contribution to `lastmod`. Bump it when a deploy changes what a page shows. Owner publishes
 * never touch the repo, so their dates come from the documents themselves (below).
 */
const LAST_MODIFIED = '2026-09-02';

interface SitemapPage {
  readonly path: string;
  /** Every document the page renders — the menu feeds home highlights and about's toppings. */
  readonly documents: readonly DocumentKey[];
  readonly changeFrequency: 'weekly' | 'monthly';
  readonly priority: number;
}

const SITEMAP_PAGES: readonly SitemapPage[] = [
  { path: '/', documents: ['home', 'menu'], changeFrequency: 'weekly', priority: 1 },
  { path: '/menu/', documents: ['menu'], changeFrequency: 'weekly', priority: 0.9 },
  { path: '/directions/', documents: ['directions'], changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about/', documents: ['about', 'menu'], changeFrequency: 'monthly', priority: 0.7 },
];

/**
 * The `updatedAt` stamp the publish endpoint writes on every save, or null for a document that
 * has none (the committed defaults, and anything saved before stamps existed).
 *
 * A document that cannot be read is also null, not an error: that page already fails loudly on
 * its own, and the sitemap listing the other three must stay up while the blob is repaired.
 */
async function publishedAt(doc: DocumentKey): Promise<string | null> {
  try {
    const { document } = await getContent(doc);
    return document.updatedAt ?? null;
  } catch {
    return null;
  }
}

/** The latest of the given dates, as written — the deploy's date or a publish stamp. */
function latest(dates: readonly (string | null)[]): string {
  let newest = LAST_MODIFIED;
  for (const date of dates) {
    if (date !== null && Date.parse(date) > Date.parse(newest)) newest = date;
  }
  return newest;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const keys = [...new Set(SITEMAP_PAGES.flatMap((page) => page.documents))];
  const stamps = new Map(
    await Promise.all(keys.map(async (doc) => [doc, await publishedAt(doc)] as const)),
  );

  return SITEMAP_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: latest(page.documents.map((doc) => stamps.get(doc) ?? null)),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
