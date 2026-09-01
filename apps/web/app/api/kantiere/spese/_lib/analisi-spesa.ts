import 'server-only';
import { z } from 'zod';

import {
  CODICE_PAGAMENTO_DI_RIPIEGO,
  METODI_PREDEFINITI,
  leggiMetodiAttivi,
} from '@/app/_lib/metodi-pagamento';

import { createServiceSupabase } from '@kommessa/api/service';
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
  calcolaImponibile,
} from '@kommessa/api/spese';

import {
  chatCompletion,
  getVisionModel,
  isOpenAIConfigured,
  isAiUnavailable,
  OpenAiError,
} from '@/app/_lib/openai';
import { segnalaAiNonDisponibile } from '@/app/_lib/ai-alert';

/**
 * Analisi AI della ricevuta, ESEGUITA IN CLOUD dopo l'upload (waitUntil) o su
 * richiesta ("Rianalizza"). Disaccoppiata dalla cattura: il tecnico non aspetta.
 *
 * La foto è già su R2 e la riga `spese` esiste in stato 'in_elaborazione'.
 * `processSpesaAI` legge l'immagine (dal buffer passato o riscaricandola da R2),
 * estrae i campi e AGGIORNA la riga:
 *   - estrazione sufficiente → stato 'confermata' coi campi valorizzati;
 *   - illeggibile / AI non disponibile / PDF → stato 'bozza' (da verificare in
 *     ufficio), foto SEMPRE conservata (`analisi_errore` spiega il perché).
 */

function promptScontrino(metodi: { codice: string; nome: string }[]): string {
  // I metodi non sono piu' un elenco fisso: l'ufficio li gestisce da
  // Impostazioni > Pagamenti, e quello che aggiunge deve diventare subito una
  // scelta possibile anche per chi legge lo scontrino.
  const elenco = metodi.map((m) => `"${m.codice}"`).join("|") || '"altro"';
  const glossario = metodi.map((m) => `${m.codice} = ${m.nome}`).join("; ");
  return `Sei un assistente che legge scontrini e ricevute italiani.
Estrai SOLO questi campi e restituisci ESCLUSIVAMENTE un JSON valido (nessun testo extra):
{
  "ragione_sociale": string|null,        // nome esercente / ragione sociale
  "categoria": "hotel"|"ristorante"|"bar"|"trasporti"|"carburante"|"varie",
  "importo_totale": string|null,         // totale pagato, es "15,90"
  "importo_iva": string|null,            // IVA inclusa nel totale, es "2,87"
  "valuta": string|null,                 // es "EUR"
  "data_scontrino": string|null,         // ISO 8601 con ora se presente, es "2026-06-25T13:20:00"
  "partita_iva": string|null,
  "metodo_pagamento": ${elenco}|null,
  "numero_documento": string|null,
  "indirizzo_esercente": string|null,
  "numero_persone": number|null       // numero di coperti o di menu' fissi rilevati; se non deducibile null
}
Regole: categoria dedotta dall'esercente (ristorante/trattoria/pizzeria=ristorante; bar/caffe=bar; albergo/hotel/B&B=hotel; benzina/carburante/distributore=carburante; pedaggio/parcheggio/taxi/treno/bus=trasporti; altrimenti varie).
numero_persone = numero di coperti o di menu' fissi rilevati sullo scontrino; se non deducibile usa null.
Importi col formato dello scontrino (virgola decimale ammessa). Se un campo non e' leggibile usa null.
metodo_pagamento: scegli SOLO fra questi valori, che significano ${glossario}. Se non e' deducibile usa null.
Rispondi solo col JSON.`;
}

const EstrattoSchema = z.object({
  ragione_sociale: z.string().trim().min(1).max(200).optional().catch(undefined),
  categoria: z.string().optional().catch(undefined),
  importo_totale: z.union([z.string(), z.number()]).optional().catch(undefined),
  importo_iva: z.union([z.string(), z.number()]).optional().catch(undefined),
  valuta: z.string().trim().min(1).max(8).optional().catch(undefined),
  data_scontrino: z.string().trim().min(4).max(40).optional().catch(undefined),
  partita_iva: z.string().trim().min(2).max(40).optional().catch(undefined),
  // Non un enum chiuso: i codici li decide il cliente. Il controllo vero e'
  // dopo, contro la sua lista — qui basta che sia una stringa breve.
  metodo_pagamento: z.string().trim().min(2).max(40).optional().catch(undefined),
  numero_documento: z.string().trim().min(1).max(60).optional().catch(undefined),
  indirizzo_esercente: z.string().trim().min(2).max(200).optional().catch(undefined),
  numero_persone: z.union([z.string(), z.number()]).optional().catch(undefined),
});

export type DatiScontrino = {
  ragione_sociale: string | null;
  categoria: string;
  importo_totale: number | null;
  importo_iva: number | null;
  valuta: string;
  data_scontrino: string | null;
  partita_iva: string | null;
  metodo_pagamento: string | null;
  numero_documento: string | null;
  indirizzo_esercente: string | null;
  numero_persone: number | null;
};

export type EsitoEstrazione =
  | { stato: 'ok'; dati: DatiScontrino; aiOk: boolean }
  | { stato: 'ai_non_disponibile' };

const DATI_VUOTI: DatiScontrino = {
  ragione_sociale: null,
  categoria: 'varie',
  importo_totale: null,
  importo_iva: null,
  valuta: 'EUR',
  data_scontrino: null,
  partita_iva: null,
  metodo_pagamento: null,
  numero_documento: null,
  indirizzo_esercente: null,
  numero_persone: null,
};

/**
 * Chiama la vision su un buffer immagine e ritorna i campi normalizzati. NON
 * lancia sugli errori "di servizio" (crediti/quota/down): li segnala col ramo
 * `ai_non_disponibile` così il chiamante può conservare la foto e avvisare il
 * super admin. Gli altri errori/parse-failure ricadono su campi vuoti (aiOk=false).
 */
export async function estraiDatiScontrino(
  buf: Buffer,
  mime: string,
  /** I metodi di pagamento del cliente: e' fra questi che l'AI puo' scegliere. */
  metodi: { codice: string; nome: string }[] = METODI_PREDEFINITI,
): Promise<EsitoEstrazione> {
  if (mime === 'application/pdf' || !isOpenAIConfigured()) {
    return { stato: 'ok', dati: { ...DATI_VUOTI }, aiOk: false };
  }

  let completionText: string | null = null;
  try {
    const b64 = buf.toString('base64');
    const completion = await chatCompletion({
      model: getVisionModel(),
      reasoningEffort: 'low',
      responseFormat: 'json_object',
      maxTokens: 700,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptScontrino(metodi) },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
          ],
        },
      ],
    });
    completionText = completion.text;
  } catch (err) {
    if (isAiUnavailable(err)) return { stato: 'ai_non_disponibile' };
    // Errore imprevisto NON di servizio: campi vuoti (compilazione manuale).
    return { stato: 'ok', dati: { ...DATI_VUOTI }, aiOk: false };
  }

  if (completionText == null) return { stato: 'ok', dati: { ...DATI_VUOTI }, aiOk: false };
  try {
    const cleaned = completionText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = EstrattoSchema.safeParse(JSON.parse(cleaned || '{}'));
    if (!parsed.success) return { stato: 'ok', dati: { ...DATI_VUOTI }, aiOk: false };
    const e = parsed.data;
    return {
      stato: 'ok',
      aiOk: true,
      dati: {
        ragione_sociale: e.ragione_sociale ?? null,
        categoria: normalizzaCategoria(e.categoria),
        importo_totale: parseImportoIt(e.importo_totale ?? null),
        importo_iva: parseImportoIt(e.importo_iva ?? null),
        valuta: (e.valuta ?? 'EUR').toUpperCase().slice(0, 8),
        data_scontrino: parseDataScontrino(e.data_scontrino ?? null),
        partita_iva: e.partita_iva ?? null,
        // L'AI puo' rispondere qualunque cosa: teniamo solo un codice che
        // il cliente ha davvero in elenco, altrimenti null e sceglie l'utente.
        metodo_pagamento: metodi.some((m) => m.codice === e.metodo_pagamento)
          ? (e.metodo_pagamento as string)
          : null,
        numero_documento: e.numero_documento ?? null,
        indirizzo_esercente: e.indirizzo_esercente ?? null,
        numero_persone: parseNumeroPersone(e.numero_persone),
      },
    };
  } catch {
    return { stato: 'ok', dati: { ...DATI_VUOTI }, aiOk: false };
  }
}

/** Scarica un oggetto R2 (presigned GET + fetch) come Buffer. Null se assente. */
async function scaricaDaR2(
  tenantId: string,
  r2Key: string,
): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const service = createServiceSupabase();
    const { data: t } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', tenantId)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig((t?.r2_config as Record<string, unknown> | null) ?? null) ??
      getR2ProviderFromEnv();
    if (!r2) return null;
    const { url } = await r2.createPresignedGetUrl(r2Key, { ttlSec: 120 });
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    const mime = resp.headers.get('content-type') || 'image/jpeg';
    return { buf: Buffer.from(ab), mime };
  } catch {
    return null;
  }
}

type SpesaRowMinima = {
  tenant_id: string;
  r2_key: string | null;
  r2_thumb_key: string | null;
  foto_mime: string | null;
};

/**
 * Analizza la ricevuta di una spesa già creata e ne aggiorna i campi. Idempotente
 * e best-effort: qualunque esito, la riga resta (con la foto). Usa service role
 * (gira in background, fuori dal contesto RLS del chiamante) con scoping esplicito
 * sull'id della spesa.
 */
export async function processSpesaAI(opts: {
  tenantId: string;
  spesaId: string;
  /** Buffer già in memoria (path upload): evita di riscaricare da R2. */
  buf?: Buffer;
  mime?: string;
}): Promise<void> {
  const service = createServiceSupabase();

  const { data: row } = await service
    .from('spese' as never)
    .select('tenant_id, r2_key, r2_thumb_key, foto_mime')
    .eq('id', opts.spesaId)
    .eq('tenant_id', opts.tenantId)
    .maybeSingle();
  const spesa = row as SpesaRowMinima | null;
  if (!spesa) return;

  // Sorgente immagine: buffer passato oppure riscaricata da R2.
  let buf = opts.buf ?? null;
  let mime = opts.mime ?? spesa.foto_mime ?? 'image/jpeg';
  if (!buf) {
    if (!spesa.r2_key) {
      await service
        .from('spese' as never)
        .update({ stato: 'bozza', analisi_at: new Date().toISOString(), analisi_errore: 'foto_assente' } as never)
        .eq('id', opts.spesaId)
        .eq('tenant_id', opts.tenantId);
      return;
    }
    const scaricata = await scaricaDaR2(opts.tenantId, spesa.r2_key);
    if (!scaricata) {
      // Non riesco a leggere la foto ora: lascio in elaborazione così un
      // successivo "Rianalizza"/cron potrà riprovare (non la "brucio" a bozza).
      return;
    }
    buf = scaricata.buf;
    mime = scaricata.mime;
  }

  // I metodi di pagamento del cliente: l'AI sceglie fra i suoi, non fra tre
  // scritti nel codice.
  const metodi = await leggiMetodiAttivi(service, opts.tenantId);
  const esito = await estraiDatiScontrino(buf, mime, metodi);

  if (esito.stato === 'ai_non_disponibile') {
    // Problema di SERVIZIO (non "illeggibile"): avvisa il super admin, conserva
    // la foto e lascia la riga come "da verificare" a mano.
    await segnalaAiNonDisponibile({
      tenantId: opts.tenantId,
      feature: 'spese_scan',
      model: getVisionModel(),
      status: null,
      detail: 'analisi asincrona spesa',
    });
    await service
      .from('spese' as never)
      .update({ stato: 'bozza', analisi_at: new Date().toISOString(), analisi_errore: 'ai_non_disponibile' } as never)
      .eq('id', opts.spesaId)
      .eq('tenant_id', opts.tenantId);
    return;
  }

  const d = esito.dati;
  const sufficiente =
    esito.aiOk && estrazioneSufficiente({ importo_totale: d.importo_totale, data_scontrino: d.data_scontrino });

  const patch: Record<string, unknown> = {
    categoria: d.categoria,
    ragione_sociale: d.ragione_sociale,
    valuta: d.valuta || 'EUR',
    data_scontrino: d.data_scontrino,
    partita_iva: d.partita_iva,
    // Se l'AI non se la sente, si ripiega sul primo metodo in uso del cliente:
    // 'carta' potrebbe non esistere piu' nel suo elenco.
    metodo_pagamento: d.metodo_pagamento ?? metodi[0]?.codice ?? CODICE_PAGAMENTO_DI_RIPIEGO,
    numero_documento: d.numero_documento,
    indirizzo_esercente: d.indirizzo_esercente,
    numero_persone: d.numero_persone ?? 1,
    ai_raw: d as unknown as object,
    analisi_at: new Date().toISOString(),
  };
  if (d.importo_totale != null) {
    patch.importo_totale = d.importo_totale;
    patch.importo_iva = d.importo_iva;
    patch.imponibile = calcolaImponibile(d.importo_totale, d.importo_iva);
  }

  if (sufficiente) {
    patch.stato = 'confermata';
    patch.analisi_errore = null;
  } else {
    // AI ok ma incompleta, oppure OpenAI non configurato/PDF → da verificare.
    patch.stato = 'bozza';
    patch.analisi_errore = esito.aiOk ? 'illeggibile' : 'non_estratto';
  }

  await service
    .from('spese' as never)
    .update(patch as never)
    .eq('id', opts.spesaId)
    .eq('tenant_id', opts.tenantId);
}
