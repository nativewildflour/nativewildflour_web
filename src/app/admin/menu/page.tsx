import { AdminScreen } from '@/components/admin/AdminScreen';
import { buildAdminMetadata } from '@/components/admin/metadata';
import { MenuEditor } from '@/components/admin/MenuEditor';

export const metadata = buildAdminMetadata({
  title: 'Menu editor',
  description: 'Edit and publish the Native WILDFlour menu — sections, items and toppings.',
});

/** `/admin/menu/` — the menu editor. `AdminScreen` frames it; `MenuEditor` is the client tree. */
export default function AdminMenuPage() {
  return (
    <AdminScreen
      title="Menu editor"
      intro={
        <>
          Edit below, watch the preview, and publish when it reads right. Every change is checked
          against the site’s copy rules before it can go live.
        </>
      }
    >
      <MenuEditor />
    </AdminScreen>
  );
}
