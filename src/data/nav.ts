/** Primary navigation. Order matters; every path keeps its trailing slash. */

export interface NavLink {
  readonly href: string;
  readonly label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/menu/', label: 'Menu' },
  { href: '/about/', label: 'About' },
  { href: '/directions/', label: 'Directions' },
];
