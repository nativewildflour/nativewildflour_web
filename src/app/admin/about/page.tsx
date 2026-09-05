import Link from 'next/link';

import { AdminShell } from '@/components/admin/AdminShell';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PageEditor } from '@/components/admin/PageEditor';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export const metadata = buildAdminMetadata({
  title: 'About page editor',
  description: 'Edit and publish the words on the Native WILDFlour about page.',
});

/** `/admin/about/` — the about page editor. The page frames it; `PageEditor` is the client tree. */
export default function AdminAboutEditorPage() {
  return (
    <AdminShell>
      <Container width="6xl">
        <div className="pt-8 sm:pt-10">
          {/* Current page at full bark, matching the public Breadcrumbs convention; the
              aria-hidden separator stays dim — it is decorative. */}
          <nav aria-label="Admin" className="text-sm font-semibold text-bark/70">
            <Link href="/admin/" className="text-blueberry no-underline hover:underline">
              Admin
            </Link>
            <span aria-hidden="true" className="mx-2 text-bark/40">
              /
            </span>
            <span aria-current="page" className="font-semibold text-bark">
              About page
            </span>
          </nav>
          <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">About page</h1>
          <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
          <p className="mt-4 max-w-3xl text-bark/80">
            Your story, in your own words. Edit below, watch the preview, and publish when it
            reads right. The topping chips come from the menu, and the address, hours and
            Facebook link are filled in for you.
          </p>
        </div>

        <div className="mt-8">
          <PageEditor doc="about" />
        </div>
      </Container>
    </AdminShell>
  );
}
