/**
 * The menu. No prices are known, so no prices are printed anywhere.
 * See docs/BRIEF.md §1. Do not add items that are not listed there.
 */

export interface MenuItemData {
  readonly name: string;
  /** Optional one line. Never a price. */
  readonly description?: string;
}

export interface MenuSectionData {
  /** Stable slug, used for `id` anchors and React keys. */
  readonly id: string;
  readonly name: string;
  /** Optional one-line lead-in shown under the section heading. */
  readonly description?: string;
  readonly items: readonly MenuItemData[];
  /**
   * Topping chips rendered under the section. Presence also marks the section as the
   * full-width feature card on the menu page and in the home-page highlights.
   */
  readonly toppings?: readonly string[];
  /** Set false to leave a section out of the home page's "Menu highlights" preview. */
  readonly highlight?: boolean;
}

/** Chip list rendered under the bannock section. */
export const BANNOCK_TOPPINGS: readonly string[] = [
  'Butter',
  'Strawberry jam',
  'Powdered sugar',
  'Nutella',
  'Honey',
  'Homemade rhubarb jam',
];

export const MENU_SECTIONS: readonly MenuSectionData[] = [
  {
    id: 'bannock',
    name: 'Alaskan Bannock',
    description: 'Fresh fried bread from a passed-down family recipe, made to order.',
    items: [
      {
        name: 'Alaskan Bannock',
        description: 'One golden piece, fried when you order it — then pick a topping below.',
      },
    ],
    toppings: BANNOCK_TOPPINGS,
  },
  {
    id: 'lunch-specials',
    name: 'Savory Bannock Lunch Specials',
    description: 'A different savory bannock most days. They often sell out, so come early.',
    items: [
      {
        name: 'Native Bannock with sausage, green onions & cheddar',
        description: 'One example of the savory specials that rotate daily.',
      },
    ],
  },
  {
    id: 'baked-goods',
    name: 'House-Baked Goods',
    description: 'Baked in-house and rotating daily.',
    items: [
      { name: 'Homemade cookies', description: 'Baked fresh — M&M cookies, for example.' },
      { name: 'Muffins', description: 'Baked fresh — poppy seed, for example.' },
    ],
  },
  {
    id: 'coffee-and-tea',
    name: 'Coffee & Tea',
    description: 'Alaska-roasted coffee and hot tea for a misty Skagway morning.',
    items: [
      {
        name: 'Kaladi Brothers drip coffee',
        description: 'Alaska-roasted coffee, brewed fresh.',
      },
      { name: 'Hot tea', description: 'Your choice of tea.' },
    ],
  },
  {
    id: 'cold-drinks',
    name: 'Cold Drinks',
    // The home page deliberately teases "including cold drinks" and links here instead.
    highlight: false,
    items: [
      { name: 'Tiki Breeze', description: 'An iced, fruity refresher.' },
      { name: 'Bottled water', description: 'Cold and ready to go.' },
      { name: 'Coke' },
      { name: 'Diet Coke' },
      { name: 'Sprite' },
    ],
  },
];

/** Shown near the top of the menu page and anywhere the menu is summarized. */
export const MENU_PRICE_NOTE = 'Prices are posted at the counter.';

export const MENU_SPECIALS_NOTE = 'Check our Facebook page for today’s lunch special.';

export const MENU_INTRO =
  'Everything is made fresh daily. The savory lunch specials rotate and often sell out, so come early. Prices are posted at the counter — ask at the window for today’s specials.';
