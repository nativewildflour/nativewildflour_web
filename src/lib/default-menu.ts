/**
 * The committed default menu, parsed once, and the one place the menu page's wording resolves.
 *
 * The admin screens need the default because none of them can read the store: the menu editor
 * falls back to it when nothing is saved, and the home and about previews take their highlight
 * cards and topping chips from it because those belong to the menu document and are edited on
 * its own screen.
 *
 * The public menu page needs it for one thing: a menu published before the page wording existed
 * has no `page` key, and `menuPageCopy` fills that gap with the default's wording. The editor
 * resolves the same way, so it shows exactly the words the site prints until the owner edits
 * them, and her first publish writes them into the document.
 *
 * It ships in this repo, so a default that no longer matches its shape is a build bug and
 * should be loud rather than half-drawn. Next-only (it imports JSON): the Netlify Functions
 * read the default through their own import, never through this module.
 */

import defaultMenu from '@/data/defaults/menu.json';
import type { MenuContent, MenuPageCopy } from '@/lib/menu-content';
import { parseMenuContent } from '@/lib/menu-content';

export const DEFAULT_MENU: MenuContent = (() => {
  const { menu, errors } = parseMenuContent(defaultMenu);
  if (menu === null) {
    throw new Error(`src/data/defaults/menu.json is not a valid menu: ${errors.join('; ')}`);
  }
  return menu;
})();

const DEFAULT_MENU_PAGE: MenuPageCopy = (() => {
  if (DEFAULT_MENU.page === undefined) {
    throw new Error('src/data/defaults/menu.json has no "page" wording — the menu page needs it.');
  }
  return DEFAULT_MENU.page;
})();

/** The menu page's wording: the document's own, or the default's for a menu that predates it. */
export function menuPageCopy(menu: MenuContent): MenuPageCopy {
  return menu.page ?? DEFAULT_MENU_PAGE;
}
