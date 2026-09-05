import Link from 'next/link';

import { AdminShell } from '@/components/admin/AdminShell';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PageEditor } from '@/components/admin/PageEditor';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export const metadata = buildAdminMetadata({
  title: 'Home page editor',
  description: 'Edit and publish the words on the Native WILDFlour home page.',
});

/** `/admin/home/` — the home page editor. The page frames it; `PageEditor` is the client tree. */
export default function AdminHomeEditorPage() {
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
              Home page
            </span>
          </nav>
          <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">Home page</h1>
          <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
          <p className="mt-4 max-w-3xl text-bark/80">
            The words a first-time visitor reads. Edit below, watch the preview, and publish when
            it reads right. The hours, address and phone number are filled in for you, and the
            menu cards come from the menu.
          </p>
        </div>

        <div className="mt-8">
          <PageEditor doc="home" />
        </div>
      </Container>
    </AdminShell>
  );
}
