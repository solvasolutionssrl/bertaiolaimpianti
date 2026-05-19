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

import { useRealtimeUnread } from './use-realtime-unread';

/**
 * Wrapper client del bottom-nav.
 * Le icone (React components) devono vivere nel client — non sono serializzabili
 * da Server Component. Il server passa initial unread count + userId + tenantId
 * (tutti serializzabili) e qui usiamo Supabase Realtime per aggiornare il badge
 * senza refresh quando arrivano nuove notifiche.
 */
export function BottomNavShell({
  unreadCount: initialUnreadCount,
  shell,
  userId,
  tenantId,
}: {
  unreadCount: number;
  shell: MobileShell;
  userId: string;
  tenantId: string;
}) {
  const pathname = usePathname() ?? '';

  // Real-time: sostituisce il count statico con uno live aggiornato dal canale
  const unreadCount = useRealtimeUnread({
    userId,
    tenantId,
    initialCount: initialUnreadCount,
  });

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
