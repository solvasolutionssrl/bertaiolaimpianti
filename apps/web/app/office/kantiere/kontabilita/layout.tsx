import { notFound } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';

import { requireTenantContextCached } from '@/app/_lib/tenant-cache';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';

/**
 * Kontabilità spenta dal super admin (`kontabilita_attiva: false`): tutta l'area
 * non esiste, sotto-pagine comprese (analisi, costo cantiere, ricevute). Ruolo e
 * modulo Kantiere li controlla già il layout di /office/kantiere.
 */
export default async function KontabilitaLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenantContextCached();
  if (!(await kontabilitaAttiva(createServerSupabase(), ctx.tenantId))) notFound();
  return <>{children}</>;
}
