'use server';

import { revalidatePath } from 'next/cache';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  impostazioniTrascrizioneDaConfig,
  validaImpostazioniTrascrizione,
  type ImpostazioniTrascrizione,
} from '@kommessa/api/trascrizione';

import { requirePlatformAdmin } from '../_lib/guard';
import { auditPlatform } from '../_lib/audit-platform';

/**
 * Il predefinito di piattaforma per la trascrizione audio, e l'elenco di
 * modelli che il pannello propone.
 *
 * Perché qui e non in un file di codice: quando OpenAI pubblica un modello
 * migliore deve bastare scriverne il nome, senza un deploy e senza toccare
 * cliente per cliente. Cambiare il predefinito muove **tutti** i clienti che
 * non hanno una scelta propria, che è il caso normale.
 *
 * ⚠️ `ammessi` è un elenco di **suggerimenti**, non un permesso: la
 * risoluzione del modello non lo controlla (vedi `risolviModelloTrascrizione`).
 * Se lo controllasse, avremmo ricostruito il catalogo chiuso che volevamo
 * togliere, solo in un posto diverso.
 */

const CHIAVE = 'modelli_trascrizione';

export async function leggiModelliTrascrizionePiattaforma(): Promise<ImpostazioniTrascrizione> {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from('platform_settings' as never)
    .select('valore')
    .eq('chiave', CHIAVE)
    .maybeSingle();
  if (error) {
    // supabase-js non solleva: senza questa riga un errore di permessi o di
    // cache di schema diventerebbe «nessuna impostazione», indistinguibile da
    // una riga davvero assente.
    console.error('[modelli-trascrizione] lettura fallita:', error.message);
  }
  return impostazioniTrascrizioneDaConfig(
    (data as { valore?: unknown } | null)?.valore ?? null,
  );
}

export async function aggiornaModelliTrascrizionePiattaforma(input: {
  predefinito: string | null;
  ammessi: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();

  const pulito = {
    predefinito: input.predefinito?.trim() ? input.predefinito.trim() : null,
    ammessi: (input.ammessi ?? []).map((a) => a.trim()).filter(Boolean),
  };

  // In scrittura si RIFIUTA e si dice perché. Tagliare in silenzio il nome che
  // un umano ha appena battuto nel pannello è il modo migliore per fargli
  // credere di aver salvato altro. (In lettura invece si è tolleranti.)
  const esito = validaImpostazioniTrascrizione(pulito);
  if (!esito.ok) return { ok: false, error: esito.errori.join(' ') };

  const supabase = createServiceSupabase();
  const { data: prima } = await supabase
    .from('platform_settings' as never)
    .select('valore')
    .eq('chiave', CHIAVE)
    .maybeSingle();

  const { error } = await supabase.from('platform_settings' as never).upsert(
    {
      chiave: CHIAVE,
      valore: pulito,
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
    } as never,
    { onConflict: 'chiave' },
  );
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    // Evento di PIATTAFORMA: nessun cliente. `audit_events.tenant_id` è
    // nullable dal 05/10 proprio per questo.
    tenantId: null,
    entityType: 'platform_settings',
    entityId: CHIAVE,
    action: 'platform.modelli_trascrizione.update',
    before:
      ((prima as { valore?: Record<string, unknown> } | null)?.valore ??
        null) as Record<string, unknown> | null,
    after: pulito,
  });

  revalidatePath('/admin/tenants');
  return { ok: true };
}
