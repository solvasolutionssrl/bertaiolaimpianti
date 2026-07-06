'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

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

const schema = z.object({
  sogliaOreOrdinarie: z.number().min(1).max(24),
  sedePartenzaDefault: z.string().max(300).optional(),
  anomalie: anomalieSchema.optional(),
  anomalie_ore_max: z.number().min(1).max(24).optional(),
  // Arrotondamenti (min). Viaggio: default 5. Ore: default 0 = nessuno.
  arrotondamentoViaggioMin: z.number().int().min(1).max(60).optional(),
  arrotondamentoOreMin: z.number().int().min(0).max(60).optional(),
  // Approvazione presenze. Auto-approva: default true. Soglia turno: default 10 ore.
  autoApprovaRapportini: z.boolean().optional(),
  anomaliaTurnoOreMax: z.number().min(1).max(24).optional(),
  // Promemoria pausa pranzo: ore di turno senza pausa timbrata oltre cui l'app
  // (QR e tasto, identici) propone di dichiararla. Default 5.
  sogliaPausaPranzoOre: z.number().int().min(1).max(12).optional(),
  // Auto-spegnimento pausa dimenticata: ore oltre cui una pausa avviata si
  // chiude da sola e il turno riprende (scalando esattamente la soglia).
  // Default 1.5. Distinta da sogliaPausaPranzoOre (promemoria).
  sogliaAutoSpegnimentoPausaOre: z.number().min(0.5).max(8).optional(),
  // Kontabilità: modulo attivo per il tenant. Default true.
  kontabilitaAttiva: z.boolean().optional(),
  // ── Turni & calcoli (gestione ufficio) ──
  // Tolleranza (min) sulla somma dello split di fine turno. Default 5.
  tolleranzaChiusuraMin: z.number().int().min(0).max(30).optional(),
  // Split "cosa hai fatto oggi" alla chiusura. Default true.
  splitFineTurnoAttivo: z.boolean().optional(),
  // Km del tragitto sul cambio cantiere (switch). Default false (opt-in).
  kmSwitchAttivo: z.boolean().optional(),
  // Passo (min) dei +/- degli stepper ore. 5/10/15/30. Default 15.
  passoMinutiStepper: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).optional(),
  // Avvio turno su qualsiasi cantiere (tecnici). Default true.
  avvioTurnoLibero: z.boolean().optional(),
  // Registrazione giornata senza timbrature (caso 4). Default true.
  registraGiornataAttivo: z.boolean().optional(),
});

export async function salvaImpostazioniKantiere(input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }

  const ctx = await guard();
  const supabase = createServiceSupabase();

  // Leggi riga corrente per fare un merge non distruttivo del config
  const { data: row, error: fetchError } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!row) return { ok: false, error: 'MODULO_NON_TROVATO' };

  const existingConfig = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const newConfig: Record<string, unknown> = {
    ...existingConfig,
    soglia_ore_ordinarie: parsed.data.sogliaOreOrdinarie,
    sede_partenza_default: parsed.data.sedePartenzaDefault?.trim() || null,
  };
  if (parsed.data.anomalie !== undefined) {
    newConfig['anomalie'] = parsed.data.anomalie;
  }
  if (parsed.data.anomalie_ore_max !== undefined) {
    newConfig['anomalie_ore_max'] = parsed.data.anomalie_ore_max;
  }
  if (parsed.data.arrotondamentoViaggioMin !== undefined) {
    newConfig['arrotondamento_viaggio_min'] = parsed.data.arrotondamentoViaggioMin;
  }
  if (parsed.data.arrotondamentoOreMin !== undefined) {
    newConfig['arrotondamento_ore_min'] = parsed.data.arrotondamentoOreMin;
  }
  if (parsed.data.autoApprovaRapportini !== undefined) {
    newConfig['auto_approva_rapportini'] = parsed.data.autoApprovaRapportini;
  }
  if (parsed.data.anomaliaTurnoOreMax !== undefined) {
    newConfig['anomalia_turno_ore_max'] = parsed.data.anomaliaTurnoOreMax;
  }
  if (parsed.data.sogliaPausaPranzoOre !== undefined) {
    newConfig['soglia_pausa_pranzo_ore'] = parsed.data.sogliaPausaPranzoOre;
  }
  if (parsed.data.sogliaAutoSpegnimentoPausaOre !== undefined) {
    newConfig['soglia_auto_spegnimento_pausa_ore'] = parsed.data.sogliaAutoSpegnimentoPausaOre;
  }
  if (parsed.data.kontabilitaAttiva !== undefined) {
    newConfig['kontabilita_attiva'] = parsed.data.kontabilitaAttiva;
  }
  // Turni & calcoli
  if (parsed.data.tolleranzaChiusuraMin !== undefined) {
    newConfig['tolleranza_chiusura_min'] = parsed.data.tolleranzaChiusuraMin;
  }
  if (parsed.data.splitFineTurnoAttivo !== undefined) {
    newConfig['split_fine_turno_attivo'] = parsed.data.splitFineTurnoAttivo;
  }
  if (parsed.data.kmSwitchAttivo !== undefined) {
    newConfig['km_switch_attivo'] = parsed.data.kmSwitchAttivo;
  }
  if (parsed.data.passoMinutiStepper !== undefined) {
    newConfig['passo_minuti_stepper'] = parsed.data.passoMinutiStepper;
  }
  if (parsed.data.avvioTurnoLibero !== undefined) {
    newConfig['avvio_turno_libero'] = parsed.data.avvioTurnoLibero;
  }
  if (parsed.data.registraGiornataAttivo !== undefined) {
    newConfig['registra_giornata_attivo'] = parsed.data.registraGiornataAttivo;
  }

  const { error: updateError } = await supabase
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere');

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath('/office/impostazioni/kantiere');
  revalidatePath('/office/kantiere/impostazioni');
  return { ok: true };
}
