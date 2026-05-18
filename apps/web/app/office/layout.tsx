import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContextCached as requireTenantContext } from '../_lib/tenant-cache';
import { OfficeShellClient } from './_components/office-shell-client';
import { ImpersonationBanner } from './_components/impersonation-banner';
import { PlatformAdminPill } from './_components/platform-admin-pill';
import { OnboardingTourMount } from '../_components/onboarding-tour-mount';
import { OFFICE_TOUR_STEPS } from '../_components/onboarding-tour-steps';

/**
 * Layout del gruppo "Web Office": protegge tutte le pagine sottostanti
 * richiedendo un JWT con custom claim `tenant_id`. Se assente → redirect login.
 *
 * Recupera in parallelo:
 *  - branding del tenant (nome, logo, colore)
 *  - display name dell'utente loggato (tabella users)
 *  - count notifiche non lette
 */
export default async function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect('/login');
  }

  const supabase = createServerSupabase();

  // Unifichiamo tenant + user-profile in una sola query con join: una
  // riga della tabella `users` con embed del tenant. Riduce i round-trip
  // PostgREST da 3 → 2 per ogni render della shell `/office/*`.
  const [userTenantRes, notifRes] = await Promise.all([
    supabase
      .from('users')
      .select(
        'display_name, role, avatar_url, onboarded_at, tenant:tenants!inner ( nome, logo_url, brand_color )',
      )
      .eq('id', ctx.userId)
      .maybeSingle(),
    supabase
      .from('notifiche')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .eq('user_id', ctx.userId),
  ]);

  // PostgREST può restituire l'embed come array o singolo a seconda
  // dell'FK; normalizziamo via cast `any` (i tipi Supabase generati non
  // sono inclusi in repo).
  const userRow = userTenantRes.data as any;
  const tenantRow = Array.isArray(userRow?.tenant)
    ? userRow.tenant[0]
    : userRow?.tenant;
  const tenantRes = { data: tenantRow ?? null };
  const userRes = {
    data: userRow
      ? {
          display_name: userRow.display_name as string | null,
          role: userRow.role as string | null,
          avatar_url: userRow.avatar_url as string | null,
        }
      : null,
  };

  const tenant = {
    name: tenantRes.data?.nome ?? 'impiantiXplus',
    logoUrl: tenantRes.data?.logo_url ?? undefined,
    brandColor: tenantRes.data?.brand_color ?? undefined,
  };
  const user = {
    name: userRes.data?.display_name ?? ctx.email,
    email: ctx.email,
    role: userRes.data?.role ?? ctx.role,
  };
  const notificationCount = notifRes.count ?? 0;
  const onboardedAt = (userRow?.onboarded_at as string | null | undefined) ?? null;
  const showOnboardingTour = onboardedAt === null;

  // Impersonation / platform admin badges. Letti dal JWT app_metadata.
  // Sono opzionali — non bloccanti.
  const supabaseUserRes = await supabase.auth.getUser();
  const meta = (supabaseUserRes.data.user?.app_metadata ?? {}) as Record<string, unknown>;
  const isPlatformAdmin =
    meta.platform_admin === true ||
    meta.platform_admin === 'true' ||
    ctx.email.toLowerCase() === 'dev@solva.it';

  const cookieJar = cookies();
  // Nuovo formato (JWT shadow): cookie `shadow_admin` (httpOnly) presente +
  // `impersonating_label` (visibile al banner client).
  // Legacy v1 (solo cookie tenant): impersonating_tenant_id.
  const hasShadow = cookieJar.get('shadow_admin') !== undefined;
  const legacyTenantId = cookieJar.get('impersonating_tenant_id')?.value ?? null;
  const impersonatingLabel =
    cookieJar.get('impersonating_label')?.value ??
    cookieJar.get('impersonating_tenant_label')?.value ??
    null;
  const isImpersonating = hasShadow || !!legacyTenantId;

  return (
    <>
      {isImpersonating ? (
        <ImpersonationBanner tenantLabel={impersonatingLabel ?? tenant.name} />
      ) : null}
      <OfficeShellClient
        tenant={tenant}
        user={user}
        notificationCount={notificationCount}
      >
        {isPlatformAdmin && !isImpersonating ? <PlatformAdminPill /> : null}
        {children}
      </OfficeShellClient>
      {showOnboardingTour ? (
        <Suspense fallback={null}>
          <OnboardingTourMount steps={OFFICE_TOUR_STEPS} />
        </Suspense>
      ) : null}
    </>
  );
}
