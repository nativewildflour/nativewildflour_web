import { AdminScreen } from '@/components/admin/AdminScreen';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { PageEditor } from '@/components/admin/PageEditor';

export const metadata = buildAdminMetadata({
  title: 'About page editor',
  description: 'Edit and publish the words on the Native WILDFlour about page.',
});

/**
 * `/admin/about/` — the about page editor. `AdminScreen` frames it; `PageEditor` is the client
 * tree.
 */
export default function AdminAboutEditorPage() {
  return (
    <AdminScreen
      title="About page"
      intro={
        <>
          Your story, in your own words. Edit below, watch the preview, and publish when it reads
          right. The topping chips come from the menu, and the address, hours and Facebook link
          are filled in for you.
        </>
      }
    >
      <PageEditor doc="about" />
    </AdminScreen>
  );
}
