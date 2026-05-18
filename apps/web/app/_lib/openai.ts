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

export function getChatModel(): string {
  return process.env.OPENAI_MODEL_CHAT?.trim() || 'gpt-5-mini';
}

export function getVisionModel(): string {
  return process.env.OPENAI_MODEL_VISION?.trim() || 'gpt-5-mini';
}

export function getTranscribeModel(): string {
  return process.env.OPENAI_MODEL_TRANSCRIBE?.trim() || 'whisper-1';
}

// ---------------------------------------------------------------------
// Chat completion (non-streaming)
// ---------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
    throw new Error(
      `OpenAI HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
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
    throw new Error(
      `OpenAI stream HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
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
  language?: string;
  model?: string;
}

export interface TranscribeResult {
  text: string;
  model: string;
}

export async function transcribeAudio(
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const key = getOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY non configurata');

  const model = opts.model ?? getTranscribeModel();
  const fd = new FormData();
  fd.append('file', opts.audio, opts.filename ?? 'audio.webm');
  fd.append('model', model);
  if (opts.language) fd.append('language', opts.language);
  fd.append('response_format', 'json');

  const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `Transcribe HTTP ${res.status}: ${errText.slice(0, 300) || 'unknown'}`,
    );
  }
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? '').trim(), model };
}
