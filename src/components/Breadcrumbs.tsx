import Link from 'next/link';

import type { BreadcrumbItem } from '@/lib/schema';

export interface BreadcrumbsProps {
  /** Ordered trail. The last entry is the current page and is not linked. */
  readonly items: readonly BreadcrumbItem[];
  readonly className?: string;
}

/**
 * Visible breadcrumb trail. Pass the same `items` to `breadcrumbSchema()`
 * so the markup and the JSON-LD always agree.
 */
export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`.trim()}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-bark/70">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-bark/40">
                  /
                </span>
              ) : null}
              {isCurrent ? (
                <span aria-current="page" className="font-semibold text-bark">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-bark"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
