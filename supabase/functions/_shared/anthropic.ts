// =====================================================================
// _shared/anthropic.ts — wrapper minimale Anthropic per Edge (Deno).
// Implementazione diretta su `https://api.anthropic.com/v1/messages`
// (niente SDK Node) con prompt cache sul blocco system.
//
// Modello forzato: claude-haiku-4-5 (allineato a
// packages/integrations/src/ai/index.ts).
// =====================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
export const HAIKU_MODEL = 'claude-haiku-4-5';

export interface ChatTextBlock {
  type: 'text';
  text: string;
}

export interface MessagesRequest {
  model?: string;
  max_tokens: number;
  /** Prompt cache automatica via `cache_control: ephemeral` sul system. */
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
}

export interface MessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ChatTextBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function apiKey(): string {
  const k = Deno.env.get('ANTHROPIC_API_KEY');
  if (!k) throw new Error('Missing ANTHROPIC_API_KEY');
  return k;
}

/**
 * Chiama Claude Haiku 4.5 e restituisce la response grezza.
 * `system` è sempre marcato `cache_control: ephemeral` per attivare
 * la prompt cache (utile su prompt riusati come quello di naming).
 */
export async function callHaiku(req: MessagesRequest): Promise<MessagesResponse> {
  const body = {
    model: req.model ?? HAIKU_MODEL,
    max_tokens: req.max_tokens,
    temperature: req.temperature,
    system: [
      {
        type: 'text',
        text: req.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: req.messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    })),
  };

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as MessagesResponse;
}

/** Concatena tutti i text-block del messaggio. */
export function textOf(res: MessagesResponse): string {
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
