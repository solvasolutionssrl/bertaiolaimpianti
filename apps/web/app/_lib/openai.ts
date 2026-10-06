/**
 * Helper centralizzato per le chiamate OpenAI.
 *
 * Strategia "no nuove dipendenze": usiamo `fetch` HTTP grezzo verso
 * `https://api.openai.com/v1/*`. Niente SDK npm, niente bump di
 * `package.json`. Va benissimo per i nostri 3 endpoint (chat completion,
 * chat completion streaming, audio transcription).
 *
 * Modelli letti da env (default sensati se mancanti):
 *  - OPENAI_MODEL_CHAT       (default gpt-5-mini) — extraction, naming, copilot
 *  - OPENAI_MODEL_VISION     (default gpt-5-mini) — riservato per future
 *  - OPENAI_MODEL_TRANSCRIBE (default whisper-1)  — Whisper
 *
 * `isPlaceholderKey`: una key è "placeholder" se manca o se ha il pattern
 * tipico delle .env.example (`sk-...`, `placeholder`). In tal caso
 * cadiamo sul fallback locale dei singoli endpoint (preview mode).
 */

import {
  MAX_VOCABOLARIO,
  MODELLO_ESTREMO,
  famigliaTrascrizione,
  impostazioniTrascrizioneDaConfig,
  preparaVocabolario,
  promptConVocabolario,
  risolviModelloTrascrizione,
} from '@kommessa/api/trascrizione';

export const OPENAI_API_BASE = 'https://api.openai.com/v1';

export function getOpenAIKey(): string | undefined {
  const k = process.env.OPENAI_API_KEY;
  if (!k) return undefined;
  const t = k.trim();
  if (t.length === 0) return undefined;
  return t;
}

export function isPlaceholderKey(key: string | undefined): boolean {
  if (!key) return true;
  const k = key.trim();
  if (k.length === 0) return true;
  if (k === 'placeholder') return true;
  // Pattern .env.example tipici
  if (k.startsWith('sk-...')) return true;
  if (k.startsWith('sk-proj-...')) return true;
  if (k === 'sk-' || k === 'sk-proj-') return true;
  return false;
}

export function isOpenAIConfigured(): boolean {
  return !isPlaceholderKey(getOpenAIKey());
}

/**
 * Errore di una chiamata OpenAI con lo status HTTP. `aiUnavailable=true` quando
 * il problema è del SERVIZIO (non del nostro input): 429 (rate limit / crediti
 * esauriti `insufficient_quota`), 401/403 (chiave/billing), 5xx (OpenAI down).
 * Serve a distinguere "AI momentaneamente non disponibile" da "AI ha risposto
 * ma il contenuto non era leggibile".
 */
export class OpenAiError extends Error {
  status?: number;
  aiUnavailable: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OpenAiError';
    this.status = status;
    this.aiUnavailable =
      status === 429 ||
      status === 401 ||
      status === 403 ||
      (typeof status === 'number' && status >= 500);
  }
}

/** true se l'errore indica AI non disponibile (servizio): quota/chiave/5xx o rete. */
export function isAiUnavailable(e: unknown): boolean {
  if (e instanceof OpenAiError) return e.aiUnavailable;
  // Errori di rete/timeout prima ancora di avere una risposta HTTP.
  return (
    e instanceof Error &&
    /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|aborted|timeout/i.test(e.message)
  );
}

export function getChatModel(): string {
  return process.env.OPENAI_MODEL_CHAT?.trim() || 'gpt-5-mini';
}

export function getVisionModel(): string {
  return process.env.OPENAI_MODEL_VISION?.trim() || 'gpt-5-mini';
}

export function getTranscribeModel(): string {
  return process.env.OPENAI_MODEL_TRANSCRIBE?.trim() || MODELLO_ESTREMO;
}

/**
 * Il modello di trascrizione per un tenant, su tre livelli.
 *
 *   1. `tenants.transcribe_model` — la scelta fatta per quel cliente
 *   2. `platform_settings` riga `modelli_trascrizione` — il predefinito
 *   3. `OPENAI_MODEL_TRANSCRIBE` — l'ambiente
 *   4. `MODELLO_ESTREMO` — la rete, se tutto tace
 *
 * ⚠️ **Nessun elenco di modelli ammessi in codice, ed è voluto.** Si controlla
 * solo che il nome abbia una forma plausibile (`risolviModelloTrascrizione`):
 * quando OpenAI pubblica un modello nuovo deve bastare scriverne il nome nel
 * pannello, senza un deploy. Un elenco chiuso qui dentro sarebbe la stessa
 * trappola dei limiti di invio prima del 05/10 — una decisione di prodotto
 * congelata nel codice.
 *
 * Le due letture vanno **in parallelo**: stanno sul percorso critico di ogni
 * dettatura, e in serie aggiungevano due viaggi verso l'Irlanda prima ancora di
 * spedire l'audio.
 *
 * Service role: il super admin sceglie per tenant, e questa funzione gira lato
 * server prima di restituire qualunque cosa al browser.
 */
export async function resolveTranscribeModelForTenant(
  tenantId: string,
): Promise<string> {
  let tenant: string | null = null;
  let globale: string | null = null;
  try {
    // import dinamico per evitare ciclicità con @kommessa/api
    const { createServiceSupabase } = await import('@kommessa/api/service');
    const supabase = createServiceSupabase();
    const [scelta, impostazioni] = await Promise.all([
      supabase
        .from('tenants')
        .select('transcribe_model')
        .eq('id', tenantId)
        .maybeSingle(),
      supabase
        .from('platform_settings' as never)
        .select('valore')
        .eq('chiave', 'modelli_trascrizione')
        .maybeSingle(),
    ]);
    tenant =
      (scelta.data as { transcribe_model?: string | null } | null)
        ?.transcribe_model ?? null;
    globale = impostazioniTrascrizioneDaConfig(
      (impostazioni.data as { valore?: unknown } | null)?.valore ?? null,
    ).predefinito;
  } catch {
    // Se il database non risponde non si blocca il dettato: si scende di
    // livello e si usa l'ambiente.
  }
  return risolviModelloTrascrizione({
    tenant,
    globale,
    env: process.env.OPENAI_MODEL_TRANSCRIBE?.trim() || null,
  });
}

// ---------------------------------------------------------------------
// Chat completion (non-streaming)
// ---------------------------------------------------------------------

/** Parte di un messaggio multimodale (testo o immagine). */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** Stringa semplice oppure array multimodale (vision). */
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * Quando passato, forza la risposta come JSON object. Il prompt deve
   * comunque richiedere esplicitamente JSON (regola OpenAI).
   */
  responseFormat?: 'json_object' | 'text';
  /**
   * Solo modelli "reasoning" (gpt-5-*). Riduce il ragionamento per
   * risposte piu' rapide. 'minimal' | 'low' | 'medium' | 'high'.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface ChatCompletionResult {
  text: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Una chiamata chat completion bloccante. Restituisce il testo del primo
 * choice. Errori HTTP vengono ribaltati come Error con messaggio sintetico.
 */
export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const key = getOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY non configurata');

  const model = opts.model ?? getChatModel();
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_completion_tokens: opts.maxTokens ?? 800,
  };
  // Alcuni modelli "reasoning" (gpt-5-*) NON accettano temperature custom
  // (solo il default 1). Lasciamo il parametro a opt-in: lo includiamo
  // soltanto se chiamante lo passa esplicitamente, così evitiamo HTTP 400
  // su gpt-5-mini.
  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  if (opts.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  if (opts.reasoningEffort) {
    body.reasoning_effort = opts.reasoningEffort;
  }

  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new OpenAiError(
      `OpenAI HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? '';
  return { text, model: json.model ?? model, usage: json.usage };
}

// ---------------------------------------------------------------------
// Chat completion (streaming via SSE)
// ---------------------------------------------------------------------

export interface ChatStreamOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Restituisce un AsyncIterable di "delta" testuali estratti dallo stream
 * SSE di OpenAI (`data: {"choices":[{"delta":{"content":"..."}}]}`).
 * Termina quando arriva `[DONE]` o la connessione si chiude.
 */
export async function* chatCompletionStream(
  opts: ChatStreamOptions,
): AsyncGenerator<string, void, unknown> {
  const key = getOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY non configurata');

  const model = opts.model ?? getChatModel();
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_completion_tokens: opts.maxTokens ?? 1024,
    stream: true,
  };
  if (opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }

  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new OpenAiError(
      `OpenAI stream HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE event delimiter: doppio newline
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const rawEvent = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      // Ogni event può avere più righe `data: ...`
      const lines = rawEvent.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // JSON parziale o frame keepalive → ignora
        }
      }
    }
  }
}

// ---------------------------------------------------------------------
// Whisper (audio transcription)
// ---------------------------------------------------------------------

export interface TranscribeOptions {
  audio: Blob;
  filename?: string;
  /** Lingua attesa, codice ISO 639-1 (es. `it`). */
  language?: string;
  model?: string;
  /**
   * Parole che con ogni probabilita' si sentiranno: comuni dell'anagrafica,
   * lavorazioni a catalogo, marche. Vanno passate **letterali**, come vanno
   * scritte.
   *
   * Solo la famiglia `moderna` ha un campo apposta (`keywords`); per le altre
   * due diventano un suggerimento dentro `prompt`, che e' la tecnica
   * documentata da OpenAI per Whisper. In entrambi i casi aiutano.
   */
  vocabolario?: readonly string[];
  /** Contesto libero sulla registrazione. */
  contesto?: string;
}


export interface TranscribeResult {
  text: string;
  model: string;
}

/**
 * Trascrive un audio.
 *
 * ⚠️ I tre gruppi di modelli accettano campi **diversi**, e il campo sbagliato
 * non viene ignorato: fa fallire la richiesta. `gpt-transcribe` vuole
 * `languages` come array e rifiuta `language`; whisper e i gpt-4o vogliono
 * `language` singola e non sanno cosa sia `keywords`. La famiglia la decide
 * `famigliaTrascrizione`, che su un identificativo sconosciuto sceglie la via
 * piu' conservativa.
 *
 * `response_format` resta `json`: nessuno dei modelli nuovi sa produrre
 * `verbose_json`, e a noi serve solo il testo. Volendo un domani i tempi
 * parola per parola, l'unico che li sa dare e' ancora `whisper-1`.
 */
export async function transcribeAudio(
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const key = getOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY non configurata');

  const model = opts.model ?? getTranscribeModel();
  const famiglia = famigliaTrascrizione(model);
  const vocabolario = (opts.vocabolario ?? []).slice(0, MAX_VOCABOLARIO);

  const fd = new FormData();
  fd.append('file', opts.audio, opts.filename ?? 'audio.webm');
  fd.append('model', model);
  fd.append('response_format', 'json');

  if (famiglia === 'moderna') {
    // Campi dedicati: la lingua e' un array, e il vocabolario ha casa propria.
    if (opts.language) fd.append('languages[]', opts.language);
    for (const parola of vocabolario) fd.append('keywords[]', parola);
    if (opts.contesto) fd.append('prompt', opts.contesto);
  } else {
    if (opts.language) fd.append('language', opts.language);
    const prompt = promptConVocabolario(opts.contesto, vocabolario);
    if (prompt) fd.append('prompt', prompt);
  }

  const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new OpenAiError(
      `Transcribe HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
      res.status,
    );
  }
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? '').trim(), model };
}
