import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import {
  leggiConfigDipendenti,
  leggiTipiPermessoAttivi,
  leggiTipiPermessoCustom,
  type TipoOpt,
} from '@/app/_lib/dipendenti-config';
import { PersonaleSettingsClient } from './_components/settings-client';

export const dynamic = 'force-dynamic';

export default async function PersonaleSettingsPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();
  const canManage = ctx.role === 'admin' || ctx.role === 'office';
  const [attivi, custom] = await Promise.all([
    leggiTipiPermessoAttivi(supabase, ctx.tenantId),
    leggiTipiPermessoCustom(supabase, ctx.tenantId),
  ]);

  return (
    <PersonaleSettingsClient
      attivi={attivi}
      custom={custom as TipoOpt[]}
      canManage={canManage}
    />
  );
}
