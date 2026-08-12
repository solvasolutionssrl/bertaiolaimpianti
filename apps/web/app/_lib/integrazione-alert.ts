import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Avvisa il SUPER ADMIN che il collegamento col gestionale di un cliente e'
 * in avaria.
 *
 * Gemello di `segnalaAiNonDisponibile` (`_lib/ai-alert.ts`) e stessa filosofia:
 * due canali, entrambi best-effort — un log durevole su `audit_events` (che fa
 * anche da registro per la deduplica) e una mail, **una sola per finestra**.
 *
 * Qui la finestra e' larga (12 ore, non 30 minuti): un agente fermo resta fermo
 * per ore, e una mail ogni giro di cron sarebbe rumore. La deduplica e'
 * **per cliente**, non globale: due clienti rotti lo stesso giorno sono due
 * problemi diversi e vanno detti entrambi.
 *
 * Il cliente non vede niente: e' un problema di piattaforma, e spesso di una
 * macchina che non e' nostra.
 */

const FINESTRA_DEDUP_ORE = 12;
const AZIONE = 'platform.integrazione_in_avaria';

export async function segnalaCollegamentoInAvaria(opts: {
  tenantId: string;
  tenant: string;
  sistema: string | null;
  silenzioOre: number | null;
  motivi: string[];
}): Promise<void> {
  try {
    const svc = createServiceSupabase();
    const da = new Date(Date.now() - FINESTRA_DEDUP_ORE * 3_600_000).toISOString();

    const { data: recenti } = await svc
      .from('audit_events')
      .select('id')
      .eq('action', AZIONE)
      .eq('tenant_id', opts.tenantId)
      .gte('created_at', da)
      .limit(1);
    const giaSegnalato = Array.isArray(recenti) && recenti.length > 0;

    await svc.from('audit_events').insert({
      tenant_id: opts.tenantId,
      actor_user_id: null,
      actor_role: null,
      entity_type: 'platform',
      entity_id: 'integrazione',
      action: AZIONE,
      metadata: {
        platform: true,
        sistema: opts.sistema,
        silenzio_ore: opts.silenzioOre,
        motivi: opts.motivi.slice(0, 5),
        mail_inviata: !giaSegnalato,
      },
    } as never);

    if (giaSegnalato) return;
    await inviaMail(svc, opts);
  } catch {
    // best-effort: un avviso che fallisce non deve far fallire il cron
  }
}

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
    const out: string[] = [];
    for (const u of ((data as { id: string }[] | null) ?? [])) {
      const r = await svc.auth.admin.getUserById(u.id);
      const email = r.data.user?.email;
      if (email) out.push(email);
    }
    return out;
  } catch {
    return [];
  }
}

async function inviaMail(
  svc: ReturnType<typeof createServiceSupabase>,
  opts: {
    tenantId: string;
    tenant: string;
    sistema: string | null;
    silenzioOre: number | null;
    motivi: string[];
  },
): Promise<void> {
  const from = process.env.RESEND_FROM?.trim();
  if (!process.env.RESEND_API_KEY || !from) return; // resta il log
  const to = await destinatari(svc);
  if (to.length === 0) return;

  const { sendEmail } = await import('@kommessa/integrations/email');
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';

  await sendEmail({
    from,
    to,
    subject: `⚠️ Kommessa — collegamento ${opts.tenant} in avaria`,
    text: [
      `Il collegamento di ${opts.tenant}${opts.sistema ? ` verso ${opts.sistema}` : ''} non sta funzionando.`,
      '',
      ...opts.motivi.map((m) => `· ${m}`),
      '',
      opts.silenzioOre !== null
        ? `Ultimo contatto: ${opts.silenzioOre} ore fa.`
        : 'Nessun contatto registrato.',
      '',
      'Questo cliente è in modalità ATTIVA: le sue ore e spese dovrebbero arrivare',
      'sul gestionale, e in questo momento non ci arrivano.',
      '',
      base ? `Dettaglio: ${base}/admin/tenants/${opts.tenantId}?tab=integrazione` : null,
      '',
      `(Questo avviso si ripete al massimo una volta ogni ${FINESTRA_DEDUP_ORE} ore per cliente.)`,
    ]
      // Solo le righe opzionali sono `null`: le stringhe vuote sono a-capo voluti.
      .filter((r): r is string => r !== null)
      .join('\n'),
  });
}
