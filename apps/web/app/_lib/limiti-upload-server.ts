import 'server-only';
import { cache } from 'react';

import { createServerSupabase } from '@kommessa/api/server';
import {
  LIMITI_UPLOAD_FALLBACK,
  risolviLimitiUpload,
  type LimitiUpload,
} from '@kommessa/api/limiti-upload';
import { requireTenantContextCached } from '@/app/_lib/tenant-cache';

/**
 * I limiti di invio media per il tenant della richiesta corrente.
 *
 * Due letture, deduplicate per request da `cache()`: il default globale
 * (`platform_settings`) e l'override del tenant (`tenants.upload_config`). La
 * fusione e il taglio ai tetti li fa `risolviLimitiUpload`, che è puro e
 * testato.
 *
 * **Tollerante per scelta**, come `tenant-features.ts`: se la tabella o la
 * colonna non ci sono ancora (prima dell'apply della migration
 * `20261005090000`), se la query va in errore o se non c'è un tenant in
 * contesto, si torna al fallback invece di sollevare. Un intoppo nella lettura
 * di un'impostazione non deve impedire a un tecnico di caricare le foto del
 * cantiere.
 */
/**
 * Un livello che non si riesce a leggere si fa sentire nei log: si continua coi
 * valori di sicurezza (le foto di cantiere non si fermano per un'impostazione),
 * ma senza questa riga il segnale sarebbe il silenzio.
 */
function avvisa(livello: 'globale' | 'tenant', error: { message?: string }): void {
  console.warn(
    `[limiti-upload] livello ${livello} non letto, uso il fallback: ${error.message ?? 'errore sconosciuto'}`,
  );
}

export const getLimitiUploadCached = cache(async (): Promise<LimitiUpload> => {
  try {
    const supabase = createServerSupabase();
    // In PARALLELO: sono due letture indipendenti sul percorso critico del
    // guscio, e in serie aggiungevano due round-trip verso l'Irlanda a ogni
    // pagina di office e mobile.
    const [globale, tenant] = await Promise.all([
      (async (): Promise<unknown> => {
        try {
          const { data, error } = await supabase
            .from('platform_settings' as never)
            .select('valore')
            .eq('chiave', 'limiti_upload')
            .maybeSingle();
          // PostgREST non solleva: un errore di permessi o di cache di schema
          // arriva qui dentro. Senza questa riga il livello GLOBALE sarebbe
          // sparito in silenzio per tutti i tenant insieme.
          if (error) avvisa('globale', error);
          return (data as { valore?: unknown } | null)?.valore ?? null;
        } catch {
          return null;
        }
      })(),
      (async (): Promise<unknown> => {
        try {
          const ctx = await requireTenantContextCached();
          const { data, error } = await supabase
            .from('tenants')
            .select('upload_config')
            .eq('id', ctx.tenantId)
            .maybeSingle();
          if (error) avvisa('tenant', error);
          return (data as { upload_config?: unknown } | null)?.upload_config ?? null;
        } catch {
          return null;
        }
      })(),
    ]);
    return risolviLimitiUpload(globale, tenant);
  } catch {
    // Anche la costruzione del client sta dentro il try: è l'unico modo in cui
    // questa lettura potrebbe ancora portarsi via il guscio che la chiama.
    return LIMITI_UPLOAD_FALLBACK;
  }
});

export { LIMITI_UPLOAD_FALLBACK };
export type { LimitiUpload };
