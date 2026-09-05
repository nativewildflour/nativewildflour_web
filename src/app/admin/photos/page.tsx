import Link from 'next/link';

import { AdminShell } from '@/components/admin/AdminShell';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PhotoLibrary } from '@/components/admin/PhotoLibrary';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export const metadata = buildAdminMetadata({
  title: 'Photos',
  description: 'Add, review and remove the photographs used on the Native WILDFlour site.',
});

/** `/admin/photos/` — the photo library. The page frames it; `PhotoLibrary` is the client tree. */
export default function AdminPhotosPage() {
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
              Photos
            </span>
          </nav>
          <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">Photos</h1>
          <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
          <p className="mt-4 max-w-3xl text-bark/80">
            Every picture the site can use. Add one here or from any picture slot on a page —
            they all collect in the same place, and the same photo can sit in as many slots as
            you like.
          </p>
        </div>

        <div className="mt-8">
          <PhotoLibrary />
        </div>
      </Container>
    </AdminShell>
  );
}
