// =====================================================================
// _shared/cors.ts — header CORS condivisi per tutte le Edge Functions.
// Le Edge sono chiamate da:
//  - app web (Next.js) su Vercel → preview e produzione
//  - PWA tecnici (stesso dominio della web, ma in dev può essere diverso)
//  - portale cliente
// In sviluppo manteniamo `*`; in produzione il gateway Supabase aggiunge
// già un layer di auth, quindi `*` è accettabile.
// =====================================================================

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-resend-signature, x-webhook-signature',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Restituisce una Response pronta per OPTIONS / preflight. */
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** Helper per risposte JSON con CORS. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

/** Helper per errori uniformi: `{ error: string, details?: unknown }`. */
export function errorResponse(status: number, error: string, details?: unknown): Response {
  return jsonResponse({ error, details }, { status });
}
