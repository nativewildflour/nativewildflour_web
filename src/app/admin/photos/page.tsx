import { AdminScreen } from '@/components/admin/AdminScreen';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PhotoLibrary } from '@/components/admin/PhotoLibrary';

export const metadata = buildAdminMetadata({
  title: 'Photos',
  description: 'Add, review and remove the photographs used on the Native WILDFlour site.',
});

/**
 * `/admin/photos/` — the photo library. `AdminScreen` frames it; `PhotoLibrary` is the client tree.
 */
export default function AdminPhotosPage() {
  return (
    <AdminScreen
      title="Photos"
      intro={
        <>
          Every picture the site can use. Add one here or from any picture slot on a page — they
          all collect in the same place, and the same photo can sit in as many slots as you like.
        </>
      }
    >
      <PhotoLibrary />
    </AdminScreen>
  );
}
