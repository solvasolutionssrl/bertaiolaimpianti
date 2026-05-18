import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';

import { suggerisciDescrizione } from '../../_lib/suggerisci-nome';
import {
  chatCompletion,
  getChatModel,
  isOpenAIConfigured,
} from '../../_lib/openai';

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

const outputSchema = z.object({
  proposta: z.string().trim().min(1).max(30),
  alternatives: z.array(z.string().trim().min(1).max(30)).max(5),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEW_SHOT = `ESEMPI:

Voci selezionate: [19, 13, 31]
Cliente: Rossi Mario
Note: sostituzione caldaia + due bagni nuovi
{
  "proposta": "CaldaiaEDueBagni",
  "alternatives": ["InstallazioneCaldaia", "SistemazioneBagno", "RifacimentoBagni"]
}

Voci selezionate: [18]
Cliente: Bianchi Lucia
Note: fotovoltaico 6 kW con accumulo
{
  "proposta": "Fotovoltaico6kW",
  "alternatives": ["ImpiantoFotovoltaico", "FotovoltaicoAccumulo", "Fotovoltaico"]
}

Voci selezionate: [30, 32]
Cliente: Edilizia Tre Srl
Note: duplex nuovo, pavimento radiante + centrale termica
{
  "proposta": "RadianteECentrale",
  "alternatives": ["PavimentoRadiante", "CentraleTermica", "ImpiantoNuovo"]
}`;

export async function POST(req: Request) {
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
    'Sei un assistente che propone nomi cartella CamelCase per commesse termoidrauliche/elettriche.',
    '',
    'REGOLE:',
    '- Output: JSON con `proposta` (1 stringa) e `alternatives` (array di esattamente 3 stringhe diverse).',
    '- Lingua italiana.',
    '- Ogni nome: 1-4 parole CamelCase, max 30 caratteri totali, SOLO lettere/cifre (no spazi, no accenti, no slash, no trattini, no underscore).',
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

    // Sanitize finale: la regola CamelCase è hard, applichiamola anche
    // sull'output LLM (best-effort; rimuove caratteri non alfanumerici
    // che il modello potrebbe aver inserito malgrado le istruzioni).
    const sanitize = (s: string): string =>
      s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 30);

    const proposta = sanitize(validated.data.proposta);
    const alternatives = Array.from(
      new Set(
        validated.data.alternatives
          .map(sanitize)
          .filter((a) => a.length >= 3 && a !== proposta),
      ),
    ).slice(0, 3);

    if (proposta.length < 3) {
      const out = suggerisciDescrizione(parsed.data);
      return NextResponse.json(out, { status: 200 });
    }

    return NextResponse.json({ proposta, alternatives }, { status: 200 });
  } catch (err) {
    // Network/SDK error → fallback locale, niente crash al client.
    console.error('[suggerisci-nome] OpenAI error, falling back:', err);
    const out = suggerisciDescrizione(parsed.data);
    return NextResponse.json(out, { status: 200 });
  }
}
