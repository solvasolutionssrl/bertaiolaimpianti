import 'server-only';
import { cache } from 'react';
import { createServerSupabase } from '@kommessa/api/server';
import {
  isModuleActive,
  type ModuleCode,
  type TenantModuleRow,
} from '@kommessa/api/modules';
import { requireTenantContextCached } from './tenant-cache';

/**
 * Righe `tenant_modules` del tenant corrente, deduplicate per request
 * (React.cache). Letto via RLS (admin/office) — sufficiente per il gating
 * nei layout/route, che girano per utenti autenticati del tenant.
 */
export const getTenantModulesCached = cache(
  async (): Promise<TenantModuleRow[]> => {
    const ctx = await requireTenantContextCached();
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from('tenant_modules' as never)
      .select('module_code, attivo')
      .eq('tenant_id', ctx.tenantId);
    return (data ?? []) as unknown as TenantModuleRow[];
  },
);

/** True se il modulo è attivo per il tenant corrente. `base` sempre true. */
export async function tenantHasModule(code: ModuleCode): Promise<boolean> {
  if (code === 'base') return true;
  const rows = await getTenantModulesCached();
  return isModuleActive(rows, code);
}
