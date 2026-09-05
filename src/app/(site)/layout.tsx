import type { ReactNode } from 'react';

import { SiteChrome } from '@/components/SiteChrome';

/** Every public page shares the marketing frame; admin routes live outside this group. */
export default function SiteLayout({ children }: { readonly children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
