'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

import {
  cleanupAllegatoFiles,
  getTodoFileRefIds,
} from './_lib/storage-cleanup';
import { notificaAssegnazione } from './_lib/notifica-assegnazione';
import { contestoDelTodo } from './_lib/contesto-lavoro';
import { PRIORITA, PRIORITA_DEFAULT } from '@kommessa/api/priorita';
import { possoAprireLavori } from '@/app/_lib/capacita-server';

/**
 * Server actions per gestire i TODO di una commessa.
 *
 * Permessi:
 *  - admin / office: full CRUD (crea, modifica titolo/desc/priorità/assegna,
 *    manda la squadra, cambia stato, riordina, elimina, note, allegati).
 *  - tecnico: read; può cambiare stato (complete / annulla / in_corso) e
 *    aggiungere note + allegati. Non può creare/eliminare/riassegnare.
 *
 * ⭐ **«In mano a» e «chi ci va» sono due cose diverse, e solo sulle
 * RICHIESTE.** Su una richiesta al telefono `assegnato_a` dice chi ne
 * risponde — la persona a cui l'ufficio l'ha affidata — e la tabella
 * `commessa_todo_squadra` dice chi ci mette le mani (`affidaSquadraTodo`). Il
 * caposquadra, che in Bertaiola è un `office`, resta in mano a e manda i
 * suoi: così si legge tutta la catena.
 *
 * ⚠️ **Dentro una commessa no.** Lì il lavoro ha già la sua squadra
 * (`commessa_tecnici`) e una cosa da fare ha un assegnatario solo: una
 * seconda mano non aggiungerebbe niente se non un campo da compilare e un
 * secondo posto dove guardare. Lo impedisce anche la policy
 * `commessa_todo_squadra_write` (migration `20261008130000`).
 *
 * RLS SQL applica già la maggior parte di questi vincoli (vedi
 * 20260101003400_todo_riunione.sql); qui rinforziamo lato applicativo
 * con messaggi italiani comprensibili + audit_events.
 */

const FULL_ROLES = new Set<AppRole>(['admin', 'office']);
const ALL_ROLES = new Set<AppRole>(['admin', 'office', 'tecnico']);

// La scala vive in `@kommessa/api/priorita`: tre livelli, un vocabolario.
const TODO_PRIORITA = PRIORITA;
const TODO_STATO = ['aperto', 'in_corso', 'completato', 'annullato'] as const;

type TodoPriorita = (typeof TODO_PRIORITA)[number];
type TodoStato = (typeof TODO_STATO)[number];

export type TodoRow = {
  id: string;
  /** null = RICHIESTA: arrivata al telefono, non ancora un lavoro. */
  commessa_id: string | null;
  titolo: string;
  descrizione: string | null;
  stato: TodoStato;
  priorita: TodoPriorita;
  assegnato_a: string | null;
  scadenza_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completato_at: string | null;
  completato_da: string | null;
};

export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────

const CreaInput = z.object({
  /**
   * Assente = RICHIESTA: qualcuno ha chiamato e il lavoro non esiste ancora.
   * Una commessa nasce dal sopralluogo; questo momento sta a monte.
   */
  commessaId: z.string().uuid().nullable().optional(),
  titolo: z.string().trim().min(1).max(200),
  descrizione: z.string().trim().max(2000).optional(),
  priorita: z.enum(TODO_PRIORITA).default(PRIORITA_DEFAULT),
  assegnatoA: z.string().uuid().nullable().optional(),
  scadenzaAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  // ─── solo per le richieste: quel poco che si raccoglie al telefono ───
  /** Cliente in anagrafica, se chi ha chiamato c'era già. */
  clienteId: z.string().uuid().nullable().optional(),
  /** Il nome come è stato detto, quando in anagrafica non c'è. */
  clienteTesto: z.string().trim().max(200).nullable().optional(),
  /** Come richiamare: numero o email, testo libero. */
  contatto: z.string().trim().max(200).nullable().optional(),
  /**
   * Dove bisogna andare, **se diverso** dall'indirizzo del cliente.
   *
   * ⚠️ Vuoto non vuol dire «non si sa»: vuol dire «quello del cliente». Chi
   * legge ripiega li'. Copiarlo qui alla creazione farebbe una seconda verita'
   * che non si aggiorna piu' quando cambia l'anagrafica.
   */
  indirizzo: z.string().trim().max(300).nullable().optional(),
});

export async function creaTodo(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = CreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  const supabase = createServerSupabase();
  const commessaId = parsed.data.commessaId ?? null;

  /**
   * Chi puo' scrivere una cosa da fare, e con quali limiti.
   *
   * L'ufficio e chi ha i poteri del capo squadra: tutto, compresa
   * l'assegnazione e la richiesta al telefono.
   *
   * Un tecnico qualsiasi: **solo dentro una commessa su cui lavora, e senza
   * assegnarla a nessuno.** E' il gesto di chi sta sul posto — «qui ci vuole
   * una guarnizione nuova» — e oggi se lo deve ricordare a voce fino in
   * ufficio. Senza assegnatario la cosa da fare resta «per chiunque passi»,
   * che e' esattamente cio' che serve.
   *
   * Gli stessi tre limiti sono scritti anche nella policy
   * `commessa_todo_insert_tecnico`: qui ci stanno per dire **perche'** no, in
   * italiano, invece di un errore di vincolo.
   */
  if (!(await possoAprireLavori())) {
    if (ctx.role !== 'tecnico') {
      return { ok: false, error: 'Permessi insufficienti.' };
    }
    if (!commessaId) {
      return {
        ok: false,
        error: 'Una richiesta arrivata al telefono la registra l’ufficio.',
      };
    }
    if (parsed.data.assegnatoA && parsed.data.assegnatoA !== ctx.userId) {
      return {
        ok: false,
        error: 'Puoi scrivere una cosa da fare, non darla a qualcun altro: la vedrà chi passa.',
      };
    }
    const { count } = await supabase
      .from('commessa_tecnici' as never)
      .select('user_id', { count: 'exact', head: true })
      .eq('commessa_id', commessaId)
      .eq('user_id', ctx.userId);
    if ((count ?? 0) === 0) {
      return { ok: false, error: 'Non sei nella squadra di questo lavoro.' };
    }
  }

  // sort_order = max+1 nel suo gruppo. Per le richieste il gruppo è «senza
  // commessa», e serve `.is()`: `.eq('commessa_id', null)` non trova i NULL.
  const qOrder = supabase
    .from('commessa_todo' as never)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const { data: maxRow } = await (commessaId
    ? qOrder.eq('commessa_id', commessaId)
    : qOrder.is('commessa_id', null)
  ).maybeSingle();
  const nextOrder = (((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1);

  const insertRow = {
    tenant_id: ctx.tenantId,
    commessa_id: commessaId,
    titolo: parsed.data.titolo,
    descrizione: parsed.data.descrizione ?? null,
    priorita: parsed.data.priorita,
    assegnato_a: parsed.data.assegnatoA ?? null,
    scadenza_at: parsed.data.scadenzaAt ?? null,
    sort_order: nextOrder,
    metadata: parsed.data.metadata ?? {},
    created_by: ctx.userId,
    cliente_id: parsed.data.clienteId ?? null,
    cliente_testo: parsed.data.clienteTesto ?? null,
    contatto: parsed.data.contatto ?? null,
    indirizzo: parsed.data.indirizzo ?? null,
  };
  const { data, error } = await supabase
    .from('commessa_todo' as never)
    .insert(insertRow as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: `Creazione fallita: ${error.message}` };

  const id = (data as { id: string }).id;

  await audit(ctx, commessaId ? 'commessa.todo.crea' : 'richiesta.crea', commessaId, id, {
    titolo: parsed.data.titolo,
    priorita: parsed.data.priorita,
    assegnato_a: parsed.data.assegnatoA,
    ...(commessaId ? {} : { cliente: parsed.data.clienteTesto ?? parsed.data.clienteId }),
  });

  if (parsed.data.assegnatoA) {
    const contesto = await contestoDelTodo(supabase, id);
    await notificaAssegnazione({
      tenantId: ctx.tenantId,
      userId: parsed.data.assegnatoA,
      attoreUserId: ctx.userId,
      cliente: contesto.cliente,
      dove: contesto.dove,
      codiceCommessa: contesto.codiceCommessa,
      todoId: id,
      titolo: parsed.data.titolo,
      commessaId,
    });
  }

  rivalida(commessaId);
  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────
// UPDATE (admin/office full; tecnico solo stato)
// ────────────────────────────────────────────────────────────

const AggiornaInput = z.object({
  id: z.string().uuid(),
  titolo: z.string().trim().min(1).max(200).optional(),
  descrizione: z.string().trim().max(2000).nullable().optional(),
  priorita: z.enum(TODO_PRIORITA).optional(),
  assegnatoA: z.string().uuid().nullable().optional(),
  scadenzaAt: z.string().datetime().nullable().optional(),
  // ⚠️ Questi tre mancavano, e senza di loro **una richiesta al telefono non
  // si poteva correggere**: ne' il cliente ne' il numero per richiamare. Chi
  // aveva battuto male un nome o preso un numero sbagliato poteva solo
  // riaprirne un'altra — ed e' successo: la stessa richiesta scritta due
  // volte a quattro minuti di distanza.
  clienteId: z.string().uuid().nullable().optional(),
  clienteTesto: z.string().trim().max(200).nullable().optional(),
  contatto: z.string().trim().max(120).nullable().optional(),
  indirizzo: z.string().trim().max(300).nullable().optional(),
});

export async function aggiornaTodo(input: unknown): Promise<Result> {
  const parsed = AggiornaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare un TODO' };
  }

  const supabase = createServerSupabase();
  const update: Record<string, unknown> = {};
  if (parsed.data.titolo !== undefined) update.titolo = parsed.data.titolo;
  if (parsed.data.descrizione !== undefined)
    update.descrizione = parsed.data.descrizione;
  if (parsed.data.priorita !== undefined) update.priorita = parsed.data.priorita;
  if (parsed.data.assegnatoA !== undefined)
    update.assegnato_a = parsed.data.assegnatoA;
  if (parsed.data.scadenzaAt !== undefined)
    update.scadenza_at = parsed.data.scadenzaAt;
  if (parsed.data.clienteId !== undefined)
    update.cliente_id = parsed.data.clienteId;
  if (parsed.data.clienteTesto !== undefined)
    update.cliente_testo = parsed.data.clienteTesto;
  if (parsed.data.contatto !== undefined) update.contatto = parsed.data.contatto;
  if (parsed.data.indirizzo !== undefined) update.indirizzo = parsed.data.indirizzo;

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'Nessun campo da aggiornare' };
  }

  // Si legge l'assegnatario PRIMA: la notifica va mandata solo se cambia
  // davvero, altrimenti ogni ritocco al titolo riavvisa la stessa persona.
  const { data: prima } = await supabase
    .from('commessa_todo' as never)
    .select('assegnato_a')
    .eq('id', parsed.data.id)
    .maybeSingle();
  const assegnatoPrima = (prima as { assegnato_a?: string | null } | null)?.assegnato_a ?? null;

  const { data: existing, error: fErr } = await supabase
    .from('commessa_todo' as never)
    .update(update as never)
    .eq('id', parsed.data.id)
    .select('id, commessa_id, titolo, assegnato_a')
    .single();
  if (fErr) return { ok: false, error: `Update fallito: ${fErr.message}` };

  const riga = existing as { commessa_id: string | null; titolo: string; assegnato_a: string | null };
  const commessaId = riga.commessa_id;
  await audit(
    ctx,
    commessaId ? 'commessa.todo.aggiorna' : 'richiesta.aggiorna',
    commessaId,
    parsed.data.id,
    update,
  );

  if (riga.assegnato_a && riga.assegnato_a !== assegnatoPrima) {
    const contesto = await contestoDelTodo(supabase, parsed.data.id);
    await notificaAssegnazione({
      tenantId: ctx.tenantId,
      userId: riga.assegnato_a,
      attoreUserId: ctx.userId,
      cliente: contesto.cliente,
      dove: contesto.dove,
      codiceCommessa: contesto.codiceCommessa,
      todoId: parsed.data.id,
      titolo: riga.titolo,
      commessaId,
    });
  }

  rivalida(commessaId);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// CHI CI VA (admin/office) — la seconda mano
// ────────────────────────────────────────────────────────────

const SquadraInput = z.object({
  todoId: z.string().uuid(),
  /** L'elenco COMPLETO di chi ci va: chi non c'e' dentro viene tolto. */
  userIds: z.array(z.string().uuid()).max(20),
});

/**
 * Gira una cosa da fare a uno o piu' tecnici, lasciandola **in mano a** chi
 * ce l'ha.
 *
 * La segretaria prende la telefonata e la affida a un caposquadra (che in
 * Bertaiola e' un `office`); il caposquadra manda i suoi. `assegnato_a` non si
 * tocca: continua a dire a chi l'ufficio deve chiedere come sta andando.
 *
 * ⚠️ **L'elenco e' completo, non incrementale.** Arriva lo stato finale e qui
 * si calcola chi entra e chi esce: un'azione «aggiungi» separata dalla
 * «togli» obbligherebbe la pagina a tenere il conto di cosa e' cambiato, ed e'
 * il genere di conto che si sbaglia quando due persone modificano insieme.
 *
 * ⚠️ **Si avvisa solo chi entra.** Chi era gia' in squadra non ricalcola
 * niente, e un avviso che arriva ogni volta che un collega viene aggiunto e'
 * un avviso che si impara a non leggere.
 */
export async function affidaSquadraTodo(input: unknown): Promise<Result> {
  const parsed = SquadraInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    // Un tecnico a cui la richiesta e' stata data NON la passa a sua volta:
    // se non ci puo' andare lo dice a chi gliel'ha chiesta. Lo impedisce anche
    // la policy `commessa_todo_squadra_write`, qui si dice perche'.
    return {
      ok: false,
      error: 'Solo chi organizza il lavoro puo\' mandare qualcuno: chiedi all\'ufficio.',
    };
  }

  const supabase = createServerSupabase();

  const { data: todoRiga, error: tErr } = await supabase
    .from('commessa_todo' as never)
    .select('id, commessa_id, titolo, tenant_id')
    .eq('id', parsed.data.todoId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `Lettura fallita: ${tErr.message}` };
  if (!todoRiga) return { ok: false, error: 'Questa cosa da fare non esiste piu\'.' };
  const todo = todoRiga as {
    commessa_id: string | null;
    titolo: string;
    tenant_id: string;
  };

  // ⚠️ Solo le richieste al telefono. Dentro una commessa il lavoro ha gia' la
  // sua squadra e la cosa da fare ha un assegnatario solo. Lo dice anche la
  // policy; qui si risponde in italiano invece di far arrivare una violazione
  // di vincolo, che non e' una cosa a cui una persona possa rimediare.
  if (todo.commessa_id !== null) {
    return {
      ok: false,
      error:
        'Dentro una commessa non si manda una seconda squadra: la cosa da fare si assegna a una persona, e chi lavora sul lavoro e\' gia\' nella squadra della commessa.',
    };
  }

  // Le persone devono stare in questo spazio di lavoro. Un id arrivato dal
  // browser non e' una garanzia, e la chiave esterna da sola non guarda il
  // tenant.
  const voluti = [...new Set(parsed.data.userIds)];
  if (voluti.length > 0) {
    const { data: ammessi, error: uErr } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .in('id', voluti);
    if (uErr) return { ok: false, error: `Lettura fallita: ${uErr.message}` };
    if ((ammessi ?? []).length !== voluti.length) {
      return { ok: false, error: 'Qualcuno di questi non e\' in questo spazio di lavoro.' };
    }
  }

  const { data: giaRaw, error: gErr } = await supabase
    .from('commessa_todo_squadra' as never)
    .select('user_id')
    .eq('todo_id', parsed.data.todoId);
  if (gErr) return { ok: false, error: `Lettura fallita: ${gErr.message}` };
  const gia = new Set(
    ((giaRaw ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );

  const entrano = voluti.filter((u) => !gia.has(u));
  const escono = [...gia].filter((u) => !voluti.includes(u));

  if (entrano.length === 0 && escono.length === 0) return { ok: true };

  // ⚠️ Prima si aggiunge, poi si toglie: se l'inserimento fallisce la squadra
  // resta quella di prima, invece di restare vuota.
  if (entrano.length > 0) {
    const { error: iErr } = await supabase
      .from('commessa_todo_squadra' as never)
      .insert(
        entrano.map((u) => ({
          todo_id: parsed.data.todoId,
          user_id: u,
          tenant_id: todo.tenant_id,
          assegnato_da: ctx.userId,
        })) as never,
      );
    if (iErr) return { ok: false, error: `Non sono riuscito a mandarli: ${iErr.message}` };
  }
  if (escono.length > 0) {
    const { error: dErr } = await supabase
      .from('commessa_todo_squadra' as never)
      .delete()
      .eq('todo_id', parsed.data.todoId)
      .in('user_id', escono);
    if (dErr) return { ok: false, error: `Non sono riuscito a togliere: ${dErr.message}` };
  }

  await audit(ctx, 'richiesta.squadra', null, parsed.data.todoId, {
    entrano,
    escono,
    squadra: voluti,
  });

  // Si legge una volta sola, fuori dal giro: mandare tre persone non deve
  // voler dire leggere tre volte la stessa riga.
  const contesto = await contestoDelTodo(supabase, parsed.data.todoId);
  for (const u of entrano) {
    if (u === ctx.userId) continue; // non si avvisa chi manda se stesso
    await notificaAssegnazione({
      tenantId: ctx.tenantId,
      userId: u,
      attoreUserId: ctx.userId,
      cliente: contesto.cliente,
      dove: contesto.dove,
      todoId: parsed.data.todoId,
      titolo: todo.titolo,
      commessaId: null,
    });
  }

  rivalida(null);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// CAMBIA STATO (tutti i ruoli)
// ────────────────────────────────────────────────────────────

const StatoInput = z.object({
  id: z.string().uuid(),
  stato: z.enum(TODO_STATO),
});

export async function cambiaTodoStato(input: unknown): Promise<Result> {
  const parsed = StatoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!ALL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Permessi insufficienti' };
  }
  // annullato solo admin/office: è una cancellazione travestita.
  if (parsed.data.stato === 'annullato' && !FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo l’ufficio può annullare una cosa da fare.' };
  }

  const supabase = createServerSupabase();

  /**
   * Un tecnico spunta solo cio' che lo riguarda: una cosa da fare su una
   * commessa su cui e' in squadra, una assegnata a lui, **o una richiesta su
   * cui lo hanno mandato**.
   *
   * ⚠️ Fino al 07/10 questo controllo **non c'era da nessuna parte**: non qui
   * e non in RLS, dove la policy diceva solo «sei un tecnico di questo spazio
   * di lavoro». Il filtro «solo le mie» viveva nella pagina, e una pagina non
   * e' un presidio. Adesso lo dicono entrambi; qui per poterlo spiegare.
   *
   * ⚠️⚠️ **E il terzo caso e' arrivato dopo il presidio.** Aperta la seconda
   * mano sulle richieste, la RLS la riconosceva e questa guardia no: il
   * tecnico mandato vedeva la richiesta sul telefono, premeva il cerchietto e
   * si sentiva rispondere «Questa richiesta non e' tua». E' la stessa forma
   * del riassunto delle riunioni che spariva: ⭐ **aprire un permesso vuol
   * dire aprirlo per tutto il gesto, e il gesto passa da due presidi.**
   */
  if (ctx.role === 'tecnico') {
    const { data: riga } = await supabase
      .from('commessa_todo' as never)
      .select('commessa_id, assegnato_a')
      .eq('id', parsed.data.id)
      .maybeSingle();
    const r = riga as { commessa_id: string | null; assegnato_a: string | null } | null;
    if (!r) return { ok: false, error: 'Questa cosa da fare non c’è più.' };
    if (r.assegnato_a !== ctx.userId) {
      if (!r.commessa_id) {
        // Una richiesta: o e' sua, o ce lo hanno mandato.
        const { count } = await supabase
          .from('commessa_todo_squadra' as never)
          .select('user_id', { count: 'exact', head: true })
          .eq('todo_id', parsed.data.id)
          .eq('user_id', ctx.userId);
        if ((count ?? 0) === 0) {
          return { ok: false, error: 'Questa richiesta non è tua.' };
        }
      } else {
        const { count } = await supabase
          .from('commessa_tecnici' as never)
          .select('user_id', { count: 'exact', head: true })
          .eq('commessa_id', r.commessa_id)
          .eq('user_id', ctx.userId);
        if ((count ?? 0) === 0) {
          return { ok: false, error: 'Non sei nella squadra di questo lavoro.' };
        }
      }
    }
  }
  const { data, error } = await supabase
    .from('commessa_todo' as never)
    .update({ stato: parsed.data.stato } as never)
    .eq('id', parsed.data.id)
    .select('id, commessa_id, stato')
    .single();
  if (error) return { ok: false, error: `Cambio stato fallito: ${error.message}` };

  const commessaId = (data as { commessa_id: string }).commessa_id;
  await audit(
    ctx,
    parsed.data.stato === 'completato'
      ? 'commessa.todo.completa'
      : 'commessa.todo.stato',
    commessaId,
    parsed.data.id,
    { stato: parsed.data.stato },
  );

  rivalida(commessaId);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// RIORDINA (admin/office)
// ────────────────────────────────────────────────────────────

const RiordinaInput = z.object({
  commessaId: z.string().uuid(),
  idsOrdinati: z.array(z.string().uuid()).min(1).max(200),
});

export async function riordinaTodo(input: unknown): Promise<Result> {
  const parsed = RiordinaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono riordinare' };
  }

  // Una sola query atomica via RPC: aggiorna sort_order di tutta la lista
  // in una transazione implicita (Postgres `UPDATE ... FROM unnest WITH
  // ORDINALITY`). Vedi migration 20260101003600_todo_riordina_rpc.sql.
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc('commessa_todo_riordina' as never, {
    p_commessa_id: parsed.data.commessaId,
    p_ids: parsed.data.idsOrdinati,
  } as never);
  if (error) return { ok: false, error: `Riordino fallito: ${error.message}` };

  rivalida(parsed.data.commessaId);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// ELIMINA (admin/office)
// ────────────────────────────────────────────────────────────

export async function eliminaTodo(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono eliminare un TODO' };
  }

  const supabase = createServerSupabase();
  const { data: todo } = await supabase
    .from('commessa_todo' as never)
    .select('commessa_id, titolo')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!todo) return { ok: false, error: 'TODO non trovato' };
  const t = todo as { commessa_id: string; titolo: string };

  // Cleanup allegati su storage cloud PRIMA del delete cascade del TODO
  // (la FK cascade rimuove i junction allegato, ma non i file_refs né i
  // file fisici su Nextcloud).
  const fileRefIds = await getTodoFileRefIds(parsed.data.id);
  if (fileRefIds.length > 0) {
    const cleanup = await cleanupAllegatoFiles({
      tenantId: ctx.tenantId,
      fileRefIds,
    });
    if (cleanup.errors.length > 0) {
      console.warn('[eliminaTodo] cleanup errors', cleanup.errors);
    }
  }

  const { error } = await supabase
    .from('commessa_todo' as never)
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: `Eliminazione fallita: ${error.message}` };

  await audit(ctx, 'commessa.todo.elimina', t.commessa_id, parsed.data.id, {
    titolo: t.titolo,
  });
  rivalida(t.commessa_id);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// NOTE
// ────────────────────────────────────────────────────────────

const NotaInput = z.object({
  todoId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function aggiungiNotaTodo(input: unknown): Promise<Result> {
  const parsed = NotaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  const supabase = createServerSupabase();
  const { data: todo } = await supabase
    .from('commessa_todo' as never)
    .select('id, commessa_id, tenant_id')
    .eq('id', parsed.data.todoId)
    .maybeSingle();
  if (!todo) return { ok: false, error: 'TODO non trovato' };
  const t = todo as { commessa_id: string };

  const { error } = await supabase
    .from('commessa_todo_nota' as never)
    .insert({
      tenant_id: ctx.tenantId,
      todo_id: parsed.data.todoId,
      author_id: ctx.userId,
      body: parsed.data.body,
    } as never);
  if (error) return { ok: false, error: `Nota fallita: ${error.message}` };

  rivalida(t.commessa_id);
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

async function safeCtx() {
  try {
    return await requireTenantContext();
  } catch {
    return null;
  }
}

async function audit(
  ctx: { tenantId: string; userId: string; role: AppRole },
  action: string,
  commessaId: string | null,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  // entity_type='commessa' + entity_id=commessaId così la tab Cronologia
  // (filtrata per entity_type='commessa') include questi eventi.
  // L'id specifico del TODO va in metadata.todo_id.
  //
  // Una RICHIESTA non ha una commessa: l'entità è la richiesta stessa,
  // altrimenti l'evento finirebbe nella cronologia di nessuno.
  const supabase = createServerSupabase();
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: commessaId ? 'commessa' : 'richiesta',
    entity_id: commessaId ?? entityId,
    action,
    metadata: {
      todo_id: entityId,
      ...metadata,
    } as unknown as never,
  });
}

/**
 * Ricarica le pagine che mostrano un task. Senza commessa si saltano i due
 * percorsi che la citano: `revalidatePath('/office/commesse/null')` non
 * ricarica niente e nasconde l'errore.
 */
function rivalida(commessaId: string | null): void {
  revalidatePath('/office/todo');
  revalidatePath('/office');
  revalidatePath('/mobile');
  if (commessaId) {
    revalidatePath(`/office/commesse/${commessaId}`);
    revalidatePath(`/mobile/commessa/${commessaId}`);
  }
}
