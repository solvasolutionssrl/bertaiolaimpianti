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
  MapPin,
  QrCode,
  Clock,
} from 'lucide-react';

import { MobileBottomNav, type MobileTab, type MobileTabId } from '@kommessa/ui';
import type { MobileShell, AppMode } from '@kommessa/api/types';

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
  appMode = 'kommessa',
  userId,
  tenantId,
}: {
  unreadCount: number;
  shell: MobileShell;
  appMode?: AppMode;
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

  let tabs: MobileTab[];
  if (shell === 'kantiere') {
    // PWA solo Kantiere — "a prova di cantiere": tap target grandi.
    tabs = [
      { id: 'cantieri', label: 'Cantieri', icon: MapPin, href: '/mobile/kantiere/cantieri' },
      { id: 'ore', label: 'Ore', icon: Clock, href: '/mobile/kantiere/ore' },
      { id: 'scansiona', label: 'Scansiona', icon: QrCode, href: '/mobile/kantiere/scansiona', primary: true },
      { id: 'notifiche', label: 'Attività', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
      { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
    ];
  } else if (shell === 'gestione') {
    // INVARIATO per app_mode='kommessa'.
    tabs = [
      { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, href: '/mobile' },
      { id: 'commesse', label: 'Commesse', icon: Briefcase, href: '/mobile/commesse' },
      { id: 'voce', label: 'Nuova', icon: Mic, href: '/mobile/voice-intake', primary: true, cornerBadge: '+' },
      { id: 'notifiche', label: 'Attività', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
      { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
    ];
  } else {
    // INVARIATO per app_mode='kommessa' (shell 'campo').
    tabs = [
      { id: 'commesse', label: 'Oggi', icon: Briefcase, href: '/mobile' },
      { id: 'turno', label: 'Turno', icon: Timer, href: '/mobile/turno' },
      { id: 'voce', label: 'Nuova', icon: Mic, href: '/mobile/voice-intake', primary: true, cornerBadge: '+' },
      { id: 'notifiche', label: 'Attività', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
      { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
    ];
  }

  // app_mode='full': shell kommessa (gestione/campo) + entry point Kantiere.
  // Inietta lo slot "Scansiona" al posto del Profilo (raggiungibile dall'home),
  // così resta a 5 slot. Per 'kommessa' NON entra mai qui (zero diff Bertaiola).
  if (appMode === 'full' && shell !== 'kantiere') {
    tabs = [
      ...tabs.slice(0, 4),
      { id: 'scansiona', label: 'Kantiere', icon: QrCode, href: '/mobile/kantiere' },
    ];
  }

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
