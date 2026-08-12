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
    await supabase.from('audit_events').insert({
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
  } catch {
    // best-effort
  }
}
