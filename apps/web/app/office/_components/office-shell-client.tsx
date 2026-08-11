'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OfficeShell, DEFAULT_OFFICE_NAV, type OfficeNavItem } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import { registraEventoAccesso } from '@/app/_actions/auth-events';
import {
  BarChart3,
  Boxes,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Coins,
  HardHat,
  LayoutDashboard,
  MapPin,
  ReceiptText,
  Sparkles,
  Timer,
  Truck,
  Users,
  UsersRound,
  Plug,
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
  /** Modulo Integrazione attivo → voce "Gestionale" nel menu. */
  hasIntegrazione?: boolean;
  /** Modulo Dipendenti attivo → sezione Personale (Dipendenti, ...). */
  hasDipendenti?: boolean;
  /** Modulo Dipendenti · sotto-flag Pianificazione attivo → voce Pianificazione. */
  hasPianificazione?: boolean;
  /** Modulo Dipendenti · sotto-flag Ferie attivo → voci Permessi/Gruppi/Analisi. */
  hasFerie?: boolean;
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
          { id: 'sedi', label: 'Sedi', href: '/office/kantiere/sedi', icon: MapPin },
          { id: 'mezzi', label: 'Parco mezzi', href: '/office/kantiere/mezzi', icon: Truck },
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
        ],
      },
      // Kontabilità: voce top-level (sibling del modulo Kantiere) per dare
      // stacco visivo, non dentro l'accordion Kantiere.
      {
        id: 'kontabilita',
        label: 'Kontabilità',
        href: '/office/kantiere/kontabilita',
        icon: ReceiptText,
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
    // Kontabilità: voce top-level (sibling del modulo Kantiere) per dare
    // stacco visivo, non dentro l'accordion Kantiere.
    {
      id: 'kontabilita',
      label: 'Kontabilità',
      href: '/office/kantiere/kontabilita',
      icon: ReceiptText,
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
 * Inietta le voci del modulo Dipendenti (Pianificazione, e in futuro Permessi/
 * Gruppi) nella sezione "Azienda". Se il tenant non ha una sezione Azienda
 * (tenant senza kantiere), crea una sezione "Personale" a sé. No-op se il
 * modulo è spento. Le voci-sezione sono literal freschi a ogni `buildNav`,
 * quindi la mutazione qui è sicura (nessuna condivisione tra render).
 */
/**
 * Voce "Gestionale" per i tenant che hanno un ERP collegato.
 *
 * Sta in fondo, sotto Impostazioni, perche' e' un lavoro di configurazione che
 * si fa poche volte — collegare le anagrafiche — non un'attivita' quotidiana.
 * Prima era raggiungibile solo da un tasto nell'intestazione: sparito quello,
 * senza una voce di menu la pagina sarebbe diventata irraggiungibile.
 */
function injectIntegrazione(
  nav: OfficeNavItem[],
  hasIntegrazione?: boolean,
): OfficeNavItem[] {
  if (!hasIntegrazione) return nav;

  const voce: OfficeNavItem = {
    id: 'integrazione',
    label: 'Gestionale',
    href: '/office/integrazione',
    icon: Plug,
  };

  // Se esiste una sezione "Altro" ci va dentro, accanto a Impostazioni;
  // altrimenti in coda alla nav.
  const altro = nav.find((i) => i.id === 'sec-altro');
  if (altro?.children) {
    return nav.map((i) =>
      i.id === 'sec-altro' ? { ...i, children: [...i.children!, voce] } : i,
    );
  }
  return [...nav, voce];
}

function injectPersonale(
  nav: OfficeNavItem[],
  opts: { hasDipendenti?: boolean; hasPianificazione?: boolean; hasFerie?: boolean },
): OfficeNavItem[] {
  // Sezione "Personale" (allo stesso livello di Azienda) con tutte le voci
  // legate ai dipendenti. Tipi e normativa NON è qui: è sottopagina di Ferie
  // e permessi.
  const voci: OfficeNavItem[] = [];
  if (opts.hasDipendenti) {
    voci.push({ id: 'dipendenti', label: 'Dipendenti', href: '/office/kantiere/dipendenti' });
  }
  if (opts.hasPianificazione) {
    voci.push({
      id: 'pianificazione',
      label: 'Pianificazione',
      href: '/office/personale/pianificazione',
      icon: CalendarDays,
    });
  }
  if (opts.hasFerie) {
    voci.push(
      { id: 'permessi', label: 'Ferie e permessi', href: '/office/personale/permessi', icon: CalendarCheck },
      { id: 'gruppi', label: 'Gruppi lavoro', href: '/office/personale/gruppi', icon: UsersRound },
      { id: 'analisi', label: 'Analisi', href: '/office/personale/analisi', icon: BarChart3 },
    );
  }
  if (voci.length === 0) return nav;

  const sezione: OfficeNavItem = {
    id: 'sec-personale',
    label: 'Personale',
    href: '#',
    icon: Users,
    variant: 'section',
    defaultOpen: true,
    children: voci,
  };

  // Inserisci subito DOPO la sezione Azienda (se c'è), altrimenti in coda.
  const idx = nav.findIndex((n) => n.id === 'sec-azienda');
  if (idx >= 0) {
    const out = [...nav];
    out.splice(idx + 1, 0, sezione);
    return out;
  }
  return [...nav, sezione];
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
  hasIntegrazione,
  hasDipendenti,
  hasPianificazione,
  hasFerie,
  appMode,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const nav = injectIntegrazione(
    injectPersonale(buildNav(hasKantiere, appMode), {
      hasDipendenti,
      hasPianificazione,
      hasFerie,
    }),
    hasIntegrazione,
  );
  const computedActiveId = activeNavId ?? deriveActiveId(pathname, nav);

  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    await registraEventoAccesso('logout');
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
