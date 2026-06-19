'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { tenantHasModule } from '@/app/_lib/modules';

/**
 * Server actions per la gestione della squadra (dipendenti) su una commessa.
 *
 * Gated: richiede il modulo `kantiere`. Solo `admin` e `office` possono
 * modificare le assegnazioni. Le funzioni di lettura richiedono comunque
 * una sessione valida con accesso al modulo.
 *
 * Le tabelle `dipendenti` e `commessa_squadra` non sono nei tipi generati
 * → uso `as never` sulle chiamate `.from()`.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

type AssignResult = { ok: true } | { ok: false; error: string };

/** Guard condiviso: verifica sessione, ruolo e modulo kantiere. */
async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) {
    throw new Error('Solo admin/office possono gestire le squadre');
  }
  if (!(await tenantHasModule('kantiere'))) {
    throw new Error('Modulo kantiere non attivo per questo tenant');
  }
  return ctx;
}

// ── Tipi pubblici ────────────────────────────────────────────────────────────

export interface MembroSquadra {
  dipendente_id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  ruolo_commessa: 'capo' | 'membro';
  capo_dipendente_id: string | null;
}

// ── Lettura ──────────────────────────────────────────────────────────────────

/**
 * Elenco dei dipendenti assegnati a una commessa con i dati anagrafici.
 * Esegue due query separate (commessa_squadra + dipendenti) e le unisce
 * lato server per evitare join non tipizzate.
 */
export async function elencaSquadraCommessa(
  commessaId: string,
): Promise<MembroSquadra[]> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return [];
  }
  if (!(await tenantHasModule('kantiere'))) return [];

  const supabase = createServerSupabase();

  // 1. Righe squadra per questa commessa
  const { data: squadraRows, error: sqErr } = await supabase
    .from('commessa_squadra' as never)
    .select('dipendente_id, ruolo_commessa, capo_dipendente_id')
    .eq('commessa_id', commessaId)
    .eq('tenant_id', ctx.tenantId)
    .order('ruolo_commessa', { ascending: false }); // 'membro' < 'capo' alphabetically → capo first

  if (sqErr || !squadraRows) return [];

  const rows = squadraRows as Array<{
    dipendente_id: string;
    ruolo_commessa: 'capo' | 'membro';
    capo_dipendente_id: string | null;
  }>;

  if (rows.length === 0) return [];

  // 2. Anagrafica dipendenti coinvolti
  const dipendenteIds = [...new Set(rows.map((r) => r.dipendente_id))];
  const { data: dipendenti } = await supabase
    .from('dipendenti' as never)
    .select('id, nome, cognome, mansione')
    .in('id', dipendenteIds);

  const dipMap = new Map(
    ((dipendenti ?? []) as Array<{
      id: string;
      nome: string;
      cognome: string;
      mansione: string | null;
    }>).map((d) => [d.id, d]),
  );

  return rows
    .map((r) => {
      const dip = dipMap.get(r.dipendente_id);
      if (!dip) return null;
      return {
        dipendente_id: r.dipendente_id,
        nome: dip.nome,
        cognome: dip.cognome,
        mansione: dip.mansione,
        ruolo_commessa: r.ruolo_commessa,
        capo_dipendente_id: r.capo_dipendente_id,
      } satisfies MembroSquadra;
    })
    .filter((x): x is MembroSquadra => x !== null);
}

// ── Mutazioni ────────────────────────────────────────────────────────────────

const AssegnaInput = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  ruolo_commessa: z.enum(['capo', 'membro']),
  capo_dipendente_id: z.string().uuid().optional().nullable(),
});

/** Aggiunge (o aggiorna) un dipendente nella squadra di una commessa. */
export async function assegnaDipendenteSquadra(
  input: unknown,
): Promise<AssignResult> {
  const parsed = AssegnaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createServerSupabase();

  // Verifica che il dipendente appartenga al tenant
  const { data: dip } = await supabase
    .from('dipendenti' as never)
    .select('id, stato_attivo, tenant_id')
    .eq('id', parsed.data.dipendenteId)
    .maybeSingle();

  const dipRow = dip as { id: string; stato_attivo: boolean; tenant_id: string } | null;
  if (!dipRow || dipRow.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Dipendente non trovato per questo tenant' };
  }
  if (!dipRow.stato_attivo) {
    return { ok: false, error: 'Il dipendente è disattivato' };
  }

  const { error } = await supabase
    .from('commessa_squadra' as never)
    .upsert(
      {
        commessa_id: parsed.data.commessaId,
        dipendente_id: parsed.data.dipendenteId,
        tenant_id: ctx.tenantId,
        ruolo_commessa: parsed.data.ruolo_commessa,
        capo_dipendente_id: parsed.data.capo_dipendente_id ?? null,
        assegnato_da: ctx.userId,
      } as never,
      { onConflict: 'commessa_id,dipendente_id' },
    );

  if (error) return { ok: false, error: `Assegnazione fallita: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}

const AggiornRuoloInput = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
  ruolo_commessa: z.enum(['capo', 'membro']),
  capo_dipendente_id: z.string().uuid().optional().nullable(),
});

/** Aggiorna il ruolo (capo/membro) di un dipendente già nella squadra. */
export async function aggiornaRuoloSquadra(
  input: unknown,
): Promise<AssignResult> {
  const parsed = AggiornRuoloInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_squadra' as never)
    .update({
      ruolo_commessa: parsed.data.ruolo_commessa,
      capo_dipendente_id: parsed.data.capo_dipendente_id ?? null,
    } as never)
    .eq('commessa_id', parsed.data.commessaId)
    .eq('dipendente_id', parsed.data.dipendenteId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}

const RimuoviInput = z.object({
  commessaId: z.string().uuid(),
  dipendenteId: z.string().uuid(),
});

/** Rimuove un dipendente dalla squadra di una commessa. */
export async function rimuoviDaSquadra(input: unknown): Promise<AssignResult> {
  const parsed = RimuoviInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  let ctx;
  try {
    ctx = await guard();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_squadra' as never)
    .delete()
    .eq('commessa_id', parsed.data.commessaId)
    .eq('dipendente_id', parsed.data.dipendenteId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: `Rimozione fallita: ${error.message}` };

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true };
}
