import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

export type ArrotondamentiKantiere = {
  /** Step (min) per l'arrotondamento del TEMPO DI VIAGGIO. Default 5. */
  viaggioMin: number;
  /** Step (min) per l'arrotondamento delle ORE LAVORO. Default 0 = nessuno
   *  (si raccoglie tutto a dettaglio massimo, si arrotonda nel report). */
  oreMin: number;
};

function toInt(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return def;
}

/** Legge gli step di arrotondamento dal config del modulo kantiere del tenant. */
export async function leggiArrotondamenti(
  supabase: Supa,
  tenantId: string,
): Promise<ArrotondamentiKantiere> {
  const { data } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const config = (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
  return {
    viaggioMin: toInt(config['arrotondamento_viaggio_min'], 5),
    oreMin: toInt(config['arrotondamento_ore_min'], 0),
  };
}
