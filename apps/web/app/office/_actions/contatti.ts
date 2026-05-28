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
  /**
   * Se valorizzato, il contatto è legato SOLO a questa commessa
   * (es. geometra del cantiere). Se null/undefined è un contatto del
   * cliente, riusabile su tutte le sue commesse.
   */
  commessaId: z.string().uuid().nullable().optional(),
});

const aggiornaSchema = contattoBase.extend({
  id: z.string().uuid(),
  commessaId: z.string().uuid().nullable().optional(),
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
  // is_primary ha senso solo per i contatti del cliente (commessa_id NULL):
  // un contatto specifico di una commessa non è "il principale" del cliente.
  const isClienteScope = !parsed.data.commessaId;
  const wantsPrimary = Boolean(parsed.data.isPrimary) && isClienteScope;

  // Se questo contatto è primary del cliente, sblocca il vecchio primary
  // del cliente (l'indice unique parziale lo rifiuterebbe).
  if (wantsPrimary) {
    await supabase
      .from('contatto_cliente' as never)
      .update({ is_primary: false } as never)
      .eq('cliente_id', parsed.data.clienteId)
      .is('commessa_id', null)
      .eq('is_primary', true);
  }
  const { data, error } = await supabase
    .from('contatto_cliente' as never)
    .insert({
      tenant_id: ctx.tenantId,
      cliente_id: parsed.data.clienteId,
      commessa_id: parsed.data.commessaId ?? null,
      nome: parsed.data.nome,
      ruolo: parsed.data.ruolo,
      telefono: parsed.data.telefono,
      email: parsed.data.email,
      note: parsed.data.note,
      is_primary: wantsPrimary,
      ordine: parsed.data.ordine ?? 0,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'INSERT fallita' };
  }
  revalidatePath(`/office/clienti/${parsed.data.clienteId}`);
  revalidatePath('/office/clienti');
  if (parsed.data.commessaId) {
    revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  }
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

  // Carica il record per leggere cliente_id + commessa_id correnti — serve
  // sia per la gestione is_primary che per i revalidate path.
  const { data: row } = await supabase
    .from('contatto_cliente' as never)
    .select('cliente_id, commessa_id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  const clienteId = (row as { cliente_id?: string } | null)?.cliente_id;
  const currentCommessaId = (row as { commessa_id?: string | null } | null)
    ?.commessa_id;
  // is_primary valido solo per i contatti del cliente (commessa_id NULL).
  const isClienteScope = !currentCommessaId;
  const wantsPrimary = Boolean(parsed.data.isPrimary) && isClienteScope;

  if (wantsPrimary && clienteId) {
    await supabase
      .from('contatto_cliente' as never)
      .update({ is_primary: false } as never)
      .eq('cliente_id', clienteId)
      .is('commessa_id', null)
      .eq('is_primary', true)
      .neq('id', parsed.data.id);
  }

  const { error } = await supabase
    .from('contatto_cliente' as never)
    .update({
      nome: parsed.data.nome,
      ruolo: parsed.data.ruolo,
      telefono: parsed.data.telefono,
      email: parsed.data.email,
      note: parsed.data.note,
      is_primary: wantsPrimary,
      ordine: parsed.data.ordine ?? 0,
    } as never)
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/clienti');
  if (currentCommessaId) {
    revalidatePath(`/office/commesse/${currentCommessaId}`);
  }
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
