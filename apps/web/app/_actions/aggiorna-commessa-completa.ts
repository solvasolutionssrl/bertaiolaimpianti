'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { Json } from '@kommessa/api';

import {
  aggiornaCommessaCompletaInputSchema,
  type AggiornaCommessaCompletaInput,
  type AggiornaCommessaCompletaResult,
} from './aggiorna-commessa-completa.schemas';
import { aggiungiVociEProvisiona } from './_lib/aggiungi-voci';
import { buildSnapshot, diffSnapshot } from '../_lib/versioni/snapshot';
import { scriviVersione, nomeUtente } from './_lib/scrivi-versione';

/**
 * Modifica COMPLETA di una commessa finalizzata (editor desktop + wizard PWA).
 *
 * REGOLA FERREA: codice_interno / nome_cartella / cloud_folder_path NON si
 * toccano MAI. Le voci sono APPEND-ONLY. Ogni modifica con almeno un campo
 * cambiato scrive una nuova versione in commessa_versioni.
 *
 * Permessi: admin / office.
 */
export async function aggiornaCommessaCompleta(
  input: AggiornaCommessaCompletaInput,
): Promise<AggiornaCommessaCompletaResult> {
  const parsed = aggiornaCommessaCompletaInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') };
  }
  const data = parsed.data;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, error: 'Permessi insufficienti per modificare la commessa' };
  }

  const supabase = createServerSupabase();

  // 1) Carica stato corrente (campi contenuto + identitari per il provisioning)
  const { data: comRaw, error: comErr } = await supabase
    .from('commesse')
    .select(
      'id, tenant_id, nome_cartella, cloud_folder_path, descrizione_ai_finale, cliente_indirizzo_cantiere, note_iniziali, is_critica, stato, responsabile_id, cliente_id',
    )
    .eq('id', data.commessaId)
    .maybeSingle();
  if (comErr || !comRaw) {
    return { ok: false, error: 'Commessa non trovata' };
  }
  const com = comRaw as unknown as {
    id: string;
    tenant_id: string;
    nome_cartella: string;
    cloud_folder_path: string | null;
    descrizione_ai_finale: string | null;
    cliente_indirizzo_cantiere: string | null;
    note_iniziali: string | null;
    is_critica: boolean | null;
    stato: string | null;
    responsabile_id: string | null;
    cliente_id: string | null;
  };

  const referentiPrima = await caricaReferentiCommessa(supabase, data.commessaId);
  const snapshotPrima = buildSnapshot(com, referentiPrima);

  // 2) Patch campi contenuto (MAI campi identitari)
  const patch: Record<string, unknown> = {};
  if (data.descrizioneFinale !== undefined) {
    patch.descrizione_ai_finale = data.descrizioneFinale.length
      ? data.descrizioneFinale
      : null;
  }
  if (data.indirizzoCantiere !== undefined) {
    patch.cliente_indirizzo_cantiere =
      data.indirizzoCantiere && data.indirizzoCantiere.length
        ? data.indirizzoCantiere
        : null;
  }
  if (data.noteIniziali !== undefined) {
    patch.note_iniziali =
      data.noteIniziali && data.noteIniziali.trim().length
        ? data.noteIniziali
        : null;
  }
  if (data.isCritica !== undefined) patch.is_critica = data.isCritica;
  if (data.stato !== undefined) patch.stato = data.stato;
  if (data.responsabileId !== undefined) patch.responsabile_id = data.responsabileId;
  if (data.clienteId !== undefined) patch.cliente_id = data.clienteId;

  if (Object.keys(patch).length > 0) {
    const { error: updErr } = await supabase
      .from('commesse')
      .update(patch)
      .eq('id', data.commessaId);
    if (updErr) return { ok: false, error: `Update fallito: ${updErr.message}` };
  }

  // 3) Voci APPEND-ONLY + provisioning cartelle
  let vociAggiunte: number[] = [];
  let storageOk = true;
  if (data.voci && data.voci.length > 0) {
    const res = await aggiungiVociEProvisiona({
      tenantId: ctx.tenantId,
      commessaId: data.commessaId,
      nomeCartella: com.nome_cartella,
      cloudFolderPath: com.cloud_folder_path ?? `/${com.nome_cartella}/`,
      vociRichieste: data.voci,
    });
    if (!res.ok) return { ok: false, error: `Voci non aggiunte: ${res.error ?? 'errore'}` };
    vociAggiunte = res.added;
    storageOk = res.storageOk;
  }

  // 4) Referenti scope-commessa: replace se forniti
  if (data.referenti !== undefined) {
    await sostituisciReferentiCommessa(
      supabase,
      ctx.tenantId,
      data.commessaId,
      com.cliente_id,
      data.referenti,
    );
  }

  // 5) Snapshot dopo + versione
  const referentiDopo = await caricaReferentiCommessa(supabase, data.commessaId);
  const snapshotDopo = buildSnapshot(
    {
      descrizione_ai_finale:
        (patch.descrizione_ai_finale as string | null | undefined) ??
        com.descrizione_ai_finale,
      cliente_indirizzo_cantiere:
        (patch.cliente_indirizzo_cantiere as string | null | undefined) ??
        com.cliente_indirizzo_cantiere,
      note_iniziali:
        (patch.note_iniziali as string | null | undefined) ?? com.note_iniziali,
      is_critica: (patch.is_critica as boolean | undefined) ?? com.is_critica,
      stato: (patch.stato as string | undefined) ?? com.stato,
      responsabile_id:
        (patch.responsabile_id as string | null | undefined) ?? com.responsabile_id,
      cliente_id: (patch.cliente_id as string | undefined) ?? com.cliente_id,
    },
    referentiDopo,
  );
  const diff = diffSnapshot(snapshotPrima, snapshotDopo);

  if (diff.length > 0 || vociAggiunte.length > 0) {
    if (vociAggiunte.length > 0) {
      diff.push({ campo: 'Tipologie', da: null, a: `+${vociAggiunte.length} aggiunte` });
    }
    const nome = await nomeUtente(supabase, ctx.userId);
    await scriviVersione(supabase, {
      tenantId: ctx.tenantId,
      commessaId: data.commessaId,
      snapshot: snapshotDopo,
      diff,
      azione: 'modifica',
      modificatoDa: ctx.userId,
      modificatoDaNome: nome,
    });
  }

  // 6) Audit
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: data.commessaId,
    action: 'commessa.update',
    before_data: snapshotPrima as unknown as Json,
    after_data: snapshotDopo as unknown as Json,
  });

  // 7) Revalidate
  revalidatePath(`/office/commesse/${data.commessaId}`);
  revalidatePath(`/office/commesse/${data.commessaId}/cronologia`);
  revalidatePath(`/office/commesse/${data.commessaId}/fasi`);
  revalidatePath(`/mobile/commessa/${data.commessaId}`);

  return { ok: true, storageOk, vociAggiunte };
}

// ---------------------------------------------------------------------
// Helpers locali (referenti scope-commessa)
// ---------------------------------------------------------------------

type SupaServer = ReturnType<typeof createServerSupabase>;

async function caricaReferentiCommessa(
  supabase: SupaServer,
  commessaId: string,
): Promise<
  Array<{ nome: string; ruolo: string | null; telefono: string | null; email: string | null }>
> {
  const { data } = await supabase
    .from('contatto_cliente' as never)
    .select('nome, ruolo, telefono, email')
    .eq('commessa_id', commessaId);
  return ((data ?? []) as unknown as Array<{
    nome: string;
    ruolo: string | null;
    telefono: string | null;
    email: string | null;
  }>);
}

async function sostituisciReferentiCommessa(
  supabase: SupaServer,
  tenantId: string,
  commessaId: string,
  clienteId: string | null,
  referenti: Array<{
    nome: string;
    ruolo?: string | null;
    telefono?: string | null;
    email?: string | null;
  }>,
): Promise<void> {
  // Replace dei referenti SCOPE-COMMESSA (commessa_id = X). Non tocca i
  // contatti del cliente (commessa_id NULL).
  await supabase
    .from('contatto_cliente' as never)
    .delete()
    .eq('commessa_id', commessaId);

  const toInsert = referenti
    .filter((r) => r.nome && r.nome.trim().length > 0)
    .map((r, idx) => ({
      tenant_id: tenantId,
      cliente_id: clienteId,
      commessa_id: commessaId,
      nome: r.nome.trim(),
      ruolo: r.ruolo?.trim() || null,
      telefono: r.telefono?.trim() || null,
      email: r.email?.trim() || null,
      is_primary: false,
      ordine: idx,
    }));
  if (toInsert.length > 0) {
    await supabase.from('contatto_cliente' as never).insert(toInsert as never);
  }
}
