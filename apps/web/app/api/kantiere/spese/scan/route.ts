import { type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import sharp from 'sharp';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';
import {
  parseImportoIt,
  estrazioneSufficiente,
  normalizzaCategoria,
  parseDataScontrino,
  parseNumeroPersone,
} from '@kommessa/api/spese';

import { tenantHasModule } from '@/app/_lib/modules';
import {
  chatCompletion,
  getVisionModel,
  isOpenAIConfigured,
  isAiUnavailable,
  OpenAiError,
} from '@/app/_lib/openai';
import { segnalaAiNonDisponibile } from '@/app/_lib/ai-alert';

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB: scontrini, non video
const THUMB_SIZE = 400;

const PROMPT_SCONTRINO = `Sei un assistente che legge scontrini e ricevute italiani.
Estrai SOLO questi campi e restituisci ESCLUSIVAMENTE un JSON valido (nessun testo extra):
{
  "ragione_sociale": string|null,        // nome esercente / ragione sociale
  "categoria": "hotel"|"ristorante"|"bar"|"trasporti"|"carburante"|"varie",
  "importo_totale": string|null,         // totale pagato, es "15,90"
  "importo_iva": string|null,            // IVA inclusa nel totale, es "2,87"
  "valuta": string|null,                 // es "EUR"
  "data_scontrino": string|null,         // ISO 8601 con ora se presente, es "2026-06-25T13:20:00"
  "partita_iva": string|null,
  "metodo_pagamento": "contanti"|"carta"|"altro"|null,
  "numero_documento": string|null,
  "indirizzo_esercente": string|null,
  "numero_persone": number|null       // numero di coperti o di menu' fissi rilevati; se non deducibile null
}
Regole: categoria dedotta dall'esercente (ristorante/trattoria/pizzeria=ristorante; bar/caffe=bar; albergo/hotel/B&B=hotel; benzina/carburante/distributore=carburante; pedaggio/parcheggio/taxi/treno/bus=trasporti; altrimenti varie).
numero_persone = numero di coperti o di menu' fissi rilevati sullo scontrino; se non deducibile usa null.
Importi col formato dello scontrino (virgola decimale ammessa). Se un campo non e' leggibile usa null. Rispondi solo col JSON.`;

const Estratto = z.object({
  ragione_sociale: z.string().trim().min(1).max(200).optional().catch(undefined),
  categoria: z.string().optional().catch(undefined),
  importo_totale: z.union([z.string(), z.number()]).optional().catch(undefined),
  importo_iva: z.union([z.string(), z.number()]).optional().catch(undefined),
  valuta: z.string().trim().min(1).max(8).optional().catch(undefined),
  data_scontrino: z.string().trim().min(4).max(40).optional().catch(undefined),
  partita_iva: z.string().trim().min(2).max(40).optional().catch(undefined),
  metodo_pagamento: z.enum(['contanti', 'carta', 'altro']).optional().catch(undefined),
  numero_documento: z.string().trim().min(1).max(60).optional().catch(undefined),
  indirizzo_esercente: z.string().trim().min(2).max(200).optional().catch(undefined),
  numero_persone: z.union([z.string(), z.number()]).optional().catch(undefined),
});

export async function POST(request: NextRequest) {
  // 1. Auth + gate modulo kantiere (Bertaiola/kommessa: 404, non raggiungibile)
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return Response.json({ ok: false, code: 'NON_AUTENTICATO' }, { status: 401 });
  }
  if (!(await tenantHasModule('kantiere'))) {
    return Response.json({ ok: false, code: 'MODULO_ASSENTE' }, { status: 404 });
  }

  // 2. File dalla form
  const form = await request.formData().catch(() => null);
  const file = form?.get('foto');
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ ok: false, code: 'FILE_MANCANTE' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, code: 'FILE_TROPPO_GRANDE' }, { status: 413 });
  }
  const mime = file.type || 'image/jpeg';
  const isPdf = mime === 'application/pdf';
  if (!mime.startsWith('image/') && !isPdf) {
    return Response.json({ ok: false, code: 'FORMATO_NON_SUPPORTATO' }, { status: 415 });
  }
  const originalBuf = Buffer.from(await file.arrayBuffer());

  // Downscale di sicurezza lato server: immagini a max 2048px lato lungo,
  // JPEG q88 (un filo piu' alta per il testo piccolo degli scontrini).
  // Garantisce il risultato anche se il client invia il grezzo (app vecchie /
  // upload office, che passa anch'esso da qui). I PDF restano intatti. Oltre
  // 2048px non si va: OpenAI vision ridimensiona comunque a 2048.
  let uploadBuf: Buffer = originalBuf;
  let uploadMime = mime;
  if (!isPdf) {
    try {
      uploadBuf = await sharp(originalBuf, { failOn: 'none' })
        .rotate()
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      uploadMime = 'image/jpeg';
    } catch {
      // sharp fallito: ripiego sul buffer originale
      uploadBuf = originalBuf;
      uploadMime = mime;
    }
  }

  // 3. R2 provider (per-tenant config con fallback env)
  const service = createServiceSupabase();
  const { data: tenantRow } = await service
    .from('tenants')
    .select('r2_config, slug')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) {
    return Response.json({ ok: false, code: 'R2_ASSENTE' }, { status: 503 });
  }

  // 4. Chiavi R2 ordinate per tenant/anno/mese
  const slug = (tenantRow?.slug as string | undefined) ?? ctx.tenantId;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const id = randomUUID();
  const ext = isPdf
    ? '.pdf'
    : uploadMime === 'image/png'
      ? '.png'
      : uploadMime === 'image/webp'
        ? '.webp'
        : '.jpg';
  const r2Key = `tenants/${slug}/kantiere/spese/${yyyy}/${mm}/${id}/scontrino${ext}`;
  const thumbKey = `tenants/${slug}/kantiere/spese/${yyyy}/${mm}/${id}/thumb.webp`;

  // 5. Upload originale + thumbnail (solo immagini; i PDF non hanno thumb)
  try {
    await r2.putObject(r2Key, uploadBuf, uploadMime);
  } catch (e) {
    return Response.json(
      { ok: false, code: 'UPLOAD_FALLITO', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
  let r2ThumbKey: string | null = null;
  if (!isPdf) {
    try {
      const thumbBuf = await sharp(originalBuf, { failOn: 'none' })
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 75 })
        .toBuffer();
      await r2.putObject(thumbKey, thumbBuf, 'image/webp');
      r2ThumbKey = thumbKey;
    } catch {
      // thumb non critica: si ricade sul full-size
    }
  }

  // 6. Estrazione vision (se OpenAI non configurato: lascio i campi vuoti,
  //    l'utente compila a mano — niente blocco del flusso)
  let dati = {
    ragione_sociale: null as string | null,
    categoria: 'varie' as string,
    importo_totale: null as number | null,
    importo_iva: null as number | null,
    valuta: 'EUR' as string,
    data_scontrino: null as string | null,
    partita_iva: null as string | null,
    metodo_pagamento: null as 'contanti' | 'carta' | 'altro' | null,
    numero_documento: null as string | null,
    indirizzo_esercente: null as string | null,
    numero_persone: null as number | null,
  };
  let aiOk = false;

  if (!isPdf && isOpenAIConfigured()) {
    let completionText: string | null = null;
    try {
      const b64 = uploadBuf.toString('base64');
      const completion = await chatCompletion({
        model: getVisionModel(),
        reasoningEffort: 'low',
        responseFormat: 'json_object',
        maxTokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_SCONTRINO },
              { type: 'image_url', image_url: { url: `data:${uploadMime};base64,${b64}`, detail: 'high' } },
            ],
          },
        ],
      });
      completionText = completion.text;
    } catch (err) {
      // AI NON DISPONIBILE (crediti/quota 429, chiave 401/403, OpenAI down 5xx,
      // rete): è un problema di SERVIZIO, non "ricevuta illeggibile". L'utente
      // non deve vederne il motivo: avvisa il super admin, pulisci la foto
      // orfana su R2 e chiedi di riprovare più tardi.
      if (isAiUnavailable(err)) {
        try {
          await r2.delete(r2Key);
          if (r2ThumbKey) await r2.delete(r2ThumbKey);
        } catch {
          // cleanup best-effort
        }
        await segnalaAiNonDisponibile({
          tenantId: ctx.tenantId,
          feature: 'spese_scan',
          model: getVisionModel(),
          status: err instanceof OpenAiError ? err.status ?? null : null,
          detail: err instanceof Error ? err.message : null,
        });
        return Response.json({ ok: false, code: 'AI_NON_DISPONIBILE' }, { status: 503 });
      }
      // Errore imprevisto NON del servizio: si prosegue coi campi vuoti.
      completionText = null;
    }

    if (completionText != null) {
      try {
        const cleaned = completionText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const parsed = Estratto.safeParse(JSON.parse(cleaned || '{}'));
        if (parsed.success) {
          const e = parsed.data;
          dati = {
            ragione_sociale: e.ragione_sociale ?? null,
            categoria: normalizzaCategoria(e.categoria),
            importo_totale: parseImportoIt(e.importo_totale ?? null),
            importo_iva: parseImportoIt(e.importo_iva ?? null),
            valuta: (e.valuta ?? 'EUR').toUpperCase().slice(0, 8),
            data_scontrino: parseDataScontrino(e.data_scontrino ?? null),
            partita_iva: e.partita_iva ?? null,
            metodo_pagamento: e.metodo_pagamento ?? null,
            numero_documento: e.numero_documento ?? null,
            indirizzo_esercente: e.indirizzo_esercente ?? null,
            numero_persone: parseNumeroPersone(e.numero_persone),
          };
          aiOk = true;
        }
      } catch {
        // output non parsabile: campi vuoti (compilazione manuale)
      }
    }
  }

  // 7. Soglia minima: senza totale + data la ricevuta e' considerata non leggibile.
  //    Il client puo' comunque riprovare; la foto resta su R2 (orfana, cleanup futuro).
  if (aiOk && !estrazioneSufficiente({
    importo_totale: dati.importo_totale,
    data_scontrino: dati.data_scontrino,
  })) {
    return Response.json(
      { ok: false, code: 'RICEVUTA_NON_LEGGIBILE' },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    r2Key,
    r2ThumbKey,
    mime: uploadMime,
    sizeBytes: uploadBuf.length,
    isPdf,
    estratto: dati,
    aiEstratto: aiOk,
  });
}
