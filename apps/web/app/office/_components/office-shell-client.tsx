'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OfficeShell, DEFAULT_OFFICE_NAV, type OfficeNavItem } from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';
import { Sparkles, Timer } from 'lucide-react';
import { NextLinkAdapter } from './link-next';
import { CommandPalette } from './command-palette';
import { CommandPaletteTrigger } from './command-palette-trigger';

interface Props {
  tenant: { name: string; logoUrl?: string; brandColor?: string };
  user: { name: string; email?: string; role?: string };
  activeNavId?: string;
  notificationCount?: number;
  children: React.ReactNode;
}

/**
 * Adattatore client-only di `OfficeShell` che:
 *  - aggancia `next/link` come componente di navigazione
 *  - implementa `onLogout` (signOut Supabase + redirect)
 *  - punta la voce "Home" al path /office
 */
// NAV con alberatura: alcune sezioni hanno sotto-voci che si espandono in sidebar.
const BASE_NAV: OfficeNavItem[] = DEFAULT_OFFICE_NAV.map((item) => {
  switch (item.id) {
    case 'home':
    case 'dashboard':
      return { ...item, href: '/office' };
    case 'commesse':
      return {
        ...item,
        href: '/office/commesse',
        children: [
          { id: 'commesse-tutte', label: 'Tutte', href: '/office/commesse' },
          { id: 'commesse-nuova', label: 'Nuova commessa', href: '/office/commesse/nuova' },
        ],
      };
    case 'tickets':
      return { ...item, href: '/office/tickets' };
    case 'clienti':
      return { ...item, href: '/office/clienti' };
    case 'ricerca':
      return { ...item, href: '/office/cerca' };
    case 'notifiche':
      return { ...item, href: '/office/notifiche' };
    case 'settings':
    case 'impostazioni':
      return {
        ...item,
        href: '/office/impostazioni',
        children: [
          { id: 'set-profilo', label: 'Profilo', href: '/office/impostazioni/profilo' },
          { id: 'set-voci', label: 'Voci catalogo', href: '/office/impostazioni/voci' },
          { id: 'set-preset', label: 'Preset di lavoro', href: '/office/impostazioni/preset' },
          { id: 'set-utenti', label: 'Utenti', href: '/office/impostazioni/utenti' },
          { id: 'set-branding', label: 'Branding', href: '/office/impostazioni/branding' },
          { id: 'set-storage', label: 'Storage', href: '/office/impostazioni/storage' },
        ],
      };
    default:
      return item;
  }
});

// Inseriamo "Turni & ore" subito dopo "Clienti" e "Co-pilot" prima di
// "Impostazioni" per coerenza di flusso (operativo → AI → config).
const NAV: OfficeNavItem[] = (() => {
  const out: OfficeNavItem[] = [];
  for (const item of BASE_NAV) {
    out.push(item);
    if (item.id === 'clienti') {
      out.push({
        id: 'turni',
        label: 'Turni & ore',
        href: '/office/turni',
        icon: Timer,
      });
    }
    if (item.id === 'notifiche') {
      out.push({
        id: 'copilot',
        label: 'Co-pilot',
        href: '/office/copilot',
        icon: Sparkles,
      });
    }
  }
  return out;
})();

/**
 * Deriva l'id della voce nav attiva dal pathname corrente. Logica:
 *  - match esatto su `href` ha priorità
 *  - altrimenti il primo `href` (non `/`) che è prefisso del pathname
 *  - default `home` se siamo su `/office`
 */
function deriveActiveId(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  // Flatten alberatura per il match (children inclusi)
  const flat: { id: string; href: string }[] = [];
  for (const n of NAV) {
    flat.push({ id: n.id, href: n.href });
    for (const c of n.children ?? []) flat.push({ id: c.id, href: c.href });
  }
  // 1. exact match — priorità ai children
  const exact = flat.find((n) => n.href === pathname);
  if (exact) return exact.id;
  // 2. longest prefix match (escludi root '/')
  const matches = flat
    .filter((n) => n.href !== '/' && pathname.startsWith(n.href))
    .sort((a, b) => b.href.length - a.href.length);
  if (matches[0]) return matches[0].id;
  if (pathname === '/office' || pathname.startsWith('/office?')) return 'home';
  return undefined;
}

export function OfficeShellClient({
  tenant,
  user,
  activeNavId,
  notificationCount,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const computedActiveId = activeNavId ?? deriveActiveId(pathname);

  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }, [router]);

  // Listener globale ⌘K / Ctrl+K → toggle palette. Niente repeat.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      // ignora se è già un input contenente "k" da modificatore tipo ⌥
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <OfficeShell
        tenant={tenant}
        user={user}
        navItems={NAV}
        activeNavId={computedActiveId}
        notificationCount={notificationCount}
        onLogout={handleLogout}
        onNotificationsClick={() => router.push('/office/notifiche')}
        linkComponent={NextLinkAdapter}
      >
        {children}
      </OfficeShell>
      <CommandPaletteTrigger onOpen={() => setPaletteOpen(true)} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onLogout={handleLogout}
      />
    </>
  );
}
