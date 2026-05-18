import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Bell, Briefcase, Mic, Timer, User } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { getTenantContextCached as getTenantContext } from '../_lib/tenant-cache';
import type { MobileTab } from '@impiantixplus/ui';

import SwRegistrar from './_components/sw-registrar';
import { BottomNavShell } from './_components/bottom-nav-shell';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import { MOBILE_TOUR_STEPS } from '../_components/onboarding-tour-steps';

/**
 * Layout della PWA tecnici (host `m.impiantixplus.app` → rewrite a /mobile/*).
 *
 * 5 slot bottom-nav, slot centrale (Voce) come FAB rialzato.
 * Sopralluogo non occupa più uno slot: è azione, vive come CTA in home.
 * Niente più bell fluttuante: l'inbox è la quarta tab con badge unread.
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

  const tabs: MobileTab[] = [
    { id: 'commesse', label: 'Oggi', icon: Briefcase, href: '/mobile' },
    { id: 'turno', label: 'Turno', icon: Timer, href: '/mobile/turno' },
    {
      id: 'voce',
      label: 'Voce',
      icon: Mic,
      href: '/mobile/voice-intake',
      primary: true,
    },
    {
      id: 'notifiche',
      label: 'Inbox',
      icon: Bell,
      href: '/mobile/notifiche',
      badge: unreadCount,
    },
    { id: 'profilo', label: 'Profilo', icon: User, href: '/mobile/profilo' },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      <SwRegistrar />

      <main className="mx-auto w-full max-w-screen-sm pb-24">
        {children}
      </main>

      {ctx ? <BottomNavShell tabs={tabs} /> : null}

      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount steps={MOBILE_TOUR_STEPS} />
        </Suspense>
      ) : null}
    </div>
  );
}
