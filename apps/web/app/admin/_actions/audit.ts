'use server';

import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../_lib/guard';

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
} | { ok: false; error: string }> {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();

  let q = supabase
    .from('audit_events')
    .select('id, created_at, tenant_id, actor_user_id, actor_role, entity_type, entity_id, action, metadata')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 5000);

  if (filters.tenantId) q = q.eq('tenant_id', filters.tenantId);
  if (filters.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters.action) q = q.eq('action', filters.action);
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

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
  for (const r of data ?? []) {
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
  };
}
