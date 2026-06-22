'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import {
  scriviVersioneRapportino,
  type AzioneVersione,
} from '@/app/_actions/_lib/scrivi-versione-rapportino';

type Result = { ok: true } | { ok: false; error: string };

async function nomeUtente(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users' as never)
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

// ── schema per registraOrePerDipendente ─────────────────────────────────────

const RegistraOreSchema = z
  .object({
    dipendenteId: z.string().uuid(),
    commessaId: z.string().uuid().optional(),
    cantiereId: z.string().uuid().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido (YYYY-MM-DD)'),
    ore_ordinarie: z.number().min(0).max(24),
    ore_viaggio: z.number().min(0).max(24),
    ore_straordinarie: z.number().min(0).max(24),
    note: z.string().max(1000).optional(),
  })
  .refine(
    (d) => {
      const hasCommessa = !!d.commessaId;
      const hasCantiere = !!d.cantiereId;
      return hasCommessa !== hasCantiere; // XOR: esattamente uno valorizzato
    },
    { message: 'Specificare esattamente uno tra commessa e cantiere' },
  );

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

export async function approvaRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if ((row as { stato: string }).stato !== 'inviato') return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'approvato',
      approvato_da: ctx.userId,
      approvato_at: new Date().toISOString(),
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'approvazione',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function respingiRapportino(input: unknown): Promise<Result> {
  const parsed = z
    .object({ rapportinoId: z.string().uuid(), motivo: z.string().min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if ((row as { stato: string }).stato !== 'inviato') return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'respinto',
      respinto_motivo: parsed.data.motivo,
      approvato_da: null,
      approvato_at: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'respinta',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

export async function riapriRapportino(input: unknown): Promise<Result> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data: row, error: fetchError } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .single();
  if (fetchError || !row) return { ok: false, error: 'NON_TROVATO' };
  if (!['approvato', 'respinto'].includes((row as { stato: string }).stato))
    return { ok: false, error: 'STATO_NON_VALIDO' };

  const { error } = await supabase
    .from('rapportini' as never)
    .update({
      stato: 'bozza',
      inviato_da: null,
      inviato_at: null,
      approvato_da: null,
      approvato_at: null,
      respinto_motivo: null,
    } as never)
    .eq('id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  await scriviVersioneRapportino({
    supabase,
    rapportinoId: parsed.data.rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'riapertura',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });
  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

// ── registraOrePerDipendente ─────────────────────────────────────────────────
// L'ufficio inserisce ore per conto di un dipendente (cantiere O commessa).
// Il rapportino risultante ha stato=approvato se creato ex-novo, oppure viene
// mantenuto nello stato esistente (salvo bozza → approvato).
// Una riga per lo stesso target sullo stesso rapportino viene AGGIORNATA.

export async function registraOrePerDipendente(input: unknown): Promise<Result> {
  const parsed = RegistraOreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  const ctx = await guard();
  const supabase = createServerSupabase();

  const { dipendenteId, commessaId, cantiereId, data, ore_ordinarie, ore_viaggio, ore_straordinarie, note } =
    parsed.data;

  // Verifica che il dipendente appartenga al tenant
  const { data: dipRow, error: dipErr } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('id', dipendenteId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (dipErr || !dipRow) return { ok: false, error: 'Dipendente non trovato' };

  const now = new Date().toISOString();

  // Cerca rapportino esistente per (dipendente_id, data)
  const { data: esistenteRaw } = await supabase
    .from('rapportini' as never)
    .select('id, stato')
    .eq('tenant_id', ctx.tenantId)
    .eq('dipendente_id', dipendenteId)
    .eq('data', data)
    .maybeSingle();

  const esistente = esistenteRaw as { id: string; stato: string } | null;

  let rapportinoId: string;

  if (esistente) {
    rapportinoId = esistente.id;
    // Se era in bozza, portarlo ad approvato (l'ufficio è fonte autoritativa)
    if (esistente.stato === 'bozza') {
      const { error: updErr } = await supabase
        .from('rapportini' as never)
        .update({
          stato: 'approvato',
          inviato_da: ctx.userId,
          inviato_at: now,
          approvato_da: ctx.userId,
          approvato_at: now,
        } as never)
        .eq('id', rapportinoId)
        .eq('tenant_id', ctx.tenantId);
      if (updErr) return { ok: false, error: updErr.message };
    }
    // Negli altri stati (inviato/approvato/respinto/ecc.) non tocchiamo lo stato:
    // l'aggiunta di una riga da parte dell'ufficio è comunque valida.
  } else {
    // Crea rapportino direttamente approvato
    const { data: nuovoRaw, error: insErr } = await supabase
      .from('rapportini' as never)
      .insert({
        tenant_id: ctx.tenantId,
        dipendente_id: dipendenteId,
        data,
        stato: 'approvato',
        inviato_da: ctx.userId,
        inviato_at: now,
        approvato_da: ctx.userId,
        approvato_at: now,
      } as never)
      .select('id')
      .single();
    if (insErr || !nuovoRaw) return { ok: false, error: insErr?.message ?? 'Errore creazione rapportino' };
    rapportinoId = (nuovoRaw as { id: string }).id;
  }

  // Cerca riga esistente per lo stesso target su questo rapportino
  const { data: righeRaw } = await supabase
    .from('rapportino_righe' as never)
    .select('id, commessa_id, cantiere_id')
    .eq('rapportino_id', rapportinoId);

  type RigaMin = { id: string; commessa_id: string | null; cantiere_id: string | null };
  const righeEsistenti = (righeRaw as RigaMin[]) ?? [];

  const rigaEsistente = righeEsistenti.find((r) => {
    if (commessaId) return r.commessa_id === commessaId;
    if (cantiereId) return r.cantiere_id === cantiereId;
    return false;
  });

  if (rigaEsistente) {
    // Aggiorna la riga esistente
    const { error: updRigaErr } = await supabase
      .from('rapportino_righe' as never)
      .update({
        ore_ordinarie,
        ore_straordinarie,
        ore_viaggio,
        note: note ?? null,
      } as never)
      .eq('id', rigaEsistente.id);
    if (updRigaErr) return { ok: false, error: updRigaErr.message };
  } else {
    // Inserisci nuova riga
    const { error: insRigaErr } = await supabase
      .from('rapportino_righe' as never)
      .insert({
        rapportino_id: rapportinoId,
        commessa_id: commessaId ?? null,
        cantiere_id: cantiereId ?? null,
        ore_ordinarie,
        ore_straordinarie,
        ore_viaggio,
        note: note ?? null,
      } as never);
    if (insRigaErr) return { ok: false, error: insRigaErr.message };
  }

  await scriviVersioneRapportino({
    supabase,
    rapportinoId,
    tenantId: ctx.tenantId,
    azione: 'modifica_ufficio',
    modificatoDa: ctx.userId,
    modificatoDaNome: await nomeUtente(supabase, ctx.userId),
  });

  revalidatePath('/office/kantiere/rapportini');
  return { ok: true };
}

// ── storico versioni di un rapportino (per l'ufficio) ────────────────────────

export type VersioneRapportino = {
  versione: number;
  azione: AzioneVersione;
  modificato_da_nome: string | null;
  created_at: string;
  snapshot: {
    stato?: string;
    note?: string | null;
    totali?: { ore_ordinarie: number; ore_straordinarie: number; ore_viaggio: number };
  };
};

export async function versioniRapportino(
  input: unknown,
): Promise<{ ok: true; versioni: VersioneRapportino[] } | { ok: false; error: string }> {
  const parsed = z.object({ rapportinoId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  const { data } = await supabase
    .from('rapportino_versioni' as never)
    .select('versione, azione, modificato_da_nome, created_at, snapshot')
    .eq('rapportino_id', parsed.data.rapportinoId)
    .eq('tenant_id', ctx.tenantId)
    .order('versione', { ascending: true });

  const versioni = (data as VersioneRapportino[] | null) ?? [];
  return { ok: true, versioni };
}
