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
  Users,
  LayoutDashboard,
  MapPin,
  QrCode,
  Clock,
  ReceiptText,
  HardHat,
} from 'lucide-react';

import { MobileBottomNav, type MobileTab, type MobileTabId } from '@kommessa/ui';
import type { MobileShell, AppMode } from '@kommessa/api/types';

import { CAPACITA_META } from '@kommessa/api/capacita';

import { useAlert } from '@/app/_components/confirm-provider';
import { useRealtimeUnread } from './use-realtime-unread';

/**
 * Rotte "a tutto schermo" (wizard/foglio) dove la tab bar va NASCOSTA.
 * Questi flussi hanno già una barra azioni fissa in basso (Indietro/Avanti/
 * Salva) e l'uscita in alto ("Annulla"): la nav — che è `fixed bottom-0 z-40`,
 * opaca, con il FAB centrale che sporge — coprirebbe i tasti rendendo
 * impossibile procedere.
 */
const ROTTE_SENZA_NAV: RegExp[] = [
  /^\/mobile\/commessa\/[^/]+\/modifica(\/|$)/,
];

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
  role,
  userId,
  tenantId,
  isCapo = false,
  hasKontabilita = true,
  puoAprireLavori,
  turnoAttivo = false,
}: {
  unreadCount: number;
  shell: MobileShell;
  appMode?: AppMode;
  role?: string;
  userId: string;
  tenantId: string;
  /** Solo shell kantiere/tecnico: se capo, "Attività" diventa "Squadra". */
  isCapo?: boolean;
  /**
   * Se questa persona puo' aprire lavori nuovi (capacita' `capo_squadra`).
   *
   * **Senza valore di default, di proposito.** E' il tasto piu' grande della
   * barra: se un giorno un chiamante nuovo se ne dimentica, TypeScript lo
   * ferma invece di scegliere al posto suo. Finora quel tasto era identico
   * per tutti e portava un tecnico in un vicolo cieco.
   */
  puoAprireLavori: boolean;
  /**
   * Se la funzione «Turno in cantiere» e' accesa per questo cliente.
   *
   * Spenta, la card resta al suo posto in grigio e al tocco dice che non e'
   * abilitata: una barra che cambia numero di tasti a seconda del cliente si
   * riprogetta ogni volta, e chi la usa cerca le cose sempre nello stesso punto.
   */
  turnoAttivo?: boolean;
  /** Solo shell kantiere/tecnico: Kontabilità spenta = niente tab Spese. */
  hasKontabilita?: boolean;
}) {
  const pathname = usePathname() ?? '';

  // Real-time: sostituisce il count statico con uno live aggiornato dal canale
  const avvisa = useAlert();
  const unreadCount = useRealtimeUnread({
    userId,
    tenantId,
    initialCount: initialUnreadCount,
  });

  // NB: dopo gli hook (regole dei hook), prima di costruire i tab.
  const nascondiNav = ROTTE_SENZA_NAV.some((r) => r.test(pathname));

  const isManager = role === 'admin' || role === 'office';
  let tabs: MobileTab[];
  if (shell === 'kantiere') {
    if (isManager) {
      // Admin/office: vista gestionale — "Cruscotto" per guardare/analizzare
      // (rapportini da approvare, anomalie, ore) al posto di "Attività".
      tabs = [
        { id: 'cruscotto', label: 'Cruscotto', icon: LayoutDashboard, href: '/mobile/kantiere/cruscotto' },
        { id: 'cantieri', label: 'Cantieri', icon: MapPin, href: '/mobile/kantiere/cantieri' },
        { id: 'scansiona', label: 'Scansiona', icon: QrCode, href: '/mobile/kantiere/scansiona', primary: true },
        { id: 'ore', label: 'Ore', icon: Clock, href: '/mobile/kantiere/ore' },
        { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
      ];
    } else {
      // Tecnico in cantiere — "a prova di cantiere": tap target grandi.
      // Lo slot "Attività" è sostituito da "Spese" (Kontabilità); le notifiche
      // restano raggiungibili dalla campanella fissa della shell kantiere.
      // Se è caposquadra, lo slot "Ore" diventa "Squadra" (le ore restano
      // raggiungibili dalla pagina Squadra).
      // Con Kontabilità spenta lo slot Spese torna a Ore (capo) o Notifiche.
      const spese: MobileTab = { id: 'spese', label: 'Spese', icon: ReceiptText, href: '/mobile/kantiere/spese' };
      tabs = isCapo
        ? [
            { id: 'cantieri', label: 'Cantieri', icon: MapPin, href: '/mobile/kantiere/cantieri' },
            { id: 'squadra', label: 'Squadra', icon: Users, href: '/mobile/kantiere/gestione-squadra' },
            { id: 'scansiona', label: 'Scansiona', icon: QrCode, href: '/mobile/kantiere/scansiona', primary: true },
            hasKontabilita ? spese : { id: 'ore', label: 'Ore', icon: Clock, href: '/mobile/kantiere/ore' },
            { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
          ]
        : [
            { id: 'cantieri', label: 'Cantieri', icon: MapPin, href: '/mobile/kantiere/cantieri' },
            { id: 'ore', label: 'Ore', icon: Clock, href: '/mobile/kantiere/ore' },
            { id: 'scansiona', label: 'Scansiona', icon: QrCode, href: '/mobile/kantiere/scansiona', primary: true },
            hasKontabilita
              ? spese
              : { id: 'notifiche', label: 'Notifiche', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
            { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
          ];
    }
  } else if (shell === 'gestione') {
    // INVARIATO per app_mode='kommessa'.
    tabs = [
      { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, href: '/mobile' },
      { id: 'commesse', label: 'Commesse', icon: Briefcase, href: '/mobile/commesse' },
      { id: 'voce', label: 'Nuova', icon: Mic, href: '/mobile/voice-intake', primary: true, cornerBadge: '+' },
      { id: 'notifiche', label: 'Notifiche', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
      { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
    ];
  } else {
    // Shell 'campo' (tecnici del mondo commesse).
    //
    // Lo slot centrale: il microfono per chi puo' aprire lavori, altrimenti un
    // casco spento che al tocco dice a chi rivolgersi. Lo slot NON sparisce —
    // una barra che cambia numero di tasti a seconda di chi guarda disorienta,
    // e uno slot vuoto non spiega niente.
    tabs = [
      { id: 'commesse', label: 'Oggi', icon: Briefcase, href: '/mobile' },
      turnoAttivo
        ? { id: 'turno' as const, label: 'Turno', icon: Timer, href: '/mobile/turno' }
        : {
            id: 'turno' as const,
            label: 'Turno',
            icon: Timer,
            href: '#',
            spento: {
              messaggio:
                'La gestione del turno non è abilitata per la vostra azienda. Se vi serve, l’ufficio la può accendere dalle impostazioni.',
            },
          },
      puoAprireLavori
        ? {
            id: 'voce' as const,
            label: 'Nuova',
            icon: Mic,
            href: '/mobile/voice-intake',
            primary: true,
            cornerBadge: '+',
          }
        : {
            id: 'voce' as const,
            label: 'Tecnico',
            icon: HardHat,
            href: '#',
            primary: true,
            spento: { messaggio: CAPACITA_META.capo_squadra.messaggioNegato },
          },
      { id: 'notifiche', label: 'Notifiche', icon: Bell, href: '/mobile/notifiche', badge: unreadCount },
      { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
    ];
  }

  // app_mode='full': shell kommessa (gestione/campo) + entry point Kantiere.
  // Lo slot Kantiere prende il posto di Notifiche (nell'area Kantiere c'è la
  // campanella), così Profilo, e con lui l'uscita, resta raggiungibile.
  // Per 'kommessa' NON entra mai qui (zero diff Bertaiola).
  if (appMode === 'full' && shell !== 'kantiere') {
    tabs = tabs.map((t) =>
      t.id === 'notifiche'
        ? { id: 'scansiona', label: 'Kantiere', icon: QrCode, href: '/mobile/kantiere' }
        : t,
    );
  }

  if (nascondiNav) return null;

  const activeTab = matchActive(pathname, tabs, shell);

  return (
    <MobileBottomNav
      tabs={tabs}
      activeTab={activeTab}
      onTabSpento={(tab) => {
        void avvisa({ title: 'Profilo non abilitato', body: tab.spento?.messaggio ?? '' });
      }}
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
