import type { DocumentKey } from '@/lib/content-docs';

/**
 * Which owner-editable documents each public page renders — the menu also feeds the home page's
 * highlights and the about page's toppings. Two things read it: the sitemap, whose `lastmod` for
 * a page is the newest publish among its documents, and the refresh route, which re-renders only
 * the pages a publish touched. A new public page goes here (and in the gate's `PAGES`).
 */
export const PAGE_DOCUMENTS = {
  '/': ['home', 'menu'],
  '/menu/': ['menu'],
  '/directions/': ['directions'],
  '/about/': ['about', 'menu'],
} as const satisfies Readonly<Record<string, readonly DocumentKey[]>>;

export type PublicPath = keyof typeof PAGE_DOCUMENTS;

/** The public pages that render `doc`. */
export function pagesShowing(doc: DocumentKey): PublicPath[] {
  return (Object.keys(PAGE_DOCUMENTS) as PublicPath[]).filter((path) =>
    (PAGE_DOCUMENTS[path] as readonly DocumentKey[]).includes(doc),
  );
}
