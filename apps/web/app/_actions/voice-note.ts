'use server';

import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

/**
 * Server Action: salva un transcript di nota vocale legato a una commessa.
 *
 * Per ora le note non hanno una tabella dedicata; usiamo `audit_events`
 * (insert-only via RLS, perfetto per un log immutabile di note vocali).
 *
 * Schema usato:
 *   - entity_type = 'commessa'
 *   - entity_id   = commessa.id
 *   - action      = 'voice_note'
 *   - after_data  = { transcript, vocale: true, audio_duration_sec, _preview }
 *
 * Se in futuro nasce una tabella `commessa_note`, basta cambiare la
 * destinazione qui senza toccare la UI.
 *
 * Privacy: l'audio originale non viene caricato né conservato (storage
 * cloud ancora TBD per CLAUDE.md). Persistiamo solo il transcript.
 */
export interface SaveVoiceNoteInput {
  commessaId: string;
  transcript: string;
  durationSec?: number;
  preview?: boolean;
}

export type SaveVoiceNoteResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

export async function salvaNotaVocale(
  input: SaveVoiceNoteInput,
): Promise<SaveVoiceNoteResult> {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const transcript = input.transcript?.trim() ?? '';
  if (transcript.length === 0) {
    return { ok: false, error: 'Transcript vuoto, niente da salvare.' };
  }
  if (transcript.length > 5000) {
    return { ok: false, error: 'Transcript troppo lungo (>5000 caratteri).' };
  }
  if (!input.commessaId || typeof input.commessaId !== 'string') {
    return { ok: false, error: 'Commessa non valida.' };
  }

  const supabase = createServerSupabase();

  // Verifichiamo che la commessa esista e appartenga al tenant
  const { data: commessa, error: cErr } = await supabase
    .from('commesse')
    .select('id, codice_interno')
    .eq('id', input.commessaId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (cErr || !commessa) {
    return { ok: false, error: 'Commessa non trovata.' };
  }

  const { data, error } = await supabase
    .from('audit_events')
    .insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      actor_role: ctx.role,
      entity_type: 'commessa',
      entity_id: commessa.id,
      action: 'voice_note',
      after_data: {
        transcript,
        vocale: true,
        audio_duration_sec: input.durationSec ?? null,
        _preview: input.preview ?? false,
      } as Record<string, unknown>,
      metadata: {
        commessa_codice: commessa.codice_interno,
        source: 'voice_recorder',
      } as Record<string, unknown>,
    })
    .select('id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: `Salvataggio fallito: ${error?.message ?? 'unknown'}`,
    };
  }

  revalidatePath(`/office/commesse/${input.commessaId}/note`);
  revalidatePath(`/office/commesse/${input.commessaId}`);
  return { ok: true, eventId: data.id as string };
}
