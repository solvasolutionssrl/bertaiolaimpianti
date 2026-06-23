'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OfficeShell, DEFAULT_OFFICE_NAV, type OfficeNavItem } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import {
  Boxes,
  Briefcase,
  Coins,
  HardHat,
  LayoutDashboard,
  MapPin,
  Sparkles,
  Timer,
  Truck,
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
  /** Esperienza app del tenant. 'kantiere' = office puro-Kantiere (no commessa). */
  appMode?: 'kommessa' | 'kantiere' | 'full';
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
 * - hasKantiere=true + appMode='kantiere' (FPM): tenant PURO-Kantiere → NIENTE
 *   commessa (no gruppo Kommessa, no Clienti). Dashboard = Panoramica Kantiere.
 * - hasKantiere=true + appMode kommessa/full: struttura con gruppi "Kommessa" e
 *   "Kantiere" come moduli add-on + Dipendenti come voce globale.
 */
function buildNav(
  hasKantiere?: boolean,
  appMode?: 'kommessa' | 'kantiere' | 'full',
): OfficeNavItem[] {
  if (!hasKantiere) {
    // Ramo Bertaiola: riproduce esattamente BASE_FULL_NAV (nessuna modifica).
    return [...BASE_FULL_NAV];
  }

  if (appMode === 'kantiere') {
    // Tenant puro-Kantiere (es. FPM): si toglie SOLO il mondo commessa
    // (Commesse, Task, e Turni — che è il foglio-ore aggregato per commessa).
    // Clienti resta (fa parte anche di Kantiere). Tutto il resto invariato.
    return [
      { id: 'home', label: 'Dashboard', href: '/office/kantiere', icon: LayoutDashboard },
      {
        id: 'sec-azienda',
        label: 'Azienda',
        href: '#',
        icon: Users,
        variant: 'section',
        defaultOpen: true,
        children: [
          { id: 'dipendenti', label: 'Dipendenti', href: '/office/kantiere/dipendenti' },
          { id: 'mezzi', label: 'Parco mezzi', href: '/office/kantiere/mezzi', icon: Truck },
          { id: 'sedi', label: 'Sedi', href: '/office/kantiere/sedi', icon: MapPin },
          { id: 'clienti', label: 'Clienti', href: '/office/clienti' },
        ],
      },
      {
        id: 'sec-kantiere',
        label: 'Kantiere',
        href: '#',
        icon: HardHat,
        variant: 'module',
        defaultOpen: true,
        children: [
          { id: 'kant-cantieri', label: 'Cantieri', href: '/office/kantiere/cantieri' },
          { id: 'kant-qr', label: 'QR code', href: '/office/kantiere/qr' },
          { id: 'kant-rapp', label: 'Presenze e ore', href: '/office/kantiere/rapportini' },
          { id: 'kant-ore-costi', label: 'Ore e costi', href: '/office/kantiere/ore-costi', icon: Coins },
          { id: 'kant-report', label: 'Report', href: '/office/kantiere/report' },
          { id: 'kant-anom', label: 'Anomalie', href: '/office/kantiere/anomalie' },
        ],
      },
      {
        id: 'sec-altro',
        label: 'Altro',
        href: '#',
        icon: Boxes,
        variant: 'section',
        defaultOpen: true,
        children: [
          { id: 'ricerca', label: 'Ricerca', href: '/office/cerca' },
          { id: 'notifiche', label: 'Avvisi', href: '/office/notifiche' },
          { id: 'copilot', label: 'Co-pilot', href: '/office/copilot' },
          { id: 'impostazioni', label: 'Impostazioni', href: '/office/impostazioni' },
        ],
      },
    ];
  }

  // Ramo FPM / hasKantiere=true: sidebar a SEZIONI-separatori.
  // Dashboard in alto · AZIENDA · KOMMESSA (modulo) · KANTIERE (modulo) · ALTRO.
  // I nomi sezione sono header/separatori; KOMMESSA/KANTIERE hanno sfondino +
  // simbolo add-on. Tutte aperte di default, richiudibili.
  return [
    {
      id: 'home',
      label: 'Dashboard',
      href: '/office',
      icon: LayoutDashboard,
    },
    {
      id: 'sec-azienda',
      label: 'Azienda',
      href: '#',
      icon: Users,
      variant: 'section',
      defaultOpen: true,
      children: [
        { id: 'dipendenti', label: 'Dipendenti', href: '/office/kantiere/dipendenti' },
        { id: 'mezzi', label: 'Parco mezzi', href: '/office/kantiere/mezzi', icon: Truck },
        { id: 'sedi', label: 'Sedi', href: '/office/kantiere/sedi', icon: MapPin },
        { id: 'clienti', label: 'Clienti', href: '/office/clienti' },
      ],
    },
    {
      id: 'sec-kommessa',
      label: 'Kommessa',
      href: '#',
      icon: Briefcase,
      variant: 'module',
      defaultOpen: true,
      children: [
        { id: 'commesse', label: 'Commesse', href: '/office/commesse' },
        { id: 'todo', label: 'Task', href: '/office/todo' },
        { id: 'turni', label: 'Turni', href: '/office/turni' },
      ],
    },
    {
      id: 'sec-kantiere',
      label: 'Kantiere',
      href: '#',
      icon: HardHat,
      variant: 'module',
      defaultOpen: true,
      children: [
        { id: 'kant-overview', label: 'Panoramica', href: '/office/kantiere' },
        { id: 'kant-cantieri', label: 'Cantieri', href: '/office/kantiere/cantieri' },
        { id: 'kant-qr', label: 'QR code', href: '/office/kantiere/qr' },
        { id: 'kant-rapp', label: 'Presenze e ore', href: '/office/kantiere/rapportini' },
        { id: 'kant-ore-costi', label: 'Ore e costi', href: '/office/kantiere/ore-costi', icon: Coins },
        { id: 'kant-report', label: 'Report', href: '/office/kantiere/report' },
        { id: 'kant-anom', label: 'Anomalie', href: '/office/kantiere/anomalie' },
      ],
    },
    {
      id: 'sec-altro',
      label: 'Altro',
      href: '#',
      icon: Boxes,
      variant: 'section',
      defaultOpen: true,
      children: [
        { id: 'ricerca', label: 'Ricerca', href: '/office/cerca' },
        { id: 'notifiche', label: 'Avvisi', href: '/office/notifiche' },
        { id: 'copilot', label: 'Co-pilot', href: '/office/copilot' },
        { id: 'impostazioni', label: 'Impostazioni', href: '/office/impostazioni' },
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
  appMode,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const nav = buildNav(hasKantiere, appMode);
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
