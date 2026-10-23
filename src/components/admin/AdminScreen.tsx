import Link from 'next/link';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/AdminShell';
import { Container } from '@/components/Container';
import { TitleStroke } from '@/components/Decor';

export interface AdminScreenProps {
  /** The screen's name — its breadcrumb and its one `<h1>`. */
  readonly title: string;
  /** One short paragraph under the heading: what the screen is for. */
  readonly intro: ReactNode;
  /** The client tree the screen hosts (an editor, the photo library). */
  readonly children: ReactNode;
}

/**
 * The frame every admin screen under `/admin/` shares: the shell, a breadcrumb back to the admin
 * home, the heading and its intro, then the screen's own client tree. Each screen's page file
 * supplies only its metadata, its words and that tree.
 */
export function AdminScreen({ title, intro, children }: AdminScreenProps) {
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
              {title}
            </span>
          </nav>
          <h1 className="mt-3 text-4xl font-black text-bark sm:text-5xl">{title}</h1>
          <TitleStroke draw className="mt-3 h-2 w-28 text-honey" />
          <p className="mt-4 max-w-3xl text-bark/80">{intro}</p>
        </div>

        <div className="mt-8">{children}</div>
      </Container>
    </AdminShell>
  );
}
