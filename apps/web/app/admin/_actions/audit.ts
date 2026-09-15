'use server';

import { createServiceSupabase } from '@kommessa/api/service';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';
import { requirePlatformAdmin } from '../_lib/guard';

/** Una pagina di righe da `leggiTutto`: il builder di supabase-js tipizzato a mano. */
type Pagina<T> = PromiseLike<EsitoPagina<T>>;

/** Righe massime di un export audit: oltre, si restringono i filtri. */
const MASSIMO_RIGHE_EXPORT = 50_000;

interface RigaAudit {
  id: string;
  created_at: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: unknown;
}

export interface AuditFilters {
  tenantId?: string | null;
  entityType?: string | null;
  action?: string | null;
  actorEmail?: string | null;
  from?: string | null; // ISO date
  to?: string | null;
  limit?: number;
}

/**
 * Esporta gli audit_events filtrati come CSV.
 * Ritorniamo la stringa CSV (il client la salva via Blob).
 */
export async function esportaAuditCSV(filters: AuditFilters): Promise<{
  ok: true;
  csv: string;
  filename: string;
  /** Righe esportate. */
  righe: number;
  /** false se l'export si è fermato al limite richiesto (ci possono essere altre righe). */
  completo: boolean;
} | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  // Il database restituisce al massimo 1000 righe per richiesta: senza pagine un
  // export "fino a 5000" ne conteneva 1000 senza dirlo. Si legge a pagine fino
  // al limite richiesto (al massimo MASSIMO_RIGHE_EXPORT).
  const limite = Math.max(1, Math.min(Math.floor(filters.limit ?? 5000), MASSIMO_RIGHE_EXPORT));
  let data: RigaAudit[];
  try {
    data = await leggiTutto<RigaAudit>(
      (da, a) => {
        if (da >= limite) return Promise.resolve({ data: [], error: null });
        let q = supabase
          .from('audit_events')
          .select('id, created_at, tenant_id, actor_user_id, actor_role, entity_type, entity_id, action, metadata');
        if (filters.tenantId) q = q.eq('tenant_id', filters.tenantId);
        if (filters.entityType) q = q.eq('entity_type', filters.entityType);
        if (filters.action) q = q.eq('action', filters.action);
        if (filters.from) q = q.gte('created_at', filters.from);
        if (filters.to) q = q.lte('created_at', filters.to);
        return q
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(da, Math.min(a, limite - 1)) as unknown as Pagina<RigaAudit>;
      },
      { contesto: 'export audit', massimoRighe: MASSIMO_RIGHE_EXPORT + 1000 },
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lettura audit non riuscita' };
  }

  const head = [
    'id',
    'created_at',
    'tenant_id',
    'actor_user_id',
    'actor_role',
    'entity_type',
    'entity_id',
    'action',
    'platform',
    'actor_email',
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const needsQuote = s.includes(',') || s.includes('"') || s.includes('\n');
    const escaped = s.replace(/"/g, '""');
    return needsQuote ? `"${escaped}"` : escaped;
  };
  const rows = [head.join(',')];
  for (const r of data) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    rows.push(
      [
        r.id,
        r.created_at,
        r.tenant_id,
        r.actor_user_id,
        r.actor_role,
        r.entity_type,
        r.entity_id,
        r.action,
        meta.platform ? 'true' : 'false',
        meta.actor_email,
      ]
        .map(escape)
        .join(','),
    );
  }
  return {
    ok: true,
    csv: rows.join('\n'),
    filename: `audit_${new Date().toISOString().slice(0, 10)}.csv`,
    righe: data.length,
    completo: data.length < limite,
  };
}
