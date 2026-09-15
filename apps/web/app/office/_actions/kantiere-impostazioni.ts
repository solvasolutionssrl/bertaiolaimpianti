'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { auditTenant } from '@/app/_actions/_lib/audit';

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

const anomalieSchema = z.object({
  incomplete: z.boolean(),
  straordinari: z.boolean(),
  senza_rapportino: z.boolean(),
  modificato: z.boolean(),
  festivo: z.boolean(),
  weekend: z.boolean(),
  ore_eccessive: z.boolean(),
});

/**
 * I campi della pagina Impostazioni Kantiere. Ogni campo corrisponde a una
 * chiave di `tenant_modules.config`; la lettura e i predefiniti stanno in
 * `impostazioniDaConfig` (`_lib/kantiere-config`).
 */
const schema = z.object({
  // Orario e ore
  sogliaOreOrdinarie: z.number().min(1).max(24),
  arrotondamentoViaggioMin: z.number().int().min(1).max(60).optional(),
  arrotondamentoOreMin: z.number().int().min(0).max(60).optional(),
  // Turni
  avvioTurnoLibero: z.boolean().optional(),
  splitFineTurnoAttivo: z.boolean().optional(),
  registraGiornataAttivo: z.boolean().optional(),
  tolleranzaChiusuraMin: z.number().int().min(0).max(30).optional(),
  passoMinutiStepper: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).optional(),
  // Pause
  sogliaPausaPranzoOre: z.number().int().min(1).max(12).optional(),
  sogliaAutoSpegnimentoPausaOre: z.number().min(0.5).max(8).optional(),
  // Viaggi e chilometri
  kmSoloAutista: z.boolean().optional(),
  sedePartenzaDefault: z.string().max(300).optional(),
  // Approvazione e anomalie
  autoApprovaRapportini: z.boolean().optional(),
  anomaliaTurnoOreMax: z.number().min(1).max(24).optional(),
  anomalie: anomalieSchema.optional(),
  // Kontabilità
  kontabilitaAttiva: z.boolean().optional(),
});

/** Chiavi che nessun codice legge più: si tolgono al primo salvataggio. */
const CHIAVI_DISMESSE = ['km_switch_attivo', 'anomalie_ore_max'];

export async function salvaImpostazioniKantiere(input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Valori non validi. Ricaricare la pagina e riprovare.' };
  }

  const ctx = await guard();
  const supabase = createServiceSupabase();

  // Merge non distruttivo: le chiavi non gestite qui (routing_provider,
  // quote_ore_dal, integrazioni) restano come sono.
  const { data: row, error: fetchError } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!row) return { ok: false, error: 'MODULO_NON_TROVATO' };

  const existingConfig = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const d = parsed.data;
  const newConfig: Record<string, unknown> = {
    ...existingConfig,
    soglia_ore_ordinarie: d.sogliaOreOrdinarie,
  };
  const imposta = (chiave: string, valore: unknown) => {
    if (valore !== undefined) newConfig[chiave] = valore;
  };
  imposta('arrotondamento_viaggio_min', d.arrotondamentoViaggioMin);
  imposta('arrotondamento_ore_min', d.arrotondamentoOreMin);
  imposta('avvio_turno_libero', d.avvioTurnoLibero);
  imposta('split_fine_turno_attivo', d.splitFineTurnoAttivo);
  imposta('registra_giornata_attivo', d.registraGiornataAttivo);
  imposta('tolleranza_chiusura_min', d.tolleranzaChiusuraMin);
  imposta('passo_minuti_stepper', d.passoMinutiStepper);
  imposta('soglia_pausa_pranzo_ore', d.sogliaPausaPranzoOre);
  imposta('soglia_auto_spegnimento_pausa_ore', d.sogliaAutoSpegnimentoPausaOre);
  imposta('km_solo_autista', d.kmSoloAutista);
  if (d.sedePartenzaDefault !== undefined) {
    newConfig['sede_partenza_default'] = d.sedePartenzaDefault.trim() || null;
  }
  imposta('auto_approva_rapportini', d.autoApprovaRapportini);
  imposta('anomalia_turno_ore_max', d.anomaliaTurnoOreMax);
  imposta('anomalie', d.anomalie);
  imposta('kontabilita_attiva', d.kontabilitaAttiva);
  for (const chiave of CHIAVI_DISMESSE) delete newConfig[chiave];

  const { error: updateError } = await supabase
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere');

  if (updateError) return { ok: false, error: updateError.message };

  // Prima/dopo dell'intero config → visibile in /admin/audit.
  await auditTenant(supabase, {
    tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role,
    entityType: 'tenant_module', entityId: ctx.tenantId,
    action: 'kantiere.impostazioni.update',
    before: existingConfig, after: newConfig,
  });

  revalidatePath('/office/impostazioni/kantiere');
  revalidatePath('/office/kantiere/impostazioni');
  return { ok: true };
}
