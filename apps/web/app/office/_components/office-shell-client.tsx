'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OfficeShell, DEFAULT_OFFICE_NAV, type OfficeNavItem } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import {
  Bell,
  Briefcase,
  HardHat,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import { NextLinkAdapter } from './link-next';
import { CommandPalette } from './command-palette';
import { CommandPaletteTrigger } from './command-palette-trigger';

interface Props {
  tenant: { name: string; logoUrl?: string; brandColor?: string };
  user: { name: string; email?: string; role?: string };
  activeNavId?: string;
  notificationCount?: number;
  hasKantiere?: boolean;
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
      return { ...item, href: '/office/commesse' };
    case 'tickets':
      return { ...item, href: '/office/tickets' };
    case 'todo':
      // Etichetta visibile: "Task" (più immediato di "TODO" in italiano)
      return { ...item, label: 'Task', href: '/office/todo' };
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
// BASE_FULL_NAV: nav statica senza voci per moduli opzionali.
const BASE_FULL_NAV: OfficeNavItem[] = (() => {
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
 * Costruisce la NAV finale in base ai moduli attivi del tenant.
 *
 * - hasKantiere=false (Bertaiola): struttura ATTUALE invariata.
 * - hasKantiere=true  (FPM e simili): struttura con gruppi "Commessa" e
 *   "Kantiere" come moduli add-on + Dipendenti come voce globale.
 */
function buildNav(hasKantiere?: boolean): OfficeNavItem[] {
  if (!hasKantiere) {
    // Ramo Bertaiola: riproduce esattamente BASE_FULL_NAV (nessuna modifica).
    return [...BASE_FULL_NAV];
  }

  // Ramo FPM / hasKantiere=true: struttura riorganizzata con moduli.
  const impostazioniBase = BASE_FULL_NAV.find((i) => i.id === 'impostazioni');
  const impostazioniChildren: OfficeNavItem[] = impostazioniBase?.children
    ? [...impostazioniBase.children]
    : [
        { id: 'set-profilo', label: 'Profilo', href: '/office/impostazioni/profilo' },
        { id: 'set-voci', label: 'Voci catalogo', href: '/office/impostazioni/voci' },
        { id: 'set-preset', label: 'Preset di lavoro', href: '/office/impostazioni/preset' },
        { id: 'set-utenti', label: 'Utenti', href: '/office/impostazioni/utenti' },
        { id: 'set-branding', label: 'Branding', href: '/office/impostazioni/branding' },
        { id: 'set-storage', label: 'Storage', href: '/office/impostazioni/storage' },
      ];

  return [
    // 1. Dashboard
    {
      id: 'home',
      label: 'Dashboard',
      href: '/office',
      icon: LayoutDashboard,
    },
    // 2. Commessa [gruppo, variant module]
    {
      id: 'commessa',
      label: 'Commessa',
      href: '/office/commesse',
      icon: Briefcase,
      variant: 'module',
      children: [
        { id: 'commesse', label: 'Commesse', href: '/office/commesse' },
        { id: 'todo', label: 'Task', href: '/office/todo' },
      ],
    },
    // 3. Clienti
    {
      id: 'clienti',
      label: 'Clienti',
      href: '/office/clienti',
      icon: Users,
    },
    // 4. Dipendenti — voce GLOBALE (fuori da Kantiere)
    {
      id: 'dipendenti',
      label: 'Dipendenti',
      href: '/office/kantiere/dipendenti',
      icon: Users,
    },
    // 5. Turni & ore
    {
      id: 'turni',
      label: 'Turni & ore',
      href: '/office/turni',
      icon: Timer,
    },
    // 6. Ricerca
    {
      id: 'ricerca',
      label: 'Ricerca',
      href: '/office/cerca',
      icon: Search,
    },
    // 7. Avvisi
    {
      id: 'notifiche',
      label: 'Avvisi',
      href: '/office/notifiche',
      icon: Bell,
    },
    // 8. Co-pilot
    {
      id: 'copilot',
      label: 'Co-pilot',
      href: '/office/copilot',
      icon: Sparkles,
    },
    // 9. Kantiere [gruppo, variant module] — SOPRA Impostazioni
    {
      id: 'kantiere',
      label: 'Kantiere',
      href: '/office/kantiere',
      icon: HardHat,
      variant: 'module',
      children: [
        { id: 'kant-overview', label: 'Panoramica', href: '/office/kantiere' },
        { id: 'kant-cantieri', label: 'Cantieri', href: '/office/kantiere/cantieri' },
        { id: 'kant-qr', label: 'QR code', href: '/office/kantiere/qr' },
        { id: 'kant-rapp', label: 'Rapportini', href: '/office/kantiere/rapportini' },
        { id: 'kant-report', label: 'Report', href: '/office/kantiere/report' },
        { id: 'kant-anom', label: 'Anomalie', href: '/office/kantiere/anomalie' },
      ],
    },
    // 10. Impostazioni — children esistenti + voce Kantiere (gated hasKantiere)
    {
      id: 'impostazioni',
      label: 'Impostazioni',
      href: '/office/impostazioni',
      icon: Settings,
      children: [
        ...impostazioniChildren,
        { id: 'set-kantiere', label: 'Kantiere', href: '/office/impostazioni/kantiere' },
      ],
    },
  ];
}

/**
 * Deriva l'id della voce nav attiva dal pathname corrente. Logica:
 *  - match esatto su `href` ha priorità
 *  - altrimenti il primo `href` (non `/`) che è prefisso del pathname
 *  - default `home` se siamo su `/office`
 */
function deriveActiveId(pathname: string | null, nav: OfficeNavItem[]): string | undefined {
  if (!pathname) return undefined;
  // Flatten alberatura per il match (children inclusi)
  const flat: { id: string; href: string }[] = [];
  for (const n of nav) {
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
  hasKantiere,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const nav = buildNav(hasKantiere);
  const computedActiveId = activeNavId ?? deriveActiveId(pathname, nav);

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
        navItems={nav}
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
