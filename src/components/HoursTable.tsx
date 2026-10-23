import { HOURS_ROWS } from '@/data/business';

export interface HoursTableProps {
  readonly className?: string;
  /** Visually hidden by default; pass `showCaption` to display it. */
  readonly caption?: string;
  readonly showCaption?: boolean;
  /** `light` for cream/snow surfaces (default); `dark` for the spruce footer. */
  readonly tone?: 'light' | 'dark';
}

const TONES = {
  light: {
    caption: 'text-bark/70',
    row: 'border-bark/10',
    day: 'text-bark',
    open: 'text-bark',
    closed: 'text-bark/70',
  },
  dark: {
    caption: 'text-cream/70',
    row: 'border-snow/15',
    day: 'text-snow',
    open: 'text-cream',
    closed: 'text-cream/65',
  },
} as const;

/** Opening hours, one row per day, straight from `src/data/business.ts`. */
export function HoursTable({
  className = '',
  caption = 'Opening hours',
  showCaption = false,
  tone = 'light',
}: HoursTableProps) {
  const t = TONES[tone];

  return (
    <table className={`w-full max-w-sm border-collapse text-left ${className}`.trim()}>
      <caption
        className={
          showCaption
            ? `pb-2 text-left text-sm font-bold tracking-wide uppercase ${t.caption}`
            : 'sr-only'
        }
      >
        {caption}
      </caption>
      <tbody>
        {HOURS_ROWS.map((row) => (
          <tr key={row.day} className={`border-b last:border-b-0 ${t.row}`}>
            <th scope="row" className={`py-2 pr-4 font-semibold ${t.day}`}>
              {row.day}
            </th>
            <td
              className={`py-2 text-right whitespace-nowrap tabular-nums ${row.closed ? t.closed : t.open}`}
            >
              {row.hours}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
