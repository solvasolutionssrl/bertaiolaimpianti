import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import type { AppRole } from '@kommessa/api';

type Supa = ReturnType<typeof createServerSupabase>;

/**
 * Scrive un evento di audit lato tenant su `public.audit_events` — la stessa
 * tabella strutturata (chi/cosa/quando/tenant/prima/dopo) visibile dal super
 * admin in `/admin/audit` e nella tab Audit del tenant.
 *
 * È lo specchio, lato-tenant, dell'helper `auditPlatform` usato dal super admin.
 * Nasce per dare traccia alle mutazioni del dominio **Kantiere** (sedi, cantieri,
 * impostazioni, spese) che prima non lasciavano alcun log.
 *
 * **Best-effort**: qualsiasi errore (colonna mancante, enum, rete) viene
 * ignorato — l'audit non deve MAI bloccare l'azione dell'utente.
 */
export async function auditTenant(
  supabase: Supa,
  opts: {
    tenantId: string;
    actorUserId: string;
    actorRole: AppRole;
    /** Tipo entità: es. `sede`, `cantiere`, `spesa`, `tenant_module`. */
    entityType: string;
    entityId?: string | null;
    /** Azione puntata: es. `sede.crea`, `cantiere.elimina`, `kantiere.impostazioni.update`. */
    action: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from('audit_events').insert({
      tenant_id: opts.tenantId,
      actor_user_id: opts.actorUserId,
      actor_role: opts.actorRole,
      entity_type: opts.entityType,
      entity_id: opts.entityId ?? null,
      action: opts.action,
      before_data: opts.before !== undefined ? (opts.before as never) : null,
      after_data: opts.after !== undefined ? (opts.after as never) : null,
      metadata: (opts.metadata ?? {}) as unknown as never,
    } as never);
  } catch {
    // audit best-effort: mai bloccante
  }
}
