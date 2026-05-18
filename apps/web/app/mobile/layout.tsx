import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Bell, Briefcase, ClipboardCheck, Timer, User } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { getTenantContextCached as getTenantContext } from '../_lib/tenant-cache';
import { MobileBottomNav, type MobileTab } from '@impiantixplus/ui';

import SwRegistrar from './_components/sw-registrar';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import { MOBILE_TOUR_STEPS } from '../_components/onboarding-tour-steps';

/**
 * Layout della PWA tecnici (host `m.impiantixplus.app` → rewrite a /mobile/*).
 *
 * Responsabilità:
 *  - auth guard via `getTenantContext()` (redirect a /mobile/login se anonimo,
 *    eccezione: `/mobile/login` stesso, gestito senza guard nel page);
 *  - bottom nav fissa (MobileBottomNav, tap target ≥ 44px);
 *  - registrazione Service Worker custom (`<SwRegistrar/>`);
 *  - meta apple-mobile-web-app-* già nel root layout, qui aggiungiamo solo
 *    title segment.
 *
 * Mockup_UI §4-bis · Architettura_Soluzione.md §7.
 */
export const metadata: Metadata = {
  title: 'impiantiXplus mobile',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
};

const MOBILE_TABS: MobileTab[] = [
  { id: 'commesse', label: 'Commesse', icon: Briefcase, href: '/mobile' },
  { id: 'turno', label: 'Turno', icon: Timer, href: '/mobile/turno' },
  {
    id: 'sopralluogo',
    label: 'Sopralluogo',
    icon: ClipboardCheck,
    href: '/mobile/sopralluogo',
  },
  { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
];

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth guard: la pagina di login si renderizza dentro questo layout,
  // ma non vogliamo redirect-loop. Usiamo un trucco: la pagina di login
  // imposta header `x-mobile-public-route` via metadata; qui controlliamo
  // se il context esiste. Per il login il children renderizza comunque
  // perché passiamo `null` come tenant.
  const ctx = await getTenantContext();

  // Recupera `onboarded_at` solo se l'utente è autenticato: serve a decidere
  // se mostrare il tour PWA al primo login. La query è leggera (1 colonna,
  // chiave primaria) e parallela alle altre richieste della home mobile.
  let showOnboardingTour = false;
  let unreadCount = 0;
  if (ctx) {
    const supabase = createServerSupabase();
    const [userRes, notifRes] = await Promise.all([
      supabase.from('users').select('onboarded_at').eq('id', ctx.userId).maybeSingle(),
      supabase
        .from('notifiche')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .eq('user_id', ctx.userId),
    ]);
    showOnboardingTour =
      ((userRes.data as { onboarded_at: string | null } | null)?.onboarded_at ?? null) === null;
    unreadCount = notifRes.count ?? 0;
  }

  // Non possiamo leggere la pathname affidabilmente in un layout async;
  // strategia: redirect solo se NON c'è ctx e la richiesta non è /mobile/login.
  // Next risolve questo lato page (vedi `login/page.tsx`). Per le altre
  // route, il page server-side chiamerà `requireTenantContext()` che
  // butta l'errore e la pagina farà redirect.
  // Qui ci limitiamo a NON forzare redirect, così /mobile/login funziona.

  return (
    <div className="min-h-[100dvh] bg-background">
      <SwRegistrar />

      {ctx ? (
        <Link
          href="/mobile/notifiche"
          aria-label={`Notifiche${unreadCount > 0 ? ` (${unreadCount} non lette)` : ''}`}
          className="fixed right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm backdrop-blur transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Bell className="h-4 w-4 text-foreground" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-semibold text-accent-foreground shadow-sm">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Link>
      ) : null}

      <main className="mx-auto w-full max-w-screen-sm pb-24">
        {children}
      </main>

      {ctx ? (
        <MobileBottomNav
          tabs={MOBILE_TABS}
          linkComponent={({ href, children: c, ...rest }) => (
            <Link href={href} {...rest}>
              {c}
            </Link>
          )}
        />
      ) : null}

      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount steps={MOBILE_TOUR_STEPS} />
        </Suspense>
      ) : null}
    </div>
  );
}

