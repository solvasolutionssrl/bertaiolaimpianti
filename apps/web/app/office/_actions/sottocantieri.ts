'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';
import { tenantHasModule } from '@/app/_lib/modules';
import { auditTenant } from '@/app/_actions/_lib/audit';

/**
 * I sottocantieri (fasi) di un cantiere, scritti dall'ufficio (23/10/2026).
 *
 * Una fase nata dal gestionale (`origine_gestionale_al` valorizzato) tiene
 * nome e codice: sono SUOI, e alla prossima lettura li riscriverebbe. Da qui
 * se ne cambiano descrizione e stato. Una fase scritta a mano si corregge
 * tutta. Non si cancella: le ore attribuite la citano; si chiude.
 */

const MANAGE_ROLES = new Set<AppRole>(['admin', 'office']);

type OkResult = { ok: true } | { ok: false; error: string };
type CreaResult = { ok: true; id: string } | { ok: false; error: string };

async function guard() {
  const ctx = await requireTenantContext();
  if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Solo l’ufficio e gli amministratori possono gestire i sottocantieri');
  if (!(await tenantHasModule('kantiere'))) throw new Error('Modulo Kantiere non attivo per questa azienda');
  return ctx;
}

/** Il vincolo di unicita' del codice, detto in italiano. */
function erroreLeggibile(message: string): string {
  if (/sottocantieri_codice_uq|duplicate key/i.test(message)) return 'Questo codice è già usato da un’altra fase dello stesso cantiere.';
  return message;
}

const codiceSchema = z
  .string()
  .trim()
  .max(40)
  .transform((s) => (s.length === 0 ? null : s))
  .nullable()
  .optional();

const CreaSchema = z.object({
  cantiereId: z.string().uuid(),
  nome: z.string().trim().min(1, 'Il nome è obbligatorio').max(160),
  descrizione: z.string().trim().max(2000).optional().nullable(),
  codice: codiceSchema,
});

export async function creaSottocantiere(input: unknown): Promise<CreaResult> {
  const parsed = CreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();

  const { data: cant } = await supabase
    .from('cantieri' as never)
    .select('id')
    .eq('id', parsed.data.cantiereId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!cant) return { ok: false, error: 'Cantiere non trovato' };

  const { data, error } = await supabase
    .from('sottocantieri' as never)
    .insert({
      tenant_id: ctx.tenantId,
      cantiere_id: parsed.data.cantiereId,
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione?.trim() || null,
      codice: parsed.data.codice ?? null,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: erroreLeggibile(error.message) };
  const row = data as { id: string };

  await auditTenant(supabase, {
    tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role,
    entityType: 'sottocantiere', entityId: row.id, action: 'sottocantiere.crea',
    after: { cantiereId: parsed.data.cantiereId, nome: parsed.data.nome, codice: parsed.data.codice ?? null },
  });
  revalidatePath('/office/kantiere/cantieri');
  revalidatePath(`/office/kantiere/cantieri/${parsed.data.cantiereId}`);
  return { ok: true, id: row.id };
}

const AggiornaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(1).max(160).optional(),
  descrizione: z.string().trim().max(2000).optional().nullable(),
  codice: codiceSchema,
  stato: z.enum(['attivo', 'chiuso']).optional(),
});

export async function aggiornaSottocantiere(input: unknown): Promise<OkResult> {
  const parsed = AggiornaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  let ctx;
  try { ctx = await guard(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const supabase = createServerSupabase();

  const { data: curRaw } = await supabase
    .from('sottocantieri' as never)
    .select('id, cantiere_id, nome, codice, origine_gestionale_al')
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const cur = curRaw as { id: string; cantiere_id: string; nome: string; codice: string | null; origine_gestionale_al: string | null } | null;
  if (!cur) return { ok: false, error: 'Sottocantiere non trovato' };

  const patch: Record<string, unknown> = {};
  const dalGestionale = !!cur.origine_gestionale_al;
  if (parsed.data.nome !== undefined && parsed.data.nome !== cur.nome) {
    if (dalGestionale) return { ok: false, error: 'Il nome di una fase del gestionale si cambia nel gestionale.' };
    patch['nome'] = parsed.data.nome;
  }
  if ('codice' in parsed.data && (parsed.data.codice ?? null) !== cur.codice) {
    if (dalGestionale) return { ok: false, error: 'Il codice di una fase del gestionale si cambia nel gestionale.' };
    patch['codice'] = parsed.data.codice ?? null;
  }
  if ('descrizione' in parsed.data) patch['descrizione'] = parsed.data.descrizione?.trim() || null;
  if (parsed.data.stato !== undefined) patch['stato'] = parsed.data.stato;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from('sottocantieri' as never)
    .update(patch as never)
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: erroreLeggibile(error.message) };

  await auditTenant(supabase, {
    tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role,
    entityType: 'sottocantiere', entityId: parsed.data.id, action: 'sottocantiere.modifica',
    after: patch,
  });
  revalidatePath('/office/kantiere/cantieri');
  revalidatePath(`/office/kantiere/cantieri/${cur.cantiere_id}`);
  return { ok: true };
}

/** Chiudere una fase: non si propone piu' nei pannelli, le ore gia' scritte restano. */
export async function chiudiSottocantiere(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  return aggiornaSottocantiere({ id: parsed.data.id, stato: 'chiuso' });
}

export async function riapriSottocantiere(input: unknown): Promise<OkResult> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  return aggiornaSottocantiere({ id: parsed.data.id, stato: 'attivo' });
}
