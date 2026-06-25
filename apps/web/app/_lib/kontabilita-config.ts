import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

/**
 * Kontabilità è attiva per il tenant? Vive nel config del modulo kantiere.
 * Default true: i tenant kantiere hanno Kontabilità salvo opt-out esplicito
 * (`kontabilita_attiva: false`) impostato dal super admin.
 */
export async function kontabilitaAttiva(supabase: Supa, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return config['kontabilita_attiva'] !== false;
}
