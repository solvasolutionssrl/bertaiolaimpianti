'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';

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

export async function eliminaCliente(input: { id: string }) {
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  const supabase = createServerSupabase();
  const { error } = await supabase.from('clienti').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/office/clienti');
}
