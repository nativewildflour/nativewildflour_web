import { notFound } from 'next/navigation';

import { buildAdminMetadata } from '@/components/admin/metadata';
import { PreviewPage } from '@/components/admin/previews/PreviewPage';
import { PREVIEW_DOCUMENT_KEYS, isPreviewDocumentKey } from '@/components/admin/previews/protocol';

export const metadata = buildAdminMetadata({
  title: 'Preview',
  description: 'A live preview of a Native WILDFlour page as it is being edited.',
});

/**
 * One prerendered route per previewable document. With `dynamicParams` off, this list is also
 * the whole set: anything else under `/admin/preview/` is a 404 rather than a render attempt.
 */
export function generateStaticParams() {
  return PREVIEW_DOCUMENT_KEYS.map((doc) => ({ doc }));
}

export const dynamicParams = false;

/**
 * `/admin/preview/<doc>/` — the document the page editors load in their preview frame. No
 * admin chrome: the frame shows the page and nothing else. Behind the same Basic-auth gate as
 * the rest of `/admin`, and it renders the committed default until an editor posts a draft.
 */
export default async function AdminPreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly doc: string }>;
}) {
  const { doc } = await params;
  if (!isPreviewDocumentKey(doc)) notFound();
  return <PreviewPage doc={doc} />;
}
