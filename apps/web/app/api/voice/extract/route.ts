import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import {
  buildExtractPrompt,
  localExtract,
  type VoceCat,
} from '../_lib/extract-prompt';
import {
  chatCompletion,
  getChatModel,
  resolveTranscribeModelForTenant,
  isOpenAIConfigured,
  transcribeAudio,
} from '../../../_lib/openai';

/**
 * POST /api/voice/extract
 *
 * Body: multipart/form-data
 *   - audio: Blob (webm/opus o equivalente)
 *   - mode?: 'full' | 'transcript-only'  (default 'full')
 *
 * Pipeline OpenAI-only:
 *  1. Whisper (`whisper-1`) per la trascrizione it.
 *  2. `gpt-5-mini` (configurable via OPENAI_MODEL_CHAT) per l'estrazione
 *     campi strutturati. Forzato JSON, validato con Zod, voci_ids
 *     filtrate contro il catalogo reale del DB.
 *  3. Se OPENAI_API_KEY è placeholder → modalità preview con transcript
 *     fisso casuale + extraction via regex locali (`localExtract`).
 *
 * Privacy: l'audio NON viene persistito.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Audio fino a ~2 min: Whisper ~15-25s + extraction ~5-10s → 120s margin.
export const maxDuration = 120;

// .catch(undefined) su ogni campo: se il LLM restituisce un valore non
// conforme per un campo, quel campo viene scartato invece di far fallire
// l'intero parse (comportamento robusto per output LLM).
const OUTPUT_SCHEMA = z.object({
  ragione_sociale: z.string().trim().min(1).max(200).optional().catch(undefined),
  tipo: z.enum(['persona_fisica', 'azienda']).optional().catch(undefined),
  telefono: z.string().trim().min(4).max(40).optional().catch(undefined),
  email: z.string().trim().email().max(200).optional().catch(undefined),
  indirizzo: z.string().trim().min(3).max(300).optional().catch(undefined),
  citta: z.string().trim().min(1).max(120).optional().catch(undefined),
  voci_ids: z.array(z.number().int().positive()).max(20).optional().catch(undefined),
  descrizione: z.string().trim().min(1).max(200).optional().catch(undefined),
  note: z.string().trim().min(1).max(2000).optional().catch(undefined),
  tag_suggeriti: z.array(z.string().trim().min(1).max(40)).max(5).optional().catch(undefined),
  // Ondata 4: referenti del cliente. Estratti quando il dettato dice
  // esplicitamente "il referente è …", "chiamare …", "tecnico Mario, 333…".
  referenti: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(160).catch(''),
        ruolo: z.string().trim().min(1).max(80).optional().catch(undefined),
        telefono: z.string().trim().min(4).max(40).optional().catch(undefined),
        email: z.string().trim().email().max(200).optional().catch(undefined),
      }),
    )
    .max(5)
    .optional()
    .catch(undefined),
});

type SuggestedFields = z.infer<typeof OUTPUT_SCHEMA>;

interface ResponseShape {
  transcript: string;
  suggested?: SuggestedFields;
  _preview?: boolean;
  _model?: string;
  _previewReason?: string;
}

const PREVIEW_TRANSCRIPTS: ReadonlyArray<string> = [
  'Allora sopralluogo da Rossi Mario via Roma 12 Treviso, mi ha chiesto di sostituire la caldaia e di rifargli due bagni nuovi completi. Urgente perché parte a febbraio. Telefono 333 4567890.',
  'Sono dalla signora Bianchi in via Garibaldi 8 a Castelfranco Veneto, vuole un impianto fotovoltaico da 6 kilowatt con accumulo. Ha già la pratica enea pronta. Email bianchi.lucia@gmail.com.',
  'Cliente Edilizia Tre S.r.l., cantiere a Conegliano via Industria 22, dobbiamo fare il pavimento radiante e la centrale termica per un duplex nuovo. Lavoro per superbonus, garanzia decennale richiesta.',
];

export async function POST(req: NextRequest) {
  // --- Auth ---
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  // --- Body ---
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'BAD_BODY' }, { status: 400 });
  }
  const audio = form.get('audio');
  const mode = (form.get('mode') as string | null) ?? 'full';

  const openaiOn = isOpenAIConfigured();
  const previewMode = !openaiOn;

  // ============================================================
  // 1. Trascrizione (Whisper)
  // ============================================================
  let transcript: string;
  let usedTranscribeModel: string;

  if (previewMode) {
    // Modalità preview: niente audio decoding, transcript random plausibile.
    const idx = Math.floor(Math.random() * PREVIEW_TRANSCRIPTS.length);
    transcript = PREVIEW_TRANSCRIPTS[idx]!;
    usedTranscribeModel = 'preview-stub';
  } else {
    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: 'audio mancante o non valido' },
        { status: 400 },
      );
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: 'audio vuoto' }, { status: 400 });
    }
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'audio troppo grande (>25 MB)' },
        { status: 413 },
      );
    }

    try {
      // Whisper accetta: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac.
      // Mapping MIME → estensione coerente con la lista. Il default 'webm'
      // copre Chrome/Firefox/Android; iOS Safari produce audio/mp4 → 'mp4'.
      const mime = (audio.type || '').toLowerCase();
      const ext = mime.includes('mp4') || mime.includes('m4a')
        ? 'm4a'
        : mime.includes('mpeg') || mime.includes('mp3')
          ? 'mp3'
          : mime.includes('wav')
            ? 'wav'
            : mime.includes('ogg')
              ? 'ogg'
              : mime.includes('flac')
                ? 'flac'
                : 'webm';
      console.warn(
        `[voice/extract] transcribe start — size=${audio.size}B mime="${mime}" → ext=${ext}`,
      );
      // Modello configurabile per tenant dal pannello super admin.
      // Fallback: OPENAI_MODEL_TRANSCRIBE env → 'whisper-1'.
      const transcribeModelForTenant = await resolveTranscribeModelForTenant(
        ctx.tenantId,
      );
      const r = await transcribeAudio({
        audio,
        filename: `voicenote.${ext}`,
        language: 'it',
        model: transcribeModelForTenant,
      });
      transcript = r.text;
      usedTranscribeModel = r.model;
      if (transcript.length === 0) {
        return NextResponse.json(
          { error: "Nessun testo riconosciuto nell'audio." },
          { status: 422 },
        );
      }
    } catch (err) {
      // Logghiamo SEMPRE il dettaglio in console (visibile in Vercel logs).
      // L'errore tipico è: 400 "Invalid file format" (mime sbagliato), 401
      // (API key), 429 (rate limit), 413 (file troppo grande lato OpenAI).
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[voice/extract] Whisper FAIL: ${msg}`);
      return NextResponse.json(
        {
          error: 'Trascrizione fallita (Whisper).',
          detail: msg.slice(0, 300),
        },
        { status: 502 },
      );
    }
  }

  // Modalità "transcript-only" → ritorna solo il testo.
  if (mode === 'transcript-only') {
    const body: ResponseShape = {
      transcript,
      _preview: previewMode || undefined,
      _previewReason: previewMode
        ? 'OPENAI_API_KEY non configurata'
        : undefined,
      _model: usedTranscribeModel,
    };
    return NextResponse.json(body, { status: 200 });
  }

  // ============================================================
  // 2. Estrazione campi
  // ============================================================
  const supabase = createServerSupabase();
  const [vociRes, tagRes] = await Promise.all([
    supabase
      .from('voci_catalogo')
      .select('id, nome')
      .order('ordine_visualizzazione'),
    supabase
      .from('tenant_tags_summary')
      .select('tag, usage_count')
      .eq('tenant_id', ctx.tenantId)
      .order('usage_count', { ascending: false })
      .limit(30),
  ]);
  const voci: VoceCat[] = (vociRes.data ?? []).map((v: any) => ({
    id: v.id as number,
    nome: v.nome as string,
  }));
  const tagEsistenti: string[] = (tagRes.data ?? []).map(
    (t: any) => t.tag as string,
  );

  let suggested: SuggestedFields = {};
  let usedExtractModel: string;
  let extractionPreview = false;

  if (previewMode) {
    const local = localExtract(transcript);
    const validIds = new Set(voci.map((v) => v.id));
    if (local.voci_ids) {
      local.voci_ids = local.voci_ids.filter((id) => validIds.has(id));
      if (local.voci_ids.length === 0) delete local.voci_ids;
    }
    const parsed = OUTPUT_SCHEMA.safeParse(local);
    suggested = parsed.success ? parsed.data : {};
    usedExtractModel = 'local-heuristics';
    extractionPreview = true;
  } else {
    const { system, user } = buildExtractPrompt({
      transcript,
      voci,
      tagEsistenti,
    });
    try {
      // Extraction task: usa modello non-reasoning per JSON output affidabile.
      // gpt-5-mini è reasoning e brucia il budget token sul ragionamento
      // interno → output JSON spesso troncato/vuoto. gpt-4o-mini è il gold
      // standard per structured extraction (1-2s, response_format strict).
      // Override via env OPENAI_MODEL_EXTRACT, fallback a gpt-4o-mini.
      const extractModel =
        process.env.OPENAI_MODEL_EXTRACT?.trim() || 'gpt-4o-mini';
      const completion = await chatCompletion({
        model: extractModel,
        maxTokens: 2000,
        responseFormat: 'json_object',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const cleaned = completion.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleaned);
      } catch {
        parsedJson = {};
      }
      const parsed = OUTPUT_SCHEMA.safeParse(parsedJson);
      if (parsed.success) {
        const validIds = new Set(voci.map((v) => v.id));
        if (parsed.data.voci_ids) {
          parsed.data.voci_ids = parsed.data.voci_ids.filter((id) =>
            validIds.has(id),
          );
          if (parsed.data.voci_ids.length === 0) delete parsed.data.voci_ids;
        }
        suggested = parsed.data;
        usedExtractModel = completion.model;
      } else {
        // Il modello ha risposto con JSON valido ma non conforme allo schema.
        // Non usiamo euristiche locali in produzione: restituiamo i campi
        // vuoti (l'utente li compila a mano dal transcript).
        console.error('[voice/extract] Zod schema miss:', JSON.stringify(parsed.error.flatten()));
        suggested = {};
        usedExtractModel = completion.model + '-schema-miss';
      }
    } catch (err) {
      // Errore reale OpenAI (HTTP 4xx/5xx, timeout, rete).
      // In modalità preview usiamo le euristiche locali; in produzione
      // restituiamo un errore chiaro invece di degradare silenziosamente.
      console.error('[voice/extract] OpenAI extraction error:', err);
      return NextResponse.json(
        {
          error:
            err instanceof Error && err.message.includes('429')
              ? 'Limite API raggiunto — riprova tra qualche secondo.'
              : 'Estrazione AI non riuscita. Riprova tra qualche secondo.',
          detail: err instanceof Error ? err.message.slice(0, 300) : 'unknown',
        },
        { status: 502 },
      );
    }
  }

  const isPreview = previewMode || extractionPreview;
  const reason: string[] = [];
  if (previewMode) reason.push('OPENAI_API_KEY non configurata');
  if (extractionPreview && !previewMode)
    reason.push('estrazione via heuristics locali (LLM error)');

  const body: ResponseShape = {
    transcript,
    suggested,
    _preview: isPreview || undefined,
    _previewReason: reason.length > 0 ? reason.join(' · ') : undefined,
    _model: `${usedTranscribeModel}+${usedExtractModel}`,
  };

  return NextResponse.json(body, { status: 200 });
}
