'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import type { Json } from '@kommessa/api';

import { checkPlatformAdmin } from '../admin/_lib/guard';
import {
  buildSnapshot,
  diffSnapshot,
  type CommessaSnapshot,
} from '../_lib/versioni/snapshot';
import { scriviVersione } from './_lib/scrivi-versione';

/**
 * Ripristina i CONTENUTI di una versione precedente di una commessa.
 *
 * SOLO superadmin (platform admin SOLVA). Gira in service-role perché il
 * platform admin è cross-tenant (nessuno scope RLS).
 *
 * Ripristina solo i campi contenuto + i referenti di commessa. NON tocca:
 *  - voci/tipologie (append-only, cartelle fisiche)
 *  - codice_interno / nome_cartella / cloud_folder_path (congelati)
 *
 * Il ripristino stesso genera una NUOVA versione ('ripristino').
 */

const InputSchema = z.object({
  commessaId: z.string().uuid(),
  versioneId: z.string().uuid(),
});

export type RipristinaVersioneResult = { ok: true } | { ok: false; error: string };

export async function ripristinaVersione(
  input: unknown,
): Promise<RipristinaVersioneResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') };
  }
  const { commessaId, versioneId } = parsed.data;

  const check = await checkPlatformAdmin();
  if (check.kind !== 'admin') {
    return { ok: false, error: 'Solo il superadmin può ripristinare una versione' };
  }
  const email = check.ctx.email;

  const service = createServiceSupabase();

  // 1) Carica la versione da ripristinare
  const { data: verRaw, error: verErr } = await service
    .from('commessa_versioni' as never)
    .select('id, tenant_id, commessa_id, snapshot')
    .eq('id', versioneId)
    .maybeSingle();
  if (verErr || !verRaw) return { ok: false, error: 'Versione non trovata' };
  const ver = verRaw as unknown as {
    tenant_id: string;
    commessa_id: string;
    snapshot: CommessaSnapshot;
  };
  if (ver.commessa_id !== commessaId) {
    return { ok: false, error: 'Versione non appartiene a questa commessa' };
  }
  const target = ver.snapshot;

  // 2) Stato corrente (per il diff)
  const { data: comRaw, error: comErr } = await service
    .from('commesse')
    .select(
      'descrizione_ai_finale, cliente_indirizzo_cantiere, note_iniziali, is_critica, stato, responsabile_id, cliente_id',
    )
    .eq('id', commessaId)
    .maybeSingle();
  if (comErr || !comRaw) return { ok: false, error: 'Commessa non trovata' };
  const com = comRaw as unknown as Parameters<typeof buildSnapshot>[0];
  const referentiPrima = await caricaReferenti(service, commessaId);
  const snapshotPrima = buildSnapshot(com, referentiPrima);

  // 3) Applica i contenuti della versione (NO voci, NO campi congelati).
  // stato e cliente_id sono NOT NULL: li tocchiamo solo se valorizzati.
  const updatePatch: Record<string, unknown> = {
    descrizione_ai_finale: target.descrizioneFinale,
    cliente_indirizzo_cantiere: target.indirizzoCantiere,
    note_iniziali: target.noteIniziali,
    is_critica: target.isCritica ?? false,
    responsabile_id: target.responsabileId,
  };
  if (target.stato) updatePatch.stato = target.stato;
  if (target.clienteId) updatePatch.cliente_id = target.clienteId;
  const { error: updErr } = await service
    .from('commesse')
    .update(updatePatch)
    .eq('id', commessaId);
  if (updErr) return { ok: false, error: `Ripristino fallito: ${updErr.message}` };

  // 4) Referenti scope-commessa = quelli dello snapshot
  await service.from('contatto_cliente' as never).delete().eq('commessa_id', commessaId);
  const toInsert = (target.referenti ?? [])
    .filter((r) => r.nome && r.nome.trim().length > 0)
    .map((r, idx) => ({
      tenant_id: ver.tenant_id,
      cliente_id: target.clienteId,
      commessa_id: commessaId,
      nome: r.nome.trim(),
      ruolo: r.ruolo ?? null,
      telefono: r.telefono ?? null,
      email: r.email ?? null,
      is_primary: false,
      ordine: idx,
    }));
  if (toInsert.length > 0) {
    await service.from('contatto_cliente' as never).insert(toInsert as never);
  }

  // 5) Nuova versione 'ripristino'
  const snapshotDopo = buildSnapshot(
    {
      descrizione_ai_finale: target.descrizioneFinale,
      cliente_indirizzo_cantiere: target.indirizzoCantiere,
      note_iniziali: target.noteIniziali,
      is_critica: target.isCritica ?? false,
      stato: target.stato,
      responsabile_id: target.responsabileId,
      cliente_id: target.clienteId,
    },
    target.referenti ?? [],
  );
  const diff = diffSnapshot(snapshotPrima, snapshotDopo);
  await scriviVersione(service, {
    tenantId: ver.tenant_id,
    commessaId,
    snapshot: snapshotDopo,
    diff,
    azione: 'ripristino',
    modificatoDa: null, // il superadmin non ha riga in public.users del tenant
    modificatoDaNome: `SOLVA · ${email}`,
  });

  // 6) Audit
  await service.from('audit_events').insert({
    tenant_id: ver.tenant_id,
    actor_user_id: null,
    actor_role: null,
    entity_type: 'commessa',
    entity_id: commessaId,
    action: 'commessa.ripristino',
    before_data: snapshotPrima as unknown as Json,
    after_data: snapshotDopo as unknown as Json,
    metadata: { platform: true, ripristino_da_versione: versioneId } as unknown as Json,
  });

  revalidatePath(`/office/commesse/${commessaId}`);
  revalidatePath(`/office/commesse/${commessaId}/cronologia`);
  revalidatePath(`/mobile/commessa/${commessaId}`);

  return { ok: true };
}

async function caricaReferenti(
  service: ReturnType<typeof createServiceSupabase>,
  commessaId: string,
) {
  const { data } = await service
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
