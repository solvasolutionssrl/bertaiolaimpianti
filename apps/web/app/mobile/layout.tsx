import { Suspense } from 'react';
import type { Metadata } from 'next';

import { createServerSupabase } from '@impiantixplus/api/server';
import { getTenantContextCached as getTenantContext } from '../_lib/tenant-cache';

import SwRegistrar from './_components/sw-registrar';
import { BottomNavShell } from './_components/bottom-nav-shell';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import { MOBILE_TOUR_STEPS } from '../_components/onboarding-tour-steps';

/**
 * Layout PWA tecnici.
 * Passa al client solo dati serializzabili (unreadCount: number).
 * Le icone dei tab vivono in BottomNavShell (Client Component).
 */
export const metadata: Metadata = {
  title: 'impiantiXplus mobile',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
};

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenantContext();

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

  return (
    <div className="min-h-[100dvh] bg-background">
      <SwRegistrar />

      <main className="mx-auto w-full max-w-screen-sm pb-24">
        {children}
      </main>

      {ctx ? <BottomNavShell unreadCount={unreadCount} /> : null}

      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount steps={MOBILE_TOUR_STEPS} />
        </Suspense>
      ) : null}
    </div>
  );
}
