'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { Json } from '@kommessa/api';

import { aggiungiVociEProvisiona } from './_lib/aggiungi-voci';
import { buildSnapshot } from '../_lib/versioni/snapshot';
import { scriviVersione, nomeUtente } from './_lib/scrivi-versione';

/**
 * Azione rapida "Aggiungi tipologie impianto" — APPEND-ONLY.
 *
 * Aggiunge le voci selezionate alla commessa e provisiona le relative cartelle
 * (best-effort). Le voci esistenti non si toccano mai. Scrive una versione
 * 'aggiunta_tipologie' nello storico.
 *
 * Permessi: admin / office.
 */

const InputSchema = z.object({
  commessaId: z.string().uuid(),
  voci: z.array(z.number().int().min(1).max(32767)).min(1),
});

export type AggiungiTipologieResult =
  | { ok: true; added: number[]; storageOk: boolean }
  | { ok: false; error: string };

export async function aggiungiTipologie(input: unknown): Promise<AggiungiTipologieResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') };
  }
  const { commessaId, voci } = parsed.data;

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida' };
  }
  if (ctx.role !== 'admin' && ctx.role !== 'office') {
    return { ok: false, error: 'Permessi insufficienti' };
  }

  const supabase = createServerSupabase();

  const { data: comRaw, error: comErr } = await supabase
    .from('commesse')
    .select(
      'id, nome_cartella, cloud_folder_path, descrizione_ai_finale, cliente_indirizzo_cantiere, note_iniziali, is_critica, stato, responsabile_id, cliente_id',
    )
    .eq('id', commessaId)
    .maybeSingle();
  if (comErr || !comRaw) return { ok: false, error: 'Commessa non trovata' };
  const com = comRaw as unknown as {
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

  const res = await aggiungiVociEProvisiona({
    tenantId: ctx.tenantId,
    commessaId,
    nomeCartella: com.nome_cartella,
    cloudFolderPath: com.cloud_folder_path ?? `/${com.nome_cartella}/`,
    vociRichieste: voci,
  });
  if (!res.ok) return { ok: false, error: res.error ?? 'Aggiunta tipologie fallita' };

  if (res.added.length > 0) {
    // Nome delle voci aggiunte per il diff dello storico.
    const { data: catRaw } = await supabase
      .from('voci_catalogo')
      .select('id, nome')
      .in('id', res.added);
    const nomi = ((catRaw ?? []) as Array<{ id: number; nome: string }>)
      .map((v) => v.nome)
      .join(', ');

    const snapshot = buildSnapshot(com, await caricaReferenti(supabase, commessaId));
    const nomeUt = await nomeUtente(supabase, ctx.userId);
    await scriviVersione(supabase, {
      tenantId: ctx.tenantId,
      commessaId,
      snapshot,
      diff: [{ campo: 'Tipologie', da: null, a: nomi || `${res.added.length} aggiunte` }],
      azione: 'aggiunta_tipologie',
      modificatoDa: ctx.userId,
      modificatoDaNome: nomeUt,
    });

    await supabase.from('audit_events').insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      actor_role: ctx.role,
      entity_type: 'commessa',
      entity_id: commessaId,
      action: 'commessa.tipologie_add',
      after_data: { voci_aggiunte: res.added } as unknown as Json,
    });
  }

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/office/commesse/${commessaId}/fasi`);
  revalidatePath(`/office/commesse/${commessaId}/cronologia`);
  revalidatePath(`/mobile/commessa/${commessaId}`);

  return { ok: true, added: res.added, storageOk: res.storageOk };
}

async function caricaReferenti(
  supabase: ReturnType<typeof createServerSupabase>,
  commessaId: string,
) {
  const { data } = await supabase
    .from('contatto_cliente' as never)
    .select('nome, ruolo, telefono, email')
    .eq('commessa_id', commessaId);
  return (data ?? []) as unknown as Array<{
    nome: string;
    ruolo: string | null;
    telefono: string | null;
    email: string | null;
  }>;
}
