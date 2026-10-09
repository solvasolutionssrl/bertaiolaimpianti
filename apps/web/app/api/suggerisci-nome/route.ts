import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { tagliaAParolaIntera } from '@kommessa/api/testo';

import { MAX_DESCRIZIONE_COMMESSA } from '../../_actions/crea-commessa.schemas';
import { suggerisciDescrizione } from '../../_lib/suggerisci-nome';
import {
  chatCompletion,
  getChatModel,
  isOpenAIConfigured,
  isAiUnavailable,
  OpenAiError,
} from '../../_lib/openai';
import { segnalaAiNonDisponibile } from '../../_lib/ai-alert';

/**
 * POST /api/suggerisci-nome
 * Body: { voci?: number[], cliente?: string, note?: string }
 * Returns: { proposta: string, alternatives: string[] }
 *
 * Strategia:
 *  1. Se OPENAI_API_KEY è configurata → genera con `gpt-5-mini`, prompt
 *     che include lista voci catalogo + cliente + note, output JSON.
 *  2. Se la chiave manca o la chiamata fallisce → fallback locale
 *     deterministico (`suggerisciDescrizione` in _lib/suggerisci-nome.ts).
 *
 * Bounded cost: max 150 token output, response_format JSON.
 */
const inputSchema = z.object({
  voci: z.array(z.number().int()).optional(),
  cliente: z.string().optional(),
  note: z.string().optional(),
});

/**
 * ⚠️ Il tetto e' 60 come `creaCommessa`, non 30 come quando questa rotta
 * proponeva un nome di cartella: ora propone la **descrizione** della
 * commessa, cioe' una frase che una persona legge.
 */
const outputSchema = z.object({
  proposta: z.string().trim().min(1).max(MAX_DESCRIZIONE_COMMESSA),
  alternatives: z.array(z.string().trim().min(1).max(MAX_DESCRIZIONE_COMMESSA)).max(5),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEW_SHOT = `ESEMPI:

Voci selezionate: [19, 13, 31]
Cliente: Rossi Mario
Note: sostituzione caldaia + due bagni nuovi
{
  "proposta": "Caldaia e due bagni nuovi",
  "alternatives": ["Sostituzione caldaia", "Rifacimento bagni", "Caldaia e sanitari"]
}

Voci selezionate: [18]
Cliente: Bianchi Lucia
Note: fotovoltaico 6 kW con accumulo
{
  "proposta": "Fotovoltaico 6 kW con accumulo",
  "alternatives": ["Impianto fotovoltaico", "Fotovoltaico con accumulo", "Fotovoltaico"]
}

Voci selezionate: [30, 32]
Cliente: Edilizia Tre Srl
Note: duplex nuovo, pavimento radiante + centrale termica
{
  "proposta": "Pavimento radiante e centrale termica",
  "alternatives": ["Pavimento radiante", "Centrale termica", "Impianti duplex nuovo"]
}`;

export async function POST(req: Request) {
  // Solo utenti autenticati: l'endpoint chiama l'AI (costo) ed è interno
  // ai flussi office. Senza questo, un estraneo potrebbe abusarne da fuori.
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(' · ') },
      { status: 400 },
    );
  }

  // Fallback locale immediato se OpenAI non è configurato.
  if (!isOpenAIConfigured()) {
    const out = suggerisciDescrizione(parsed.data);
    return NextResponse.json(out, { status: 200 });
  }

  // Carica catalogo voci per arricchire il prompt (id → nome).
  let vociCatalogo: Array<{ id: number; nome: string }> = [];
  try {
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from('voci_catalogo')
      .select('id, nome')
      .order('ordine_visualizzazione');
    vociCatalogo = (data ?? []).map((v: any) => ({
      id: v.id as number,
      nome: v.nome as string,
    }));
  } catch {
    // Senza catalogo, l'LLM può comunque produrre un nome generico dal cliente/note.
  }

  const vociSelezionate = parsed.data.voci ?? [];
  const vociConNome = vociSelezionate
    .map((id) => {
      const v = vociCatalogo.find((x) => x.id === id);
      return v ? `${id}=${v.nome}` : `${id}`;
    })
    .join(', ');

  const system = [
    'Sei un assistente che propone la descrizione di una commessa termoidraulica/elettrica.',
    '',
    'REGOLE:',
    '- Output: JSON con `proposta` (1 stringa) e `alternatives` (array di esattamente 3 stringhe diverse).',
    '- Lingua italiana.',
    `- Ogni descrizione: una frase breve CON GLI SPAZI, 2-6 parole, max ${MAX_DESCRIZIONE_COMMESSA} caratteri.`,
    '- Maiuscola solo alla prima parola, come un titolo. Niente CamelCase, niente ParoleAttaccate.',
    '- Niente slash, niente a capo, niente virgolette.',
    '- Sintetico, descrittivo, leggibile da un capo cantiere.',
    '- Non inventare cliente, non usare il nome del cliente nella proposta (verrà aggiunto come prefisso a parte).',
    '- Se le voci sono poche/generiche, ricorri a parole significative dalle note.',
    '- Restituisci ESCLUSIVAMENTE JSON valido, niente testo prima/dopo, niente code fence.',
    '',
    FEW_SHOT,
  ].join('\n');

  const user = [
    'Genera il JSON per questa commessa:',
    '',
    vociSelezionate.length > 0
      ? `Voci selezionate (id=nome): ${vociConNome}`
      : 'Voci selezionate: (nessuna)',
    parsed.data.cliente ? `Cliente: ${parsed.data.cliente}` : 'Cliente: (n/d)',
    parsed.data.note ? `Note: ${parsed.data.note}` : 'Note: (vuote)',
  ].join('\n');

  try {
    // Nota su max_tokens: i modelli "reasoning" (gpt-5-mini) consumano
    // token interni di reasoning PRIMA di emettere il JSON. Sotto i ~600
    // token tipicamente l'output è troncato a stringa vuota. Teniamo 800
    // come compromesso costo/affidabilità (qualche centesimo a chiamata).
    const completion = await chatCompletion({
      model: getChatModel(),
      maxTokens: 800,
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

    const rawJson = JSON.parse(cleaned) as unknown;
    const validated = outputSchema.safeParse(rawJson);
    if (!validated.success) {
      // LLM ha risposto male → fallback
      const out = suggerisciDescrizione(parsed.data);
      return NextResponse.json(out, { status: 200 });
    }

    // Pulizia finale, best-effort: gli spazi RESTANO — è una frase, non un
    // nome di cartella. Si tolgono solo le cose che in un titolo non ci
    // stanno (a capo, slash, virgolette) e si comprimono gli spazi doppi.
    // ⚠️ Accenti e punteggiatura NON si toccano: a toglierli ci pensa
    // `segmentoDescrizione` quando deriva il nome cartella, e qui servono
    // per scrivere «città» come si scrive.
    const pulisci = (s: string): string =>
      tagliaAParolaIntera(
        s
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/["'`\\/|]+/g, ''),
        MAX_DESCRIZIONE_COMMESSA,
      );

    const proposta = pulisci(validated.data.proposta);
    const alternatives = Array.from(
      new Set(
        validated.data.alternatives
          .map(pulisci)
          .filter((a) => a.length >= 3 && a !== proposta),
      ),
    ).slice(0, 3);

    if (proposta.length < 3) {
      const out = suggerisciDescrizione(parsed.data);
      return NextResponse.json(out, { status: 200 });
    }

    return NextResponse.json({ proposta, alternatives }, { status: 200 });
  } catch (err) {
    // Network/SDK error → fallback locale, niente crash al client (l'utente
    // ottiene comunque un nome). Se l'AI è non disponibile (crediti/quota/down)
    // avvisa il super admin: l'utente non se ne accorge ma è critico saperlo.
    console.error('[suggerisci-nome] OpenAI error, falling back:', err);
    if (isAiUnavailable(err)) {
      await segnalaAiNonDisponibile({
        tenantId: ctx.tenantId,
        feature: 'suggerisci_nome',
        model: getChatModel(),
        status: err instanceof OpenAiError ? err.status ?? null : null,
        detail: err instanceof Error ? err.message : null,
      });
    }
    const out = suggerisciDescrizione(parsed.data);
    return NextResponse.json(out, { status: 200 });
  }
}
