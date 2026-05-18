import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL = 'claude-haiku-4-5';

export interface NamingInput {
  ragioneSociale: string;
  indirizzo?: string;
  voci?: string[]; // nomi leggibili delle voci selezionate
  note?: string;
}

export interface NamingProposal {
  descrizione: string; // CamelCase, 1-4 parole, max 30 char
  alternativeMatching: string[];
  raw: string;
}

let cached: Anthropic | null = null;
function client() {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  cached = new Anthropic({ apiKey });
  return cached;
}

const SYSTEM = `Sei un assistente che genera nomi brevi per cartelle di commessa di un'azienda termoidraulica.
Vincoli:
- 1 a 4 parole in CamelCase, max 30 caratteri
- Niente accenti, spazi, '/', '\\'
- Descrittivo del lavoro (es: "SistemazioneBagno", "InstallazioneCaldaiaCondominio", "ImpiantoSolareCompleto")
- Italiano
- Restituisci ESCLUSIVAMENTE un JSON: {"descrizione":"...","alternativeMatching":["...","...","..."]}`;

/**
 * Propone un nome cartella commessa via Claude Haiku.
 * Output editabile dal capo prima della conferma (vedi Tassonomia §2.1).
 */
export async function proposeFolderName(input: NamingInput): Promise<NamingProposal> {
  const userPrompt = [
    `Cliente: ${input.ragioneSociale}`,
    input.indirizzo ? `Indirizzo: ${input.indirizzo}` : null,
    input.voci?.length ? `Voci selezionate: ${input.voci.join(', ')}` : null,
    input.note ? `Note sopralluogo: ${input.note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await client().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  let parsed: { descrizione: string; alternativeMatching?: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: prendi la prima riga sensata
    parsed = { descrizione: sanitize(text.split('\n')[0] ?? 'Commessa') };
  }

  return {
    descrizione: sanitize(parsed.descrizione),
    alternativeMatching: (parsed.alternativeMatching ?? []).map(sanitize),
    raw: text,
  };
}

export function sanitize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accenti
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 30);
}
