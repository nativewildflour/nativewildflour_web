import type { SchemaObject } from '@/lib/schema';

export interface JsonLdProps {
  /** One schema object, or an array of them (a top-level JSON-LD array is valid). */
  readonly data: SchemaObject | readonly SchemaObject[];
  /** Optional `id` on the script tag, handy when a page emits several. */
  readonly id?: string;
}

/** Renders `<script type="application/ld+json">`. Server component only. */
export function JsonLd({ data, id }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
