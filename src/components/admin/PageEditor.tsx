'use client';

/**
 * The editor for a page document — home, about or directions.
 *
 * There is one of these rather than three because there is nothing page-specific left once the
 * field spec describes the shape: the shared core (`useDocumentEditor`) holds the state, the
 * frame draws the chrome, `SchemaFields` draws the controls, and `describeSpecPath` names the
 * fields an issue points at. What a page still gets to say for itself is the seed it falls
 * back to, the sentence on the publish confirmation, and which preview to render.
 */

import type { DocumentParser } from '@/components/admin/api';
import { DocumentEditorFrame } from '@/components/admin/DocumentEditorFrame';
import { toleratingSlugs } from '@/components/admin/draft-storage';
import { PreviewHost } from '@/components/admin/previews/PreviewHost';
import { SchemaFields } from '@/components/admin/SchemaFields';
import { useDocumentEditor } from '@/components/admin/use-document-editor';
import aboutSeed from '@/data/defaults/about.json';
import directionsSeed from '@/data/defaults/directions.json';
import homeSeed from '@/data/defaults/home.json';
import type { DocumentKey } from '@/lib/content-docs';
import { DOCUMENTS } from '@/lib/content-docs';
import type { DocumentSpec } from '@/lib/content-schema';
import { describeSpecPath } from '@/lib/content-schema';
import type { AboutContent } from '@/lib/content/about';
import type { DirectionsContent } from '@/lib/content/directions';
import type { HomeContent } from '@/lib/content/home';
import type { ContentRules, CopyIssue } from '@/lib/copy-rules';

/** Every document the field spec can draw — the menu keeps its own editor. */
export type PageDocumentKey = Exclude<DocumentKey, 'menu'>;

interface PageConfig<T extends object> {
  readonly key: PageDocumentKey;
  /** Lowercase noun phrase, spliced into the core's sentences: "Publish this home page?" */
  readonly label: string;
  readonly spec: DocumentSpec;
  readonly seed: T;
  readonly parse: DocumentParser<T>;
  /** `parse`, tolerant of the one structural check an owner can type into (a slug). */
  readonly parseDraft: DocumentParser<T>;
  readonly validate: (document: T, rules: ContentRules | null) => readonly CopyIssue[];
  readonly summarize: (document: T) => string;
  /** Names the page in the preview box, e.g. "The home page". */
  readonly previewTitle: string;
}

/** "1 dock" / "4 docks" — the publish confirmations count things worth double-checking. */
function count(total: number, noun: string): string {
  return total === 1 ? `1 ${noun}` : `${total} ${noun}s`;
}

/**
 * Binds one registry entry to its committed seed. The seed is parsed once, here: it ships in
 * this repo, so a seed that no longer matches its spec is a build bug and should be loud.
 */
function buildConfig<T extends object>(
  key: PageDocumentKey,
  seedJson: unknown,
  summarize: (document: T) => string,
  previewTitle: string,
): PageConfig<T> {
  const definition = DOCUMENTS[key];
  const spec = definition.spec;
  if (spec === null) throw new Error(`The ${key} document has no field spec.`);

  const parse: DocumentParser<T> = (value) => {
    const result = definition.parse(value);
    return { document: result.document as T | null, errors: result.errors };
  };

  const { document, errors } = parse(seedJson);
  if (document === null) {
    throw new Error(`src/data/defaults/${key}.json is invalid: ${errors.join('; ')}`);
  }

  return {
    key,
    label: definition.label.toLowerCase(),
    spec,
    seed: document,
    parse,
    parseDraft: toleratingSlugs(parse, spec),
    validate: (value, rules) => definition.validate(value, rules).issues,
    summarize,
    previewTitle,
  };
}

const HOME_CONFIG = buildConfig<HomeContent>(
  'home',
  homeSeed,
  (document) =>
    `The whole home page goes live, with ${count(document.bannock.features.length, 'small card')} under the bannock story.`,
  'The home page',
);

const ABOUT_CONFIG = buildConfig<AboutContent>(
  'about',
  aboutSeed,
  (document) =>
    `The whole about page goes live, with ${count(document.madeInSkagway.cards.length, 'card')} in the Made in Skagway row.`,
  'The about page',
);

const DIRECTIONS_CONFIG = buildConfig<DirectionsContent>(
  'directions',
  directionsSeed,
  (document) =>
    `The whole directions page goes live, with ${count(document.docks.items.length, 'dock')} and ${count(document.faq.items.length, 'question')}.`,
  'The directions page',
);

function PageDocumentEditor<T extends object>({ config }: { readonly config: PageConfig<T> }) {
  const editor = useDocumentEditor<T>({
    doc: config.key,
    label: config.label,
    seed: config.seed,
    parse: config.parse,
    parseDraft: config.parseDraft,
    validate: config.validate,
    summarize: config.summarize,
  });

  return (
    <DocumentEditorFrame
      editor={editor}
      previewLabel="page preview"
      describePath={(path) => describeSpecPath(config.spec, editor.present, path)}
      preview={
        <PreviewHost doc={config.key} document={editor.present} title={config.previewTitle} />
      }
    >
      <SchemaFields
        spec={config.spec}
        document={editor.present}
        onChange={editor.applyEdit}
        readOnly={editor.readOnly}
        announce={editor.announce}
        requestConfirm={editor.requestConfirm}
        closeConfirm={editor.closeConfirm}
      />
    </DocumentEditorFrame>
  );
}

export interface PageEditorProps {
  readonly doc: PageDocumentKey;
}

export function PageEditor({ doc }: PageEditorProps) {
  switch (doc) {
    case 'home':
      return <PageDocumentEditor config={HOME_CONFIG} />;
    case 'about':
      return <PageDocumentEditor config={ABOUT_CONFIG} />;
    case 'directions':
      return <PageDocumentEditor config={DIRECTIONS_CONFIG} />;
  }
}
