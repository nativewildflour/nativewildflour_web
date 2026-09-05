/**
 * The committed default menu, parsed once for the admin client tree.
 *
 * Three screens need it and none of them can read the store: the menu editor falls back to it
 * when nothing is saved, and the home and about previews take their highlight cards and topping
 * chips from it because those belong to the menu document and are edited on its own screen.
 *
 * It ships in this repo, so a default that no longer matches its shape is a build bug and
 * should be loud rather than half-drawn.
 */

import defaultMenu from '@/data/defaults/menu.json';
import type { MenuContent } from '@/lib/menu-content';
import { parseMenuContent } from '@/lib/menu-content';

export const DEFAULT_MENU: MenuContent = (() => {
  const { menu, errors } = parseMenuContent(defaultMenu);
  if (menu === null) {
    throw new Error(`src/data/defaults/menu.json is not a valid menu: ${errors.join('; ')}`);
  }
  return menu;
})();
