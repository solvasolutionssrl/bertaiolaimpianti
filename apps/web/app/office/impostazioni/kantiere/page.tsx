import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiImpostazioniKantiere } from '@/app/_lib/kantiere-config';
import { SectionHeader } from '../_components/section-header';
import { ImpostazioniClient } from '@/app/office/kantiere/impostazioni/_components/impostazioni-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Impostazioni' };

export default async function KantiereSettingsPage() {
  const ctx = await requireTenantContext();

  if (!(await tenantHasModule('kantiere'))) {
    redirect('/office/impostazioni/profilo');
  }

  const supabase = createServerSupabase();

  // Stessa lettura e stessi predefiniti dei calcoli: la pagina mostra i valori
  // che l'applicazione sta usando davvero, anche per le chiavi mai salvate.
  const [impostazioni, { data: tRow }] = await Promise.all([
    leggiImpostazioniKantiere(supabase, ctx.tenantId),
    supabase.from('tenants' as never).select('codice_azienda').eq('id', ctx.tenantId).maybeSingle(),
  ]);
  const codiceAzienda = (tRow as { codice_azienda: string | null } | null)?.codice_azienda ?? null;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Impostazioni Kantiere"
        description="Parametri del modulo presenze: orario e classificazione delle ore, turni, pause, viaggi, approvazione delle giornate e anomalie."
      />

      <ImpostazioniClient impostazioni={impostazioni} codiceAzienda={codiceAzienda} />
    </div>
  );
}
