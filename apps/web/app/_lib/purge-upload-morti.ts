import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
  type R2StorageProvider,
} from '@kommessa/integrations/storage';

/**
 * Spazzino dei caricamenti morti.
 *
 * ─── Perché esiste (11/08/2026) ────────────────────────────────────────────
 * Ogni caricamento nasce con una riga `file_refs` in stato `uploading`, creata
 * da `/api/upload/media/init` **prima** che parta un solo byte. Se il
 * caricamento non arriva mai in fondo — telefono chiuso, rete che cade, app
 * disinstallata — quella riga resta lì per sempre, insieme alla sessione
 * multipart aperta su R2 (che occupa spazio e viene fatturata).
 *
 * Misurato in produzione il 10/08/2026: **66 righe** appese, la più vecchia di
 * due mesi, tutte video. Non erano visibili in nessuna galleria (le query
 * filtrano su `uploaded/synced`), quindi nessuno se n'era accorto: crescevano e
 * basta.
 *
 * Questo spazzino chiude il cerchio: passata la finestra in cui un caricamento
 * può ancora essere vivo (`oreMin`, default 24h), aborta la sessione multipart
 * su R2, cancella l'eventuale oggetto parziale e butta la riga.
 *
 * ⚠️ Volutamente **non tocca** le righe recenti: un video da 200 MB su rete di
 * cantiere può legittimamente restare `uploading` per ore, e la coda del
 * telefono lo riprende da sola alla riapertura dell'app.
 */

/** Stati che rappresentano un caricamento mai andato a buon fine. */
const STATI_MORTI = ['uploading', 'failed'] as const;

interface RigaMorta {
  id: string;
  tenant_id: string;
  filename: string | null;
  size_bytes: number | null;
  status: string;
  r2_key: string | null;
  r2_upload_id: string | null;
  updated_at: string | null;
}

export interface EsitoPurgeUpload {
  esaminati: number;
  multipartAbortiti: number;
  oggettiCancellati: number;
  righeEliminate: number;
  errori: string[];
  /** Dettaglio leggibile, per il ritorno JSON del cron/diagnostica. */
  dettaglio: Array<{ file: string; mb: number; stato: string; eta: string }>;
}

export async function purgeUploadMorti(opzioni?: {
  /** Ore di grazia prima di considerare morto un caricamento. Default 24. */
  oreMin?: number;
  /** Tetto di righe per esecuzione. Default 200. */
  limit?: number;
  /** Se true guarda e riferisce, senza cancellare niente. */
  dryRun?: boolean;
}): Promise<EsitoPurgeUpload> {
  const oreMin = Math.max(1, opzioni?.oreMin ?? 24);
  const limit = Math.min(Math.max(1, opzioni?.limit ?? 200), 1000);
  const dryRun = opzioni?.dryRun ?? false;

  const service = createServiceSupabase();
  const soglia = new Date(Date.now() - oreMin * 60 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from('file_refs')
    .select(
      'id, tenant_id, filename, size_bytes, status, r2_key, r2_upload_id, updated_at',
    )
    .in('status', STATI_MORTI as unknown as string[])
    .lt('updated_at', soglia)
    .order('updated_at', { ascending: true })
    .limit(limit);

  const esito: EsitoPurgeUpload = {
    esaminati: 0,
    multipartAbortiti: 0,
    oggettiCancellati: 0,
    righeEliminate: 0,
    errori: [],
    dettaglio: [],
  };
  if (error) {
    esito.errori.push(`lettura: ${error.message}`);
    return esito;
  }

  const righe = (data ?? []) as unknown as RigaMorta[];
  esito.esaminati = righe.length;
  if (righe.length === 0) return esito;

  // Un provider R2 per tenant: la configurazione è un segreto, si legge solo
  // via service role e non ha senso rileggerla per ogni riga.
  const providerPerTenant = new Map<string, R2StorageProvider | null>();
  const provider = async (tenantId: string) => {
    if (providerPerTenant.has(tenantId)) return providerPerTenant.get(tenantId)!;
    const { data: t } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', tenantId)
      .maybeSingle();
    const p =
      getR2ProviderFromTenantConfig(
        (t?.r2_config as Record<string, unknown> | null) ?? null,
      ) ?? getR2ProviderFromEnv();
    providerPerTenant.set(tenantId, p);
    return p;
  };

  const daEliminare: string[] = [];

  for (const r of righe) {
    const giorni = r.updated_at
      ? Math.floor((Date.now() - Date.parse(r.updated_at)) / 86_400_000)
      : 0;
    esito.dettaglio.push({
      file: r.filename ?? r.id,
      mb: Math.round((r.size_bytes ?? 0) / 1048576),
      stato: r.status,
      eta: giorni >= 1 ? `${giorni} g` : '< 1 g',
    });
    if (dryRun) continue;

    try {
      const r2 = await provider(r.tenant_id);
      if (r2 && r.r2_key) {
        if (r.r2_upload_id) {
          await r2.abortMultipart(r.r2_key, r.r2_upload_id).catch(() => {});
          esito.multipartAbortiti += 1;
        }
        // Un PUT singolo interrotto non lascia oggetti, ma un caricamento
        // completato e mai finalizzato sì: si toglie comunque.
        const c = await r2.delete(r.r2_key).then(
          () => true,
          () => false,
        );
        if (c) esito.oggettiCancellati += 1;
      }
      daEliminare.push(r.id);
    } catch (e) {
      esito.errori.push(
        `${r.filename ?? r.id}: ${e instanceof Error ? e.message : 'errore'}`,
      );
    }
  }

  if (!dryRun && daEliminare.length > 0) {
    const { error: delErr } = await service
      .from('file_refs')
      .delete()
      .in('id', daEliminare);
    if (delErr) esito.errori.push(`cancellazione righe: ${delErr.message}`);
    else esito.righeEliminate = daEliminare.length;
  }

  return esito;
}
