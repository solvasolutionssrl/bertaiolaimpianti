import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';

/**
 * Evento di audit scritto da un **super admin di piattaforma**.
 *
 * Gemello di `auditTenant` (`_actions/_lib/audit.ts`), che serve alle mutazioni
 * fatte da dentro un tenant. Qui l'attore non appartiene a nessun cliente: si
 * conserva la sua email in `metadata.actor_email` e si marca `platform: true`,
 * che e' il filtro con cui `/admin/audit` separa le due cose.
 *
 * Best-effort come l'altro: un audit che fallisce non deve far fallire
 * l'operazione — ma a differenza dell'altro qui l'errore non si nasconde in
 * silenzio se la riga e' importante, perche' queste sono operazioni rare e
 * pesanti (accendere un modulo, aprire le scritture su un ERP).
 */
export async function auditPlatform(opts: {
  actorUserId: string;
  actorEmail: string;
  tenantId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    const { error } = await supabase.from('audit_events').insert({
      tenant_id: opts.tenantId,
      actor_user_id: opts.actorUserId,
      // L'enum `actor_role` non ha 'platform_admin': si usa 'admin' e la
      // distinzione vera sta in `metadata.platform`.
      actor_role: 'admin',
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      action: opts.action,
      before_data: opts.before ?? null,
      after_data: opts.after ?? null,
      metadata: {
        ...(opts.metadata ?? {}),
        platform: true,
        actor_email: opts.actorEmail,
      } as Record<string, unknown>,
    } as never);
    // ⚠️ supabase-js NON solleva: un insert rifiutato torna qui dentro, e per
    // questo il try/catch da solo non bastava. Un vincolo violato (è successo:
    // `tenant_id` era NOT NULL e gli eventi di piattaforma non entravano)
    // spariva senza traccia, cioè esattamente la cosa che questo helper
    // dovrebbe impedire. Resta best-effort — non si fa fallire l'operazione —
    // ma smette di essere muto.
    if (error) {
      console.error(
        `[auditPlatform] evento "${opts.action}" NON registrato: ${error.message}`,
      );
    }
  } catch (e) {
    console.error(
      `[auditPlatform] evento "${opts.action}" NON registrato: ${e instanceof Error ? e.message : 'errore sconosciuto'}`,
    );
  }
}
