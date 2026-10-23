import { AdminScreen } from '@/components/admin/AdminScreen';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PageEditor } from '@/components/admin/PageEditor';

export const metadata = buildAdminMetadata({
  title: 'Directions page editor',
  description: 'Edit and publish the walking directions on the Native WILDFlour site.',
});

/**
 * `/admin/directions/` — the directions editor. `AdminScreen` frames it; `PageEditor` is the client
 * tree.
 */
export default function AdminDirectionsEditorPage() {
  return (
    <AdminScreen
      title="Directions page"
      intro={
        <>
          The walk from each dock, the landmarks to steer by, and the questions visitors ask most.
          Edit below, watch the preview, and publish when it reads right. The map, the address and
          the hours are filled in for you.
        </>
      }
    >
      <PageEditor doc="directions" />
    </AdminScreen>
  );
}
