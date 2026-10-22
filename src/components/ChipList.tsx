export interface ChipListProps {
  /** Chip labels, rendered in order. */
  readonly items: readonly string[];
  /** `id` of a heading that labels the list, wired to `aria-labelledby`. */
  readonly labelledBy?: string;
  readonly className?: string;
}

/** Small pill chips for short lists (e.g. the bannock toppings) — one style everywhere. */
export function ChipList({ items, labelledBy, className = '' }: ChipListProps) {
  return (
    <ul
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
      className={`flex flex-wrap gap-2 ${className}`.trim()}
    >
      {items.map((item, index) => (
        <li
          key={index}
          className="rounded-full bg-snow px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-bark shadow-press ring-1 ring-wood/25"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
