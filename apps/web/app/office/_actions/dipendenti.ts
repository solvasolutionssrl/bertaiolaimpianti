'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { prossimoCodiceDipendente } from '@kommessa/api/kantiere';

const BaseSchema = z.object({
  nome: z.string().min(1).max(80),
  cognome: z.string().min(1).max(80),
  mansione: z.string().max(120).optional().nullable(),
  codice_interno: z.string().max(60).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  stato_attivo: z.boolean().optional(),
  a_turni: z.boolean().optional(),
  costo_orario: z.number().min(0).max(10000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

type Result = { ok: true; id?: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere'))) throw new Error('MODULO_OFF');
  return ctx;
}

export async function creaDipendente(input: unknown): Promise<Result> {
  const parsed = BaseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();

  let codice = parsed.data.codice_interno?.trim() || null;
  if (!codice) {
    const { data: esistenti } = await supabase
      .from('dipendenti' as never)
      .select('codice_interno')
      .eq('tenant_id', ctx.tenantId);
    const codici = ((esistenti ?? []) as { codice_interno: string | null }[]).map((r) => r.codice_interno);
    codice = prossimoCodiceDipendente(codici);
  }

  const { data, error } = await supabase
    .from('dipendenti' as never)
    .insert({
      tenant_id: ctx.tenantId,
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      mansione: parsed.data.mansione ?? null,
      codice_interno: codice,
      user_id: parsed.data.user_id ?? null,
      stato_attivo: parsed.data.stato_attivo ?? true,
      a_turni: parsed.data.a_turni ?? false,
      costo_orario: parsed.data.costo_orario ?? null,
      note: parsed.data.note ?? null,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, id: (data as { id: string }).id };
}

export async function aggiornaDipendente(input: unknown): Promise<Result> {
  const schema = BaseSchema.extend({ id: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  await guard();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('dipendenti' as never)
    .update({
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      mansione: parsed.data.mansione ?? null,
      codice_interno: parsed.data.codice_interno ?? null,
      user_id: parsed.data.user_id ?? null,
      stato_attivo: parsed.data.stato_attivo ?? true,
      a_turni: parsed.data.a_turni ?? false,
      costo_orario: parsed.data.costo_orario ?? null,
      note: parsed.data.note ?? null,
    } as never)
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath(`/office/kantiere/dipendenti/${parsed.data.id}`);
  return { ok: true };
}

export async function eliminaDipendente(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  await guard();
  const supabase = createServerSupabase();
  const { count } = await supabase
    .from('commessa_squadra' as never)
    .select('dipendente_id', { count: 'exact', head: true })
    .eq('dipendente_id', parsed.data.id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Dipendente assegnato a ${count} commesse: rimuovilo dalle squadre prima.` };
  }
  const { error } = await supabase.from('dipendenti' as never).delete().eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true };
}
