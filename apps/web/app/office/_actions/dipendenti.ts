'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { auditTenant } from '@/app/_actions/_lib/audit';
import { tenantHasModule } from '@/app/_lib/modules';
import { prossimoCodiceDipendente } from '@kommessa/api/kantiere';
import { creaAccount } from '@/app/_actions/account';

const BaseSchema = z.object({
  nome: z.string().min(1).max(80),
  cognome: z.string().min(1).max(80),
  mansione: z.string().max(120).optional().nullable(),
  codice_interno: z.string().max(60).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  stato_attivo: z.boolean().optional(),
  a_turni: z.boolean().optional(),
  /** Come lavora: cambia cosa chiede l'app, non cosa le e' permesso fare. */
  modalita_lavoro: z.enum(['ufficio', 'esterno']).optional(),
  costo_orario: z.number().min(0).max(10000).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

type Result = { ok: true; id?: string; avviso?: string } | { ok: false; error: string };

/**
 * Scrive la modalita' di lavoro **a parte**.
 *
 * ⚠️ La colonna arriva con la migration `20260922090000`, che si applica a
 * mano: se il codice e' online prima, infilarla nell'insert o nell'update
 * principale farebbe cadere con se' tutto il salvataggio del dipendente —
 * cioe' romperebbe una cosa che funziona per una che non c'e' ancora. Scritta
 * da sola, al massimo non attacca, e chi salva se lo sente dire.
 */
async function scriviModalita(
  supabase: ReturnType<typeof createServerSupabase>,
  id: string,
  modalita: 'ufficio' | 'esterno' | undefined,
): Promise<string | null> {
  if (!modalita) return null;
  const { error } = await supabase
    .from('dipendenti' as never)
    .update({ modalita_lavoro: modalita } as never)
    .eq('id', id);
  if (!error) return null;
  return 'La modalità di lavoro non è stata salvata: manca ancora la modifica al database (migrazione 20260922090000).';
}

async function guard() {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) throw new Error('FORBIDDEN');
  if (!(await tenantHasModule('kantiere')) && !(await tenantHasModule('dipendenti'))) {
    throw new Error('MODULO_OFF');
  }
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
  const id = (data as { id: string }).id;
  const avviso = await scriviModalita(supabase, id, parsed.data.modalita_lavoro);
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'dipendente',
    entityId: id,
    action: 'dipendente.crea',
    after: {
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      codice_interno: codice,
      mansione: parsed.data.mansione ?? null,
      costo_orario: parsed.data.costo_orario ?? null,
    },
  });
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, id, ...(avviso ? { avviso } : {}) };
}

export async function aggiornaDipendente(input: unknown): Promise<Result> {
  const schema = BaseSchema.extend({ id: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
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
      // Il costo orario si scrive solo se arriva: il modulo dell'elenco Dipendenti
      // non lo ha, e salvare da lì lo azzerava.
      ...(parsed.data.costo_orario !== undefined ? { costo_orario: parsed.data.costo_orario } : {}),
      note: parsed.data.note ?? null,
    } as never)
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  const avviso = await scriviModalita(supabase, parsed.data.id, parsed.data.modalita_lavoro);
  // L'anagrafica di una persona non lasciava nessuna traccia, nemmeno quando
  // cambia il costo orario, che finisce dritto nei costi del cantiere.
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'dipendente',
    entityId: parsed.data.id,
    action: 'dipendente.modifica',
    after: {
      nome: parsed.data.nome,
      cognome: parsed.data.cognome,
      mansione: parsed.data.mansione ?? null,
      codice_interno: parsed.data.codice_interno ?? null,
      stato_attivo: parsed.data.stato_attivo ?? true,
      a_turni: parsed.data.a_turni ?? false,
      modalita_lavoro: parsed.data.modalita_lavoro,
      ...(parsed.data.costo_orario !== undefined
        ? { costo_orario: parsed.data.costo_orario }
        : {}),
    },
  });
  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath(`/office/kantiere/dipendenti/${parsed.data.id}`);
  return { ok: true, ...(avviso ? { avviso } : {}) };
}

// ── crea l'accesso all'app per una persona del personale ────────────────────
/**
 * Un tempo questa funzione creava l'account da sé: username, alias di posta,
 * `createUser`, insert in `users`. Adesso **delega** a `creaAccount`
 * (`app/_actions/account.ts`), e il motivo è pratico: era una delle cinque
 * copie dello stesso gesto, e quando abbiamo aggiunto «al primo ingresso
 * cambia la password» una copia sarebbe rimasta indietro — creando account che
 * restano per sempre sulla password dettata al telefono, senza nessun segnale.
 *
 * Qui resta solo ciò che è davvero di questa pagina: il controllo del modulo e
 * il legame con la scheda del personale.
 */
export async function creaUtenteDipendente(
  input: unknown,
): Promise<
  | { ok: true; userId: string; loginEmail: string; username: string; password: string; codiceAzienda: string | null }
  | { ok: false; error: string }
> {
  const parsed = z
    .object({
      username: z.string(),
      displayName: z.string(),
      role: z.enum(['tecnico', 'office']),
      // Facoltativa: se non arriva, la genera il server con una sorgente
      // crittografica invece del browser.
      password: z.string().optional(),
      dipendenteId: z.string().uuid().optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };

  try {
    await guard();
  } catch (e) {
    const causa = e instanceof Error ? e.message : '';
    if (causa === 'MODULO_OFF') {
      return { ok: false, error: 'Il modulo Personale non è attivo per questo spazio di lavoro.' };
    }
    return { ok: false, error: 'Gli accessi li gestisce l’ufficio.' };
  }

  const esito = await creaAccount({
    username: parsed.data.username,
    displayName: parsed.data.displayName,
    role: parsed.data.role,
    password: parsed.data.password,
    dipendenteId: parsed.data.dipendenteId ?? null,
  });
  if (!esito.ok) return { ok: false, error: esito.error };

  revalidatePath('/office/kantiere/dipendenti');
  revalidatePath('/office/personale/dipendenti');
  return {
    ok: true,
    userId: esito.data.userId,
    loginEmail: esito.data.aliasInterno,
    username: esito.data.username,
    password: esito.data.password,
    codiceAzienda: esito.data.codiceAzienda,
  };
}

export async function eliminaDipendente(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const ctx = await guard();
  const supabase = createServerSupabase();
  const { count } = await supabase
    .from('commessa_squadra' as never)
    .select('dipendente_id', { count: 'exact', head: true })
    .eq('dipendente_id', parsed.data.id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Dipendente assegnato a ${count} commesse: rimuovilo dalle squadre prima.` };
  }
  // Com'era prima di sparire: dopo la delete non c'e' piu' modo di saperlo, e
  // una persona cancellata senza traccia e' il buco peggiore di tutti.
  const { data: primaRaw } = await supabase
    .from('dipendenti' as never)
    .select('nome, cognome, codice_interno, mansione, stato_attivo')
    .eq('id', parsed.data.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  const { error } = await supabase.from('dipendenti' as never).delete().eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  await auditTenant(supabase, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'dipendente',
    entityId: parsed.data.id,
    action: 'dipendente.elimina',
    before: primaRaw ?? null,
  });
  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true };
}
