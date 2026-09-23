'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { auditTenant } from '@/app/_actions/_lib/audit';
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

// ── crea utente/accesso app per un dipendente (no email, username+password) ──
// Stesso modello FPM del super-admin (`creaUtenteManuale`), ma ristretto al
// tenant di chi chiama: l'ufficio crea l'accesso solo per il PROPRIO spazio.
// Email sintetica `<username>@<slug>.kommessa.local` (mai consegnata via SMTP),
// `email_confirm:true` → login immediato con username + password.

const CreaUtenteSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, ".", "-", "_"'),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(['tecnico', 'office']),
  password: z.string().min(8, 'Almeno 8 caratteri').max(72),
});

export async function creaUtenteDipendente(
  input: unknown,
): Promise<{ ok: true; userId: string; loginEmail: string } | { ok: false; error: string }> {
  const parsed = CreaUtenteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido' };
  const ctx = await guard();
  // Un utente 'office' crea accessi per i tecnici; gli account d'ufficio, che
  // vedono tutto il tenant, restano agli amministratori (come gli inviti).
  if (parsed.data.role === 'office' && ctx.role !== 'admin') {
    return { ok: false, error: 'Solo un amministratore può creare un account ufficio.' };
  }

  let admin;
  try {
    admin = createServiceSupabase();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Configurazione service-role mancante.' };
  }

  // Slug minuscolo: Supabase normalizza comunque l'email a lowercase, così il
  // login mostrato coincide esattamente con quello memorizzato.
  const loginEmail = `${parsed.data.username}@${ctx.tenantSlug.toLowerCase()}.kommessa.local`;

  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.displayName },
    app_metadata: {
      tenant_id: ctx.tenantId,
      tenant_slug: ctx.tenantSlug,
      role: parsed.data.role,
      manual_account: true,
    } as never,
  });
  if (created.error) {
    const msg = created.error.message;
    if (msg.toLowerCase().includes('already')) {
      return { ok: false, error: `Username "${parsed.data.username}" già in uso.` };
    }
    return { ok: false, error: msg };
  }
  const uid = created.data.user?.id;
  if (!uid) return { ok: false, error: 'auth id mancante' };

  const { error: insErr } = await admin.from('users').insert({
    id: uid,
    tenant_id: ctx.tenantId,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
    attivo: true,
  } as never);
  if (insErr) {
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {
      /* best-effort */
    }
    return { ok: false, error: `Creazione utente fallita: ${insErr.message}` };
  }

  revalidatePath('/office/kantiere/dipendenti');
  return { ok: true, userId: uid, loginEmail };
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
