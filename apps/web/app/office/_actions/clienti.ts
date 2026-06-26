'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

const baseSchema = z.object({
  ragioneSociale: z.string().min(1),
  tipo: z.enum(['persona_fisica', 'azienda']).default('persona_fisica'),
  indirizzo: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  partitaIva: z.string().optional().nullable(),
  codiceFiscale: z.string().optional().nullable(),
  telefoni: z.array(z.string()).default([]),
  email: z.array(z.string().email().or(z.literal(''))).default([]),
  note: z.string().optional().nullable(),
});

/**
 * Cerca clienti dell'anagrafica per nome (match parziale, case-insensitive).
 * Usata dal flusso di dettato vocale per evitare duplicati: quando l'AI
 * rileva un nome cliente, proponiamo i clienti esistenti che combaciano
 * così l'utente può associare la commessa a quello giusto invece di
 * crearne uno nuovo ogni volta. RLS scopa già sul tenant corrente.
 */
export interface ClienteSimile {
  id: string;
  ragione_sociale: string;
  tipo: 'persona_fisica' | 'azienda' | null;
  citta: string | null;
  telefoni: string[] | null;
  email: string[] | null;
}

export async function cercaClientiPerNome(input: {
  nome: string;
}): Promise<ClienteSimile[]> {
  await requireTenantContext();
  const term = (input.nome ?? '').trim();
  if (term.length < 3) return [];
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('clienti')
    .select('id, ragione_sociale, tipo, citta, telefoni, email')
    .ilike('ragione_sociale', `%${term}%`)
    .order('ragione_sociale')
    .limit(5);
  return (data ?? []) as ClienteSimile[];
}

export async function creaCliente(input: z.infer<typeof baseSchema>) {
  const ctx = await requireTenantContext();
  const parsed = baseSchema.parse(input);
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('clienti')
    .insert({
      tenant_id: ctx.tenantId,
      ragione_sociale: parsed.ragioneSociale,
      tipo: parsed.tipo,
      indirizzo: parsed.indirizzo,
      citta: parsed.citta,
      cap: parsed.cap,
      provincia: parsed.provincia,
      partita_iva: parsed.partitaIva,
      codice_fiscale: parsed.codiceFiscale,
      telefoni: parsed.telefoni.filter(Boolean),
      email: parsed.email.filter(Boolean),
      note: parsed.note,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'INSERT fallita');
  revalidatePath('/office/clienti');
  return { id: data.id };
}

const updateSchema = baseSchema.extend({ id: z.string().uuid() });

export async function aggiornaCliente(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('clienti')
    .update({
      ragione_sociale: parsed.ragioneSociale,
      tipo: parsed.tipo,
      indirizzo: parsed.indirizzo,
      citta: parsed.citta,
      cap: parsed.cap,
      provincia: parsed.provincia,
      partita_iva: parsed.partitaIva,
      codice_fiscale: parsed.codiceFiscale,
      telefoni: parsed.telefoni.filter(Boolean),
      email: parsed.email.filter(Boolean),
      note: parsed.note,
    })
    .eq('id', parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/office/clienti/${parsed.id}`);
  revalidatePath('/office/clienti');
}

export async function eliminaCliente(
  input: { id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  await requireTenantContext();
  const supabase = createServerSupabase();

  // Difesa: blocca se ci sono commesse legate al cliente. Postgres
  // probabilmente già rifiuta via FK, ma diamo un errore parlante.
  const { count } = await supabase
    .from('commesse')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', parsed.data.id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Impossibile eliminare: il cliente ha ${count} commesse associate. Sposta o elimina prima le commesse.`,
    };
  }

  const { error } = await supabase
    .from('clienti')
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/clienti');
  return { ok: true };
}

const rinominaSchema = z.object({
  id: z.string().uuid(),
  ragioneSociale: z.string().trim().min(1).max(200),
});

export async function rinominaCliente(
  input: z.infer<typeof rinominaSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = rinominaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Input non valido' };
  }
  await requireTenantContext();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('clienti')
    .update({ ragione_sociale: parsed.data.ragioneSociale })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/office/clienti/${parsed.data.id}`);
  revalidatePath('/office/clienti');
  return { ok: true };
}
