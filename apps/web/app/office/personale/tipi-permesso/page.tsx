import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { leggiConfigDipendenti, leggiTipiPermessoAttivi } from '../../../_lib/dipendenti-config';
import { TipiClient } from './_components/tipi-client';

export const dynamic = 'force-dynamic';

export default async function TipiPermessoPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();
  const attivi = await leggiTipiPermessoAttivi(supabase, ctx.tenantId);
  const canManage = ctx.role === 'admin' || ctx.role === 'office';

  return <TipiClient attivi={attivi} canManage={canManage} />;
}
