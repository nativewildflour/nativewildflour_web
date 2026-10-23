/**
 * One brand accent per menu category, used as wayfinding: the same color marks
 * the jump-link legend dot, the stroke under the category heading (menu page
 * and home highlights), and the `:target` flash after an anchor jump. All
 * values are palette tokens from globals.css — never new hues. Accents are
 * decorative (paired with text or aria-hidden), so they carry no contrast
 * requirement of their own.
 */
export interface MenuAccent {
  /** Tailwind `text-*` class for the heading stroke. */
  readonly stroke: string;
  /** Tailwind `bg-*` class for the jump-link legend dot. */
  readonly dot: string;
  /** CSS color value for the `--target-accent` flash. */
  readonly color: string;
}

/**
 * A Map, not an object literal: section ids are the owner's slugs, and an object lookup would
 * resolve one named "constructor" to the inherited Object prototype member.
 */
const MENU_ACCENTS: ReadonlyMap<string, MenuAccent> = new Map([
  ['bannock', { stroke: 'text-honey', dot: 'bg-honey', color: 'var(--color-honey)' }],
  ['lunch-specials', { stroke: 'text-fireweed', dot: 'bg-fireweed', color: 'var(--color-fireweed)' }],
  ['baked-goods', { stroke: 'text-wood', dot: 'bg-wood', color: 'var(--color-wood)' }],
  ['coffee-and-tea', { stroke: 'text-spruce', dot: 'bg-spruce', color: 'var(--color-spruce)' }],
  ['cold-drinks', { stroke: 'text-blueberry', dot: 'bg-blueberry', color: 'var(--color-blueberry)' }],
]);

const DEFAULT_ACCENT: MenuAccent = {
  stroke: 'text-honey',
  dot: 'bg-honey',
  color: 'var(--color-honey)',
};

/** Accent for a menu section id; new sections fall back to honey until assigned. */
export function menuAccent(sectionId: string): MenuAccent {
  return MENU_ACCENTS.get(sectionId) ?? DEFAULT_ACCENT;
}
