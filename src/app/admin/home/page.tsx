import { AdminScreen } from '@/components/admin/AdminScreen';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PageEditor } from '@/components/admin/PageEditor';

export const metadata = buildAdminMetadata({
  title: 'Home page editor',
  description: 'Edit and publish the words on the Native WILDFlour home page.',
});

/**
 * `/admin/home/` — the home page editor. `AdminScreen` frames it; `PageEditor` is the client tree.
 */
export default function AdminHomeEditorPage() {
  return (
    <AdminScreen
      title="Home page"
      intro={
        <>
          The words a first-time visitor reads. Edit below, watch the preview, and publish when it
          reads right. The hours, address and phone number are filled in for you, and the menu
          cards come from the menu.
        </>
      }
    >
      <PageEditor doc="home" />
    </AdminScreen>
  );
}
