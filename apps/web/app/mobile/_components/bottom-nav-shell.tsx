'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  MobileBottomNav,
  type MobileTab,
  type MobileTabId,
} from '@impiantixplus/ui';

/**
 * Wrapper client del bottom-nav: serve solo a calcolare l'`activeTab` dalla
 * pathname corrente (il layout server-async non può usare `usePathname`).
 */
export function BottomNavShell({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname() ?? '';
  const activeTab = matchActive(pathname, tabs);

  return (
    <MobileBottomNav
      tabs={tabs}
      activeTab={activeTab}
      linkComponent={({ href, children, ...rest }) => (
        <Link href={href} {...rest}>
          {children}
        </Link>
      )}
    />
  );
}

function matchActive(
  pathname: string,
  tabs: MobileTab[],
): MobileTabId | undefined {
  // Best-match: tab con href più lungo che fa da prefisso, escludendo "/mobile"
  // se ci sono match più specifici.
  let best: { tab: MobileTab; len: number } | null = null;
  for (const t of tabs) {
    const href = t.href;
    if (pathname === href || pathname.startsWith(href + '/')) {
      if (!best || href.length > best.len) {
        best = { tab: t, len: href.length };
      }
    }
  }
  return best?.tab.id;
}
