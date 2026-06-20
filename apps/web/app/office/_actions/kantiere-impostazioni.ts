'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';

type Result = { ok: true } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

const anomalieSchema = z.object({
  incomplete: z.boolean(),
  straordinari: z.boolean(),
  senza_rapportino: z.boolean(),
  modificato: z.boolean(),
  festivo: z.boolean(),
  weekend: z.boolean(),
  ore_eccessive: z.boolean(),
});

const schema = z.object({
  sogliaOreOrdinarie: z.number().min(1).max(24),
  sedePartenzaDefault: z.string().max(300).optional(),
  anomalie: anomalieSchema.optional(),
  anomalie_ore_max: z.number().min(1).max(24).optional(),
});

export async function salvaImpostazioniKantiere(input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }

  const ctx = await guard();
  const supabase = createServiceSupabase();

  // Leggi riga corrente per fare un merge non distruttivo del config
  const { data: row, error: fetchError } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (!row) return { ok: false, error: 'MODULO_NON_TROVATO' };

  const existingConfig = ((row as { config: Record<string, unknown> | null }).config) ?? {};
  const newConfig: Record<string, unknown> = {
    ...existingConfig,
    soglia_ore_ordinarie: parsed.data.sogliaOreOrdinarie,
    sede_partenza_default: parsed.data.sedePartenzaDefault?.trim() || null,
  };
  if (parsed.data.anomalie !== undefined) {
    newConfig['anomalie'] = parsed.data.anomalie;
  }
  if (parsed.data.anomalie_ore_max !== undefined) {
    newConfig['anomalie_ore_max'] = parsed.data.anomalie_ore_max;
  }

  const { error: updateError } = await supabase
    .from('tenant_modules' as never)
    .update({ config: newConfig } as never)
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere');

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath('/office/kantiere/impostazioni');
  return { ok: true };
}
