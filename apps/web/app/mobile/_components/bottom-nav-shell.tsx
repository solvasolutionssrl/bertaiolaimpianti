'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Timer,
  Mic,
  Bell,
  User,
  LayoutDashboard,
} from 'lucide-react';

import { MobileBottomNav, type MobileTab, type MobileTabId } from '@impiantixplus/ui';
import type { MobileShell } from '@impiantixplus/api/types';

/**
 * Wrapper client del bottom-nav.
 * Le icone (React components) devono vivere nel client — non sono serializzabili
 * da Server Component. Il server passa solo `unreadCount` (number) e `shell`
 * (string letterale), entrambi serializzabili.
 */
export function BottomNavShell({
  unreadCount,
  shell,
}: {
  unreadCount: number;
  shell: MobileShell;
}) {
  const pathname = usePathname() ?? '';

  const tabs: MobileTab[] =
    shell === 'gestione'
      ? [
          { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, href: '/mobile' },
          { id: 'commesse', label: 'Commesse', icon: Briefcase, href: '/mobile/commesse' },
          { id: 'voce', label: 'Voce', icon: Mic, href: '/mobile/voice-intake', primary: true },
          { id: 'notifiche', label: 'Inbox', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
          { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
        ]
      : [
          { id: 'commesse', label: 'Oggi', icon: Briefcase, href: '/mobile' },
          { id: 'turno', label: 'Turno', icon: Timer, href: '/mobile/turno' },
          { id: 'voce', label: 'Voce', icon: Mic, href: '/mobile/voice-intake', primary: true },
          { id: 'notifiche', label: 'Inbox', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
          { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
        ];

  const activeTab = matchActive(pathname, tabs, shell);

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
  shell: MobileShell,
): MobileTabId | undefined {
  // For gestione shell, /mobile exact match should highlight 'overview', not 'commesse'
  if (shell === 'gestione' && pathname === '/mobile') return 'overview';

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
