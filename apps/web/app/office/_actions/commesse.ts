'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { aggiungiVociEProvisiona } from '../../_actions/_lib/aggiungi-voci';

/**
 * Server Actions per la gestione delle voci di una commessa esistente.
 * La creazione di una commessa è in `apps/web/app/_actions/crea-commessa.ts`.
 */
const aggiungiInput = z.object({
  commessaId: z.string().uuid(),
  voceId: z.number().int().min(1),
});

export async function aggiungiVoce(input: z.infer<typeof aggiungiInput>) {
  const ctx = await requireTenantContext();
  const parsed = aggiungiInput.parse(input);
  const supabase = createServerSupabase();

  // Carica i campi cartella per provisionare anche la struttura su Nextcloud
  // (prima questa action inseriva solo la riga DB → cartella mancante).
  const { data: comRaw } = await supabase
    .from('commesse')
    .select('nome_cartella, cloud_folder_path')
    .eq('id', parsed.commessaId)
    .maybeSingle();
  const com = comRaw as unknown as {
    nome_cartella: string;
    cloud_folder_path: string | null;
  } | null;
  if (!com) throw new Error('Commessa non trovata');

  const res = await aggiungiVociEProvisiona({
    tenantId: ctx.tenantId,
    commessaId: parsed.commessaId,
    nomeCartella: com.nome_cartella,
    cloudFolderPath: com.cloud_folder_path ?? `/${com.nome_cartella}/`,
    vociRichieste: [parsed.voceId],
  });
  if (!res.ok) throw new Error(res.error ?? 'Aggiunta voce fallita');
  revalidatePath(`/office/commesse/${parsed.commessaId}/fasi`);
  revalidatePath(`/office/commesse/${parsed.commessaId}`);
}

const cambiaStatoInput = z.object({
  commessaId: z.string().uuid(),
  voceId: z.number().int().min(1),
  stato: z.enum(['da_iniziare', 'in_corso', 'completata', 'bloccata']),
});

export async function cambiaStatoVoce(input: z.infer<typeof cambiaStatoInput>) {
  const parsed = cambiaStatoInput.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_voci')
    .update({ stato: parsed.stato })
    .eq('commessa_id', parsed.commessaId)
    .eq('voce_id', parsed.voceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/office/commesse/${parsed.commessaId}/fasi`);
}
