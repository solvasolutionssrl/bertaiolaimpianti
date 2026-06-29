import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Segnala al SUPER ADMIN che le funzioni AI (OpenAI) non sono disponibili
 * (es. crediti esauriti / 429 insufficient_quota, chiave non valida, OpenAI
 * down). È un evento CRITICO: l'AI alimenta scan ricevute, dettatura, copilot.
 *
 * Due canali, entrambi BEST-EFFORT (non devono mai rompere il flusso utente):
 *  1) log durevole su `audit_events` (action `platform.ai_unavailable`) — fa
 *     anche da registro per la deduplica;
 *  2) email al super admin, **una sola** per finestra di 30 min (così un'ondata
 *     di scansioni fallite non genera decine di mail).
 *
 * L'utente finale NON deve vedere il motivo reale: i chiamanti restituiscono un
 * messaggio generico ("AI non disponibile, riprova più tardi").
 */

const FINESTRA_DEDUP_MIN = 30;

export async function segnalaAiNonDisponibile(opts: {
  tenantId: string;
  feature: string; // es. 'spese_scan', 'dettatura', 'copilot'
  model?: string | null;
  status?: number | null;
  detail?: string | null;
}): Promise<void> {
  try {
    const svc = createServiceSupabase();
    const sinceIso = new Date(Date.now() - FINESTRA_DEDUP_MIN * 60_000).toISOString();

    // Già segnalato di recente? (la mail parte solo alla prima occorrenza della finestra)
    const { data: recenti } = await svc
      .from('audit_events')
      .select('id')
      .eq('action', 'platform.ai_unavailable')
      .gte('created_at', sinceIso)
      .limit(1);
    const giaSegnalato = Array.isArray(recenti) && recenti.length > 0;

    // Log durevole (sempre).
    await svc.from('audit_events').insert({
      tenant_id: opts.tenantId,
      actor_user_id: null,
      actor_role: null,
      entity_type: 'platform',
      entity_id: 'ai',
      action: 'platform.ai_unavailable',
      metadata: {
        platform: true,
        feature: opts.feature,
        model: opts.model ?? null,
        status: opts.status ?? null,
        detail: (opts.detail ?? '').slice(0, 300),
      },
    } as never);

    if (giaSegnalato) return; // mail già inviata nella finestra
    await inviaMailAllarme(svc, opts);
  } catch {
    // best-effort: l'alert non deve mai propagare un errore al chiamante
  }
}

/** Risolve i destinatari: env PLATFORM_ALERT_EMAIL, altrimenti le email dei platform admin. */
async function destinatari(svc: ReturnType<typeof createServiceSupabase>): Promise<string[]> {
  const env = process.env.PLATFORM_ALERT_EMAIL?.trim();
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  try {
    const { data } = await svc
      .from('users')
      .select('id')
      .eq('is_platform_admin', true)
      .eq('attivo', true)
      .limit(5);
    const ids = ((data as { id: string }[] | null) ?? []).map((u) => u.id);
    const out: string[] = [];
    for (const id of ids) {
      const r = await svc.auth.admin.getUserById(id);
      const email = r.data.user?.email;
      if (email) out.push(email);
    }
    return out;
  } catch {
    return [];
  }
}

async function inviaMailAllarme(
  svc: ReturnType<typeof createServiceSupabase>,
  opts: { tenantId: string; feature: string; model?: string | null; status?: number | null; detail?: string | null },
): Promise<void> {
  const from = process.env.RESEND_FROM?.trim();
  if (!process.env.RESEND_API_KEY || !from) return; // email non configurata → resta solo il log
  const to = await destinatari(svc);
  if (to.length === 0) return;

  // import dinamico: non appesantire i moduli che importano l'helper
  const { sendEmail } = await import('@kommessa/integrations/email');
  const motivo =
    opts.status === 429
      ? 'crediti esauriti o rate limit (429 insufficient_quota)'
      : opts.status === 401 || opts.status === 403
        ? 'chiave non valida / problema di billing'
        : opts.status && opts.status >= 500
          ? `OpenAI non raggiungibile (${opts.status})`
          : 'servizio non raggiungibile';

  await sendEmail({
    from,
    to,
    subject: '⚠️ Kommessa — Funzioni AI NON disponibili',
    text: [
      'Le funzioni AI (OpenAI) non rispondono in produzione.',
      '',
      `Motivo probabile: ${motivo}.`,
      `Funzione: ${opts.feature}`,
      opts.model ? `Modello: ${opts.model}` : '',
      `Tenant: ${opts.tenantId}`,
      opts.status ? `HTTP: ${opts.status}` : '',
      '',
      'Gli utenti vedono "Funzioni AI non disponibili, riprova più tardi" (nessun dettaglio tecnico).',
      'Azione: verifica i crediti/billing OpenAI (platform.openai.com → Billing).',
      '',
      `(Questo avviso si ripete al massimo una volta ogni ${FINESTRA_DEDUP_MIN} minuti.)`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}
