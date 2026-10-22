import Link from 'next/link';

import { AdminShell } from '@/components/admin/AdminShell';
import { MenuEditor } from '@/components/admin/MenuEditor';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export const metadata = buildAdminMetadata({
  title: 'Menu editor',
  description: 'Edit and publish the Native WILDFlour menu — sections, items and toppings.',
});

/** `/admin/menu/` — the menu editor. The page frames it; `MenuEditor` is the client tree. */
export default function AdminMenuPage() {
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
              Menu editor
            </span>
          </nav>
          <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">Menu editor</h1>
          <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
          <p className="mt-4 max-w-3xl text-bark/80">
            Edit below, watch the preview, and publish when it reads right. Every change is
            checked against the site’s copy rules before it can go live.
          </p>
        </div>

        <div className="mt-8">
          <MenuEditor />
        </div>
      </Container>
    </AdminShell>
  );
}
