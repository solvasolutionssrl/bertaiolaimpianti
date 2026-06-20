import { Suspense } from 'react';
import type { Metadata } from 'next';

import { createServerSupabase } from '@kommessa/api/server';
import { getTenantContextCached as getTenantContext } from '../_lib/tenant-cache';

import { risolviMobileShell, type AppMode } from '@kommessa/api/types';

import SwRegistrar from './_components/sw-registrar';
import { PwaInstallPrompt } from './_components/pwa-install-prompt';
import { BottomNavShell } from './_components/bottom-nav-shell';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import { MOBILE_TOUR_STEPS } from '../_components/onboarding-tour-steps';

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
    // black-translucent: la status bar diventa overlay trasparente,
    // il viewport include l'area sotto Dynamic Island / notch e l'Hero
    // blu si estende fino al bordo superiore (con safe-area-inset-top
    // gestito nel componente Hero). Testo status bar bianco leggibile
    // sopra il blu primary.
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
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

  return (
    <div className="min-h-[100dvh] bg-canvas-mobile">
      <SwRegistrar />

      <main
        className="mx-auto w-full max-w-screen-sm"
        style={{
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
        />
      ) : null}

      {/* PWA install prompt — solo per utenti loggati, con re-prompt 30gg */}
      {ctx ? <PwaInstallPrompt /> : null}

      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount steps={MOBILE_TOUR_STEPS} />
        </Suspense>
      ) : null}
    </div>
  );
}
