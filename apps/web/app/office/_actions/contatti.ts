'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

/**
 * Server actions per la nuova tabella contatto_cliente (Ondata 4).
 *
 * Modello: 1 cliente → N contatti referente (nome, ruolo, telefono, email,
 * note, is_primary, ordine). Le query del codice esistente leggono ancora
 * clienti.telefoni[]/email[] (read-only legacy) finché non sono migrate.
 */

const contattoBase = z.object({
  nome: z.string().trim().min(1, 'Nome obbligatorio').max(160),
  ruolo: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  telefono: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isPrimary: z.boolean().optional().default(false),
  ordine: z.number().int().min(0).max(255).optional().default(0),
});

const creaSchema = contattoBase.extend({
  clienteId: z.string().uuid(),
});

const aggiornaSchema = contattoBase.extend({
  id: z.string().uuid(),
});

export async function creaContatto(
  input: z.infer<typeof creaSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContext();
  const parsed = creaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }
  const supabase = createServerSupabase();
  // Se questo contatto è dichiarato primary, sblocca il vecchio primary del
  // cliente prima di insert (l'indice unique parziale lo rifiuterebbe).
  if (parsed.data.isPrimary) {
    await supabase
      .from('contatto_cliente' as never)
      .update({ is_primary: false } as never)
      .eq('cliente_id', parsed.data.clienteId)
      .eq('is_primary', true);
  }
  const { data, error } = await supabase
    .from('contatto_cliente' as never)
    .insert({
      tenant_id: ctx.tenantId,
      cliente_id: parsed.data.clienteId,
      nome: parsed.data.nome,
      ruolo: parsed.data.ruolo,
      telefono: parsed.data.telefono,
      email: parsed.data.email,
      note: parsed.data.note,
      is_primary: parsed.data.isPrimary ?? false,
      ordine: parsed.data.ordine ?? 0,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'INSERT fallita' };
  }
  revalidatePath(`/office/clienti/${parsed.data.clienteId}`);
  revalidatePath('/office/clienti');
  return { ok: true, id: (data as { id: string }).id };
}

export async function aggiornaContatto(
  input: z.infer<typeof aggiornaSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTenantContext();
  const parsed = aggiornaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  }
  const supabase = createServerSupabase();

  // Per gestire la transizione di is_primary: prima leggi il cliente_id,
  // poi se isPrimary=true sblocca gli altri primary di quel cliente.
  if (parsed.data.isPrimary) {
    const { data: row } = await supabase
      .from('contatto_cliente' as never)
      .select('cliente_id')
      .eq('id', parsed.data.id)
      .maybeSingle();
    const clienteId = (row as { cliente_id?: string } | null)?.cliente_id;
    if (clienteId) {
      await supabase
        .from('contatto_cliente' as never)
        .update({ is_primary: false } as never)
        .eq('cliente_id', clienteId)
        .eq('is_primary', true)
        .neq('id', parsed.data.id);
    }
  }

  const { error } = await supabase
    .from('contatto_cliente' as never)
    .update({
      nome: parsed.data.nome,
      ruolo: parsed.data.ruolo,
      telefono: parsed.data.telefono,
      email: parsed.data.email,
      note: parsed.data.note,
      is_primary: parsed.data.isPrimary ?? false,
      ordine: parsed.data.ordine ?? 0,
    } as never)
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/clienti');
  return { ok: true };
}

export async function eliminaContatto(
  input: { id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTenantContext();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('contatto_cliente' as never)
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/clienti');
  return { ok: true };
}
