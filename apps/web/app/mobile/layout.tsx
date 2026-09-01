import { Suspense } from 'react';
import type { Metadata } from 'next';

import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContextCached as getTenantContext } from '../_lib/tenant-cache';

import { risolviMobileShell, type AppMode } from '@kommessa/api/types';

import SwRegistrar from './_components/sw-registrar';
import NuovaVersione from './_components/nuova-versione';
import { AppleSplashLinks } from '../_components/apple-splash-links';
import { PwaInstallPrompt } from './_components/pwa-install-prompt';
import { BottomNavShell } from './_components/bottom-nav-shell';
import { sonoCapoSquadra } from './kantiere/_lib/capo';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import {
  MOBILE_TOUR_STEPS,
  KANTIERE_MOBILE_TOUR_STEPS,
} from '../_components/onboarding-tour-steps';

/**
 * Layout PWA tecnici.
 * Passa al client solo dati serializzabili (unreadCount: number).
 * Le icone dei tab vivono in BottomNavShell (Client Component).
 */
export const metadata: Metadata = {
  title: 'Kommessa mobile',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    // NB: `apple-mobile-web-app-status-bar-style` è impostato una sola volta nel
    // root layout (appleWebApp.statusBarStyle = 'black-translucent'). NON
    // ripeterlo qui: due meta con lo stesso nome creerebbero un duplicato e iOS
    // userebbe il primo (era il vecchio 'default' → barra bianca).
  },
};

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();

  // Esperienza mobile per-tenant. Default 'kommessa' = comportamento storico
  // (shell gestione/campo per ruolo): per i tenant esistenti — incluso
  // Bertaiola — la shell risolta è ESATTAMENTE getMobileShell(ctx.role) di prima.
  let appMode: AppMode = 'kommessa';
  let showOnboardingTour = false;
  let unreadCount = 0;
  if (ctx) {
    const supabase = createServerSupabase();
    const [userRes, notifRes, tenantRes] = await Promise.all([
      supabase.from('users').select('onboarded_at').eq('id', ctx.userId).maybeSingle(),
      supabase
        .from('notifiche')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .eq('user_id', ctx.userId),
      supabase
        .from('tenants')
        .select('app_mode')
        .eq('id', ctx.tenantId)
        .maybeSingle(),
    ]);
    showOnboardingTour =
      ((userRes.data as { onboarded_at: string | null } | null)?.onboarded_at ?? null) === null;
    unreadCount = notifRes.count ?? 0;
    const rawMode = (tenantRes.data as { app_mode?: string | null } | null)?.app_mode ?? null;
    appMode =
      rawMode === 'kantiere' || rawMode === 'full' ? rawMode : 'kommessa';
  }

  const shell = ctx
    ? risolviMobileShell({ appMode, role: ctx.role })
    : 'campo';

  // Caposquadra: solo nella shell kantiere per i tecnici (non admin/office).
  // Per Bertaiola (shell != 'kantiere') resta sempre false → zero differenze.
  let isCapo = false;
  if (ctx && shell === 'kantiere' && !(ctx.role === 'admin' || ctx.role === 'office')) {
    isCapo = await sonoCapoSquadra(ctx.tenantId, ctx.userId);
  }

  return (
    <div className="min-h-[100dvh] bg-canvas-mobile">
      {/* <link apple-touch-startup-image> → issati nell'<head> da Next */}
      <AppleSplashLinks />
      <SwRegistrar />
      <NuovaVersione />

      {/* Scrim status bar: con status-bar iOS 'black-translucent' il contenuto va
          a tutto schermo sotto la Dynamic Island. Questa striscia blu brand,
          alta quanto il safe-area-inset-top, riempie l'area dietro l'isola così
          le icone bianche di sistema restano leggibili su OGNI pagina (anche
          quelle a sfondo chiaro, es. cruscotto/cantieri Kantiere). Sulle pagine
          con Hero blu (mondo commesse) è dello stesso colore → giunzione
          invisibile. Su browser / Android l'inset è 0 → invisibile. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-30 bg-primary"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />

      <main
        className="mx-auto w-full max-w-screen-sm"
        style={{
          // Inset alto centralizzato: spinge il contenuto di OGNI pagina sotto la
          // Dynamic Island / notch (0 su browser e Android). Prima era gestito
          // dentro ogni Hero: ora è qui, così anche le pagine senza Hero (Kantiere)
          // non finiscono sotto l'isola.
          paddingTop: 'env(safe-area-inset-top, 0px)',
          // Safe-area-aware bottom padding per iPhone con home indicator
          // (e Dynamic Island). Garantisce che il contenuto non finisca
          // mai sotto il bottom-nav fisso.
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
        }}
      >
        {children}
      </main>

      {ctx ? (
        <BottomNavShell
          unreadCount={unreadCount}
          shell={shell}
          appMode={appMode}
          role={ctx.role}
          userId={ctx.userId}
          tenantId={ctx.tenantId}
          isCapo={isCapo}
        />
      ) : null}

      {/* PWA install prompt — solo per utenti loggati, con re-prompt 30gg */}
      {ctx ? <PwaInstallPrompt /> : null}

      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount
            steps={
              shell === 'kantiere' ? KANTIERE_MOBILE_TOUR_STEPS : MOBILE_TOUR_STEPS
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
