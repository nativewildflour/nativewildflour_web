import type { FaqItem } from '@/lib/content/directions';

export interface FaqProps {
  readonly items: readonly FaqItem[];
  readonly className?: string;
}

/**
 * Native `<details>` accordion — no client JavaScript. The `faq` / `faq-answer`
 * classes hook the unfold motion in globals.css: a height transition where the
 * browser can interpolate it, a fade-rise on the answer everywhere.
 */
export function Faq({ items, className = '' }: FaqProps) {
  return (
    <div className={`faq divide-y divide-dotted divide-wood/30 rounded-3xl bg-snow px-5 shadow-card ring-1 ring-bark/10 sm:px-7 ${className}`.trim()}>
      {items.map((item) => (
        <details key={item.question} className="group py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-bark transition-colors duration-200 marker:content-none hover:text-blueberry">
            <span>{item.question}</span>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky/50 text-xl leading-none text-blueberry transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="faq-answer mt-2 text-bark/85">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
