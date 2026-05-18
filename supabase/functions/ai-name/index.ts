// =====================================================================
// ai-name — POST /ai-name
// Genera (via Claude Haiku 4.5) un nome cartella commessa CamelCase,
// più 2-3 alternative. Output editabile dal capo lato PWA.
//
// Spec: Tassonomia_Lavori.md §2.1 "AI naming via Claude Haiku".
//
// Auth: richiede Bearer (qualsiasi utente del tenant). Non serve service role.
// =====================================================================

import { corsHeaders, errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { resolveJwtContext, userClient } from '../_shared/supabase.ts';
import { callHaiku, textOf } from '../_shared/anthropic.ts';
import { sanitizeFolderSegment } from '../_shared/sanitize.ts';

interface AiNameRequest {
  ragioneSociale: string;
  indirizzo?: string;
  voci?: number[]; // id voci_catalogo (1..38) — opzionale per arricchire il prompt
  note?: string;
}

interface AiNameResponse {
  proposta: string;
  alternatives: string[];
  raw: string;
}

const SYSTEM = `Sei un assistente che genera nomi brevi per cartelle di commessa di un'azienda termoidraulica italiana.
Vincoli inderogabili:
- 1 a 4 parole in CamelCase, massimo 30 caratteri totali
- Niente accenti, niente spazi, niente '/', niente '\\'
- Descrittivo del lavoro (es: "SistemazioneBagno", "InstallazioneCaldaiaCondominio", "ImpiantoSolareCompleto", "ManutenzioneVMC")
- Lingua italiana
- Restituisci ESCLUSIVAMENTE un JSON valido nella forma:
  {"descrizione":"...","alternativeMatching":["...","...","..."]}
- "alternativeMatching" deve contenere 2-3 varianti diverse fra loro.`;

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }

  // Auth: utente loggato (capo, office, admin, owner). Non controlliamo
  // il ruolo qui: la decisione del nome è in mano al capo, ma la API è
  // disponibile a tutto il tenant per supportare il drafting da web.
  let ctx;
  try {
    const sb = userClient(req.headers.get('Authorization'));
    ctx = await resolveJwtContext(sb);
  } catch (e) {
    return errorResponse(401, 'Missing or invalid Authorization');
  }
  if (!ctx) return errorResponse(401, 'Unauthenticated');

  let body: AiNameRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }
  if (!body.ragioneSociale || typeof body.ragioneSociale !== 'string') {
    return errorResponse(400, 'ragioneSociale required');
  }

  // Risolvi i nomi delle voci (se passate) per arricchire il prompt.
  let vociNomi: string[] = [];
  if (body.voci?.length) {
    try {
      const sb = userClient(req.headers.get('Authorization'));
      const { data, error } = await sb
        .from('voci_catalogo')
        .select('id,nome')
        .in('id', body.voci);
      if (!error && data) vociNomi = data.map((v: { nome: string }) => v.nome);
    } catch (e) {
      console.error('[ai-name] voci lookup failed', e);
    }
  }

  const userPrompt = [
    `Cliente: ${body.ragioneSociale}`,
    body.indirizzo ? `Indirizzo cantiere: ${body.indirizzo}` : null,
    vociNomi.length ? `Voci selezionate: ${vociNomi.join(', ')}` : null,
    body.note ? `Note sopralluogo: ${body.note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  let raw = '';
  try {
    const res = await callHaiku({
      max_tokens: 200,
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    raw = textOf(res);
  } catch (e) {
    console.error('[ai-name] Anthropic call failed', e);
    return errorResponse(502, 'AI naming failed', String(e));
  }

  let parsed: { descrizione?: string; alternativeMatching?: string[] };
  try {
    // Robustezza: estrai il primo blocco { ... } se Claude antepone testo.
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    parsed = { descrizione: raw.split('\n')[0] ?? 'Commessa' };
  }

  const proposta = sanitizeFolderSegment(parsed.descrizione ?? 'Commessa') || 'Commessa';
  const alternatives = (parsed.alternativeMatching ?? [])
    .map((s) => sanitizeFolderSegment(s))
    .filter((s, i, arr) => s && s !== proposta && arr.indexOf(s) === i)
    .slice(0, 3);

  const out: AiNameResponse = { proposta, alternatives, raw };
  return jsonResponse(out, { headers: corsHeaders });
});
