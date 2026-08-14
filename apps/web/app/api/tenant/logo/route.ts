import { createServiceSupabase } from '@kommessa/api/service';
import { getTenantContext } from '@kommessa/api/tenant';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** Oltre questo non è un logo, è un errore di configurazione. */
const MAX_BYTE = 3 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/**
 * Il logo del tenant, servito dal NOSTRO dominio.
 *
 * Serve per l'export PDF: `caricaLogo` disegna l'immagine su un canvas per
 * trasformarla in PNG, e un'immagine presa da un altro dominio senza header
 * CORS **sporca il canvas** — il browser poi rifiuta di leggerlo e il PDF
 * ripiega sul solo nome scritto. È esattamente il caso di FPM, il cui logo sta
 * sul loro sito WordPress, che risponde 200 ma senza `access-control-allow-origin`.
 * Passando di qui l'immagine è same-origin e il canvas resta leggibile.
 *
 * ⚠️ **Nessun indirizzo arriva da fuori**: si serve solo il `logo_url` scritto
 * sul tenant di chi è collegato. Se accettasse un indirizzo dal chiamante
 * sarebbe un ponte per farci chiamare host interni (SSRF).
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return new Response(null, { status: 401 });

  const service = createServiceSupabase();
  const { data } = await service
    .from('tenants')
    .select('logo_url')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const url = (data as { logo_url: string | null } | null)?.logo_url ?? null;
  if (!url) return new Response(null, { status: 404 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (parsed.protocol !== 'https:') return new Response(null, { status: 404 });

  try {
    const risposta = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Il logo cambia una volta ogni mai: la cache di Next qui va benissimo.
      next: { revalidate: 3600 },
    });
    if (!risposta.ok) return new Response(null, { status: 404 });

    const tipo = risposta.headers.get('content-type') ?? '';
    if (!tipo.startsWith('image/')) return new Response(null, { status: 404 });

    const buf = await risposta.arrayBuffer();
    if (buf.byteLength > MAX_BYTE) return new Response(null, { status: 404 });

    return new Response(buf, {
      headers: {
        'content-type': tipo,
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch {
    // Sito del cliente giù, lento o indirizzo sbagliato: il PDF esce lo stesso
    // col nome scritto, che è il comportamento di prima.
    return new Response(null, { status: 404 });
  }
}
