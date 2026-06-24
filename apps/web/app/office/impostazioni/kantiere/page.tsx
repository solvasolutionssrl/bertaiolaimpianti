import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
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

  const { data: row } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  const config = ((row as { config: Record<string, unknown> | null } | null)?.config) ?? {};
  const soglia = typeof config.soglia_ore_ordinarie === 'number' ? config.soglia_ore_ordinarie : 8;
  const sede = typeof config.sede_partenza_default === 'string' ? config.sede_partenza_default : '';

  const rawAnomalie = config.anomalie && typeof config.anomalie === 'object' ? (config.anomalie as Record<string, boolean>) : {};
  const anomalie = {
    incomplete: rawAnomalie['incomplete'] !== false,
    straordinari: rawAnomalie['straordinari'] !== false,
    senza_rapportino: rawAnomalie['senza_rapportino'] !== false,
    modificato: rawAnomalie['modificato'] !== false,
    festivo: rawAnomalie['festivo'] !== false,
    weekend: rawAnomalie['weekend'] !== false,
    ore_eccessive: rawAnomalie['ore_eccessive'] !== false,
  };
  const anomalie_ore_max = typeof config.anomalie_ore_max === 'number' ? config.anomalie_ore_max : 13;
  const arrotondamentoViaggio =
    typeof config.arrotondamento_viaggio_min === 'number' ? config.arrotondamento_viaggio_min : 5;
  const arrotondamentoOre =
    typeof config.arrotondamento_ore_min === 'number' ? config.arrotondamento_ore_min : 0;

  const { data: tRow } = await supabase
    .from('tenants' as never)
    .select('codice_azienda')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const codiceAzienda = (tRow as { codice_azienda: string | null } | null)?.codice_azienda ?? null;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Kantiere"
        description="Parametri del modulo presenze e cantieri: soglia ore ordinarie, sede di partenza predefinita."
      />

      {/* Codice azienda: sola lettura. Lo imposta SOLVA (super admin). */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Codice azienda (accesso)
        </p>
        {codiceAzienda ? (
          <p className="mt-1 text-sm">
            I tuoi tecnici accedono con codice{' '}
            <span className="rounded bg-background px-2 py-0.5 font-mono font-semibold tracking-wide">
              {codiceAzienda}
            </span>{' '}
            + username + password.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Nessun codice impostato. Contatta SOLVA per configurarlo.
          </p>
        )}
      </div>

      <ImpostazioniClient
        soglia={soglia}
        sede={sede}
        anomalie={anomalie}
        anomalie_ore_max={anomalie_ore_max}
        arrotondamentoViaggio={arrotondamentoViaggio}
        arrotondamentoOre={arrotondamentoOre}
      />
    </div>
  );
}
