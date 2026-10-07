'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import type { AppRole } from '@kommessa/api';

import {
  chatCompletion,
  getChatModel,
  isOpenAIConfigured,
  isAiUnavailable,
  OpenAiError,
} from '../_lib/openai';
import { segnalaAiNonDisponibile } from '../_lib/ai-alert';
import { MSG_AI_NON_DISPONIBILE } from '../_lib/ai-messages';
import { PRIORITA, normalizzaPriorita, type Priorita } from '@kommessa/api/priorita';
import {
  cleanupAllegatoFiles,
  getRiunioneFileRefIds,
} from './_lib/storage-cleanup';

/**
 * Server actions per le RIUNIONI di una commessa.
 *
 * Solo admin/office possono creare/modificare/eliminare.
 *
 * Pipeline AI (generaReportRiunione):
 *  - input: corpo_libero + trascrizione concatenati
 *  - output: { reportino, todo_proposti: [{titolo, priorita}] }
 *  - i TODO PROPOSTI non vengono materializzati automaticamente: l'UI
 *    chiede conferma all'utente, poi chiama materializzaTodoDaRiunione
 *    con la sotto-lista approvata.
 */

/**
 * Chi tocca le riunioni.
 *
 * Creare una riunione e generarne il verbale e' un gesto da capo: sta nella
 * capacita' `capo_squadra`, che l'ufficio ha per mestiere e un tecnico solo
 * se gliela danno. Modificare ed eliminare restano dell'ufficio: una volta
 * che il verbale e' agli atti, chi lo corregge e' chi risponde del lavoro.
 */
const FULL_ROLES = new Set<AppRole>(['admin', 'office']);

export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

// ─── CREATE ─────────────────────────────────────────────────────────

const CreaInput = z.object({
  commessaId: z.string().uuid(),
  dataRiunione: z.string().date().optional(),
  titolo: z.string().trim().max(200).optional(),
  corpoLibero: z.string().trim().max(20000).optional(),
  trascrizione: z.string().trim().max(20000).optional(),
});

export async function creaRiunione(
  input: unknown,
): Promise<Result<{ id: string }>> {
  const parsed = CreaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  // ⚠️ Nessun controllo sul capo squadra, ed è una scelta: una riunione è il
  // sopralluogo raccontato — quattro righe dettate davanti alla caldaia — cioè
  // lavoro DENTRO una commessa già assegnata, non un atto di apertura.
  // `capo_squadra` resta «aprire un lavoro nuovo».
  //
  // Chi può scrivere su quale commessa lo decide la RLS
  // (`commessa_riunione_insert_tecnico`, migration 20261008110000): solo le
  // commesse su cui è in squadra, e firmata da lui. Un presidio nel database
  // vale più di un `if` qui, perché vale anche per le strade che non passano
  // da questa funzione.

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commessa_riunione' as never)
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: parsed.data.commessaId,
      // Default: data locale (Italia) — evita off-by-one quando si crea
      // dopo le 22 UTC (= 23/00 ora italiana, "oggi" sarebbe già "domani UTC").
      data_riunione: parsed.data.dataRiunione ?? localDateISO(),
      titolo: parsed.data.titolo ?? null,
      corpo_libero: parsed.data.corpoLibero ?? null,
      trascrizione: parsed.data.trascrizione ?? null,
      created_by: ctx.userId,
    } as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: `Creazione fallita: ${error.message}` };
  const id = (data as { id: string }).id;

  await audit(ctx, 'commessa.riunione.crea', parsed.data.commessaId, id, {
    data_riunione: parsed.data.dataRiunione,
  });

  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  return { ok: true, data: { id } };
}

// ─── UPDATE ─────────────────────────────────────────────────────────

const AggiornaInput = z.object({
  id: z.string().uuid(),
  dataRiunione: z.string().date().optional(),
  titolo: z.string().trim().max(200).nullable().optional(),
  corpoLibero: z.string().trim().max(20000).nullable().optional(),
  trascrizione: z.string().trim().max(20000).nullable().optional(),
  reportino: z.string().trim().max(20000).nullable().optional(),
  reportinoModello: z.string().trim().max(80).nullable().optional(),
});

export async function aggiornaRiunione(input: unknown): Promise<Result> {
  const parsed = AggiornaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };

  /**
   * ⚠️ **Questo controllo e' il seguito di `creaRiunione`, e dimenticarlo ha
   * fatto sparire i riassunti.**
   *
   * L'08/10 scrivere una riunione e' diventato di ogni tecnico in squadra, ma
   * **modificarla** era rimasto di admin/ufficio. Sembra un dettaglio e non lo
   * e': il riassunto dell'AI non si scrive alla creazione — la riunione nasce
   * prima, e il riassunto arriva con un `aggiornaRiunione` subito dopo. Quindi
   * per un tecnico la riunione si salvava, le cose da fare si creavano, e il
   * riassunto spariva. Misurato su due riunioni vere in produzione prima che
   * qualcuno se ne accorgesse.
   *
   * Un tecnico modifica **solo le proprie**: la RLS lo imporrebbe comunque
   * (`commessa_riunione_update_tecnico`), ma senza questo controllo l'update
   * colpirebbe zero righe e l'errore che arriverebbe a schermo parlerebbe di
   * righe non trovate invece che di permessi.
   */
  if (!FULL_ROLES.has(ctx.role)) {
    if (ctx.role !== 'tecnico') {
      return { ok: false, error: 'Non hai i permessi per modificare una riunione.' };
    }
    const supabaseCheck = createServerSupabase();
    const { data: riga } = await supabaseCheck
      .from('commessa_riunione' as never)
      .select('created_by')
      .eq('id', parsed.data.id)
      .maybeSingle();
    const autore = (riga as { created_by: string | null } | null)?.created_by ?? null;
    if (autore !== ctx.userId) {
      return { ok: false, error: 'Puoi modificare solo le riunioni che hai scritto tu.' };
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.dataRiunione !== undefined)
    update.data_riunione = parsed.data.dataRiunione;
  if (parsed.data.titolo !== undefined) update.titolo = parsed.data.titolo;
  if (parsed.data.corpoLibero !== undefined)
    update.corpo_libero = parsed.data.corpoLibero;
  if (parsed.data.trascrizione !== undefined)
    update.trascrizione = parsed.data.trascrizione;
  if (parsed.data.reportino !== undefined) {
    update.reportino = parsed.data.reportino;
    update.reportino_generato_at = new Date().toISOString();
  }
  if (parsed.data.reportinoModello !== undefined)
    update.reportino_modello = parsed.data.reportinoModello;

  if (Object.keys(update).length === 0)
    return { ok: false, error: 'Nessun campo da aggiornare' };

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commessa_riunione' as never)
    .update(update as never)
    .eq('id', parsed.data.id)
    .select('id, commessa_id')
    .single();
  if (error) return { ok: false, error: `Update fallito: ${error.message}` };

  const commessaId = (data as { commessa_id: string }).commessa_id;
  revalidatePath(`/office/commesse/${commessaId}`);
  return { ok: true };
}

// ─── DELETE ─────────────────────────────────────────────────────────

export async function eliminaRiunione(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };
  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  // Cancellare resta dell'ufficio, anche per l'autore: una riunione e' un
  // pezzo di storia del lavoro. Chi l'ha scritta la corregge, non la fa
  // sparire.
  if (!FULL_ROLES.has(ctx.role)) {
    return {
      ok: false,
      error: 'Una riunione la toglie solo l’ufficio. Se c’è un errore, correggila.',
    };
  }
  const supabase = createServerSupabase();
  const { data: r } = await supabase
    .from('commessa_riunione' as never)
    .select('commessa_id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!r) return { ok: false, error: 'Riunione non trovata' };

  // Cleanup allegati su storage cloud PRIMA del delete cascade
  const fileRefIds = await getRiunioneFileRefIds(parsed.data.id);
  if (fileRefIds.length > 0) {
    const cleanup = await cleanupAllegatoFiles({
      tenantId: ctx.tenantId,
      fileRefIds,
    });
    if (cleanup.errors.length > 0) {
      console.warn('[eliminaRiunione] cleanup errors', cleanup.errors);
    }
  }

  const { error } = await supabase
    .from('commessa_riunione' as never)
    .delete()
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: `Eliminazione fallita: ${error.message}` };

  await audit(
    ctx,
    'commessa.riunione.elimina',
    (r as { commessa_id: string }).commessa_id,
    parsed.data.id,
    {},
  );
  revalidatePath(`/office/commesse/${(r as { commessa_id: string }).commessa_id}`);
  return { ok: true };
}

// ─── AI REPORT + TODO EXTRACTION ─────────────────────────────────────

export interface TodoProposto {
  titolo: string;
  priorita: Priorita;
  note?: string;
}

export interface ReportRiunione {
  reportino: string;
  todo_proposti: TodoProposto[];
  modello: string;
  preview?: boolean;
  preview_reason?: string;
}

const GeneraInput = z.object({
  /** Testo libero scritto (può essere vuoto). */
  corpoLibero: z.string().max(20000).optional(),
  /** Trascrizione del dettato (può essere vuota). */
  trascrizione: z.string().max(20000).optional(),
  /** Contesto: nome cliente, codice commessa, indirizzo (per dare contesto al modello). */
  contestoCommessa: z.string().max(500).optional(),
  /** Numero foto allegate alla riunione (info al modello). */
  fotoCount: z.number().int().min(0).max(100).optional(),
  /** Numero PDF acquisiti allegati alla riunione. */
  pdfCount: z.number().int().min(0).max(100).optional(),
});

/**
 * Genera un riassunto + lista TODO proposti. NON salva nulla in DB —
 * il chiamante riceve il payload e decide cosa accettare/scartare.
 */
export async function generaReportRiunione(
  input: unknown,
): Promise<Result<ReportRiunione>> {
  const parsed = GeneraInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  // Qui non si scrive niente: si manda del testo all'AI e si riceve un
  // riassunto. Il presidio è la sessione — la stessa di tutte le altre
  // funzioni che usano l'AI e che un tecnico già adopera (dettatura, scontrini).

  const corpo = (parsed.data.corpoLibero ?? '').trim();
  const trasc = (parsed.data.trascrizione ?? '').trim();
  const testo = [corpo, trasc].filter(Boolean).join('\n\n— Trascrizione dettato —\n');
  if (testo.length < 20) {
    return {
      ok: false,
      error: 'Contenuto troppo breve per generare un report (almeno 20 caratteri).',
    };
  }

  // Modalità preview se OpenAI non configurato
  if (!isOpenAIConfigured()) {
    return {
      ok: true,
      data: {
        reportino:
          `**Riepilogo (preview locale)**\n\n${testo.slice(0, 500)}${testo.length > 500 ? '…' : ''}\n\n*(OpenAI non configurato: niente AI, mostro l'inizio del testo come stub.)*`,
        todo_proposti: [],
        modello: 'preview-stub',
        preview: true,
        preview_reason: 'OPENAI_API_KEY non configurata',
      },
    };
  }

  const system = `Sei un assistente che mette in ordine e in pulito i verbali di riunioni di cantiere/sopralluogo per un'impresa di impianti idro-termo-sanitari italiana.

Ricevi il verbale grezzo di una riunione (può essere scritto a mano o dettato a voce, italiano). Devi produrre:
1. un "reportino": il testo dell'utente RISCRITTO in italiano in modo chiaro, scorrevole e ben organizzato, in TESTO SEMPLICE (no markdown). Riordina e riscrivi il contenuto per renderlo ordinato e leggibile: NON tagliare contenuti, NON riassumere, NON sintetizzare, NON inventare nulla; mantieni tutto il senso e i dettagli inseriti dall'utente, correggi solo forma, ordine e leggibilità. Puoi usare "- " per elenchi puntati e a-capo per separare i temi. Tono asciutto, tecnico, professionale.
2. "todo_proposti": lista di azioni SOLO se esplicitamente menzionate nel verbale. Ogni TODO ha titolo breve (max 80 caratteri, imperativo: "Ordinare pompa…", "Chiamare Mario…"), priorita, SOLO uno fra urgente/alta/bassa (desumi dal tono: "subito"/"entro domani" → urgente; "appena puoi"/"settimana prossima" → alta; tutto il resto, compreso quando nessuno ha espresso fretta → bassa) e una note opzionale di contesto (max 200 caratteri).

REGOLE STRICT PER I TODO:
- Includi SOLO azioni che qualcuno ha dichiarato esplicitamente nel verbale ("dobbiamo fare X", "bisogna ordinare Y", "chiama Z"). NON aggiungere azioni logicamente sensate ma non menzionate.
- NON inventare TODO come "pianificare consegne", "eseguire sopralluogo", "verificare disponibilità" se nessuno li ha detti.
- Se il verbale menziona UN'azione specifica (es. "installare 5 pompe di calore"), crea SOLO quello. Non aggiungere azioni collaterali implicite.
- Se non emergono azioni esplicite, "todo_proposti" è un array vuoto — è OK.
- Non mettere come TODO cose già fatte/risolte durante la riunione.
- NESSUN markdown nel reportino: niente **grassetto**, niente *corsivo*, niente # heading, niente \`code\`. Solo testo piano con eventuali "- " per i bullet.
- Output STRICT JSON, nessun testo prima/dopo.`;

  // Conteggio allegati per dare contesto al modello — non leggiamo il
  // contenuto visivo/OCR (vision è scope futuro), ma il modello sa che
  // ci sono N foto e M PDF e può menzionarli nel reportino se rilevanti.
  const fotoN = parsed.data.fotoCount ?? 0;
  const pdfN = parsed.data.pdfCount ?? 0;
  const allegatiInfo =
    fotoN > 0 || pdfN > 0
      ? `\n\nAllegati alla riunione: ${fotoN} foto, ${pdfN} PDF acquisiti. Puoi citare la loro presenza nel reportino se il testo si riferisce a essi (es. "vedi foto allegate", "schema in PDF").`
      : '';

  const userPrompt = `${parsed.data.contestoCommessa ? `Contesto commessa: ${parsed.data.contestoCommessa}\n\n` : ''}Verbale grezzo:\n"""\n${testo}\n"""${allegatiInfo}\n\nRispondi con JSON: { "reportino": "...", "todo_proposti": [{ "titolo": "...", "priorita": "bassa|media|alta|urgente", "note": "..." }] }`;

  // gpt-5-mini va benissimo per reasoning + JSON; usiamo lo stesso default
  // del resto del progetto (configurabile via OPENAI_MODEL_CHAT).
  const model = process.env.OPENAI_MODEL_CHAT?.trim() || getChatModel();

  try {
    const completion = await chatCompletion({
      model,
      maxTokens: 2500,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    });

    const cleaned = completion.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsedJson: { reportino?: unknown; todo_proposti?: unknown };
    try {
      parsedJson = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: 'AI ha prodotto JSON non valido. Riprova.',
      };
    }

    const ReportSchema = z.object({
      reportino: z.string().min(1).max(20000),
      todo_proposti: z
        .array(
          z.object({
            titolo: z.string().trim().min(1).max(200),
            // Volutamente PERMISSIVO in ingresso e normalizzato in uscita: un
            // modello linguistico puo' restituire «media» anche se il prompt
            // dice tre livelli, e scartare l'intero verbale per una parola
            // sarebbe sproporzionato. `normalizzaPriorita` la traduce.
            priorita: z.string().transform(normalizzaPriorita),
            note: z.string().trim().max(500).optional(),
          }),
        )
        .max(20)
        .default([]),
    });
    const safe = ReportSchema.safeParse(parsedJson);
    if (!safe.success) {
      return { ok: false, error: 'AI ha prodotto schema non valido. Riprova.' };
    }

    // Sanitizer defensive: anche se il prompt dice "no markdown", a volte
    // il modello slippa con **grassetto** o *corsivo*. Strippiamo gli
    // asterischi delimitatori prima di restituire (mantenendo asterischi
    // genuini come quelli in "10*5cm", ecc. niente conflitti).
    const cleanReportino = stripBasicMarkdown(safe.data.reportino);

    return {
      ok: true,
      data: {
        reportino: cleanReportino,
        todo_proposti: safe.data.todo_proposti,
        modello: completion.model,
      },
    };
  } catch (e) {
    // AI non disponibile (crediti/quota/chiave/down): messaggio generico +
    // alert al super admin. Mai restituire il motivo tecnico all'utente.
    if (isAiUnavailable(e)) {
      await segnalaAiNonDisponibile({
        tenantId: ctx.tenantId,
        feature: 'riunione_reportino',
        model,
        status: e instanceof OpenAiError ? e.status ?? null : null,
        detail: e instanceof Error ? e.message : null,
      });
      return { ok: false, error: MSG_AI_NON_DISPONIBILE };
    }
    return { ok: false, error: 'Generazione non riuscita. Riprova.' };
  }
}

// ─── MATERIALIZZA TODO PROPOSTI ──────────────────────────────────────

const MaterializzaInput = z.object({
  commessaId: z.string().uuid(),
  riunioneId: z.string().uuid(),
  todos: z
    .array(
      z.object({
        titolo: z.string().trim().min(1).max(200),
        priorita: z.enum(PRIORITA),
        note: z.string().trim().max(500).optional(),
        assegnatoA: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function materializzaTodoDaRiunione(
  input: unknown,
): Promise<Result<{ ids: string[] }>> {
  const parsed = MaterializzaInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  // Le cose da fare che nascono dalla riunione passano dalla RLS di
  // `commessa_todo`, che per un tecnico accetta solo «a nessuno» o «a me
  // stesso» (migration 20261007100000). Qui si toglie l'assegnatario PRIMA,
  // invece di lasciare che sia il database a rifiutare: altrimenti il
  // messaggio che arriva a schermo sarebbe una violazione di policy, cioè
  // niente che una persona possa capire o correggere.
  const eTecnico = ctx.role === 'tecnico';

  const supabase = createServerSupabase();

  // Determina sort_order base
  const { data: maxRow } = await supabase
    .from('commessa_todo' as never)
    .select('sort_order')
    .eq('commessa_id', parsed.data.commessaId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const rows = parsed.data.todos.map((t) => ({
    tenant_id: ctx.tenantId,
    commessa_id: parsed.data.commessaId,
    titolo: t.titolo,
    descrizione: t.note ?? null,
    priorita: t.priorita,
    assegnato_a: eTecnico ? (t.assegnatoA === ctx.userId ? ctx.userId : null) : (t.assegnatoA ?? null),
    sort_order: nextOrder++,
    metadata: { fonte: `riunione:${parsed.data.riunioneId}` },
    created_by: ctx.userId,
  }));

  const { data, error } = await supabase
    .from('commessa_todo' as never)
    .insert(rows as never)
    .select('id');
  if (error) return { ok: false, error: `Insert TODO fallita: ${error.message}` };

  const ids = (data as Array<{ id: string }>).map((r) => r.id);
  await audit(
    ctx,
    'commessa.riunione.materializza_todo',
    parsed.data.commessaId,
    parsed.data.riunioneId,
    { todo_ids: ids, count: ids.length },
  );
  revalidatePath(`/office/commesse/${parsed.data.commessaId}`);
  revalidatePath(`/mobile/commessa/${parsed.data.commessaId}`);
  return { ok: true, data: { ids } };
}

// ─── helpers ────────────────────────────────────────────────────────

/** Data odierna in fuso Europe/Rome, formato YYYY-MM-DD. */
/**
 * Strippa markdown basic dal reportino AI per uniformità di rendering
 * (sia office che mobile usano whitespace-pre-wrap, NO renderer markdown):
 *  - **bold** o __bold__ → bold (senza delimitatori)
 *  - *italic* o _italic_ → italic
 *  - `code` → code
 *  - ### heading → heading
 *
 * Conservativo: non tocca asterischi singoli adiacenti a numeri o lettere
 * non-space (es. "10*5cm" resta intatto).
 */
function stripBasicMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/(?:^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, (m, inner) =>
      m.replace(`*${inner}*`, inner),
    )
    .replace(/(?:^|[\s(])_([^_\n]+?)_(?=[\s).,!?:;]|$)/g, (m, inner) =>
      m.replace(`_${inner}_`, inner),
    )
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

function localDateISO(): string {
  // toLocaleDateString con sv-SE produce direttamente YYYY-MM-DD; il TZ
  // del server (Vercel di solito UTC) viene compensato.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

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
  commessaId: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  // entity_type='commessa' + entity_id=commessaId così la tab Cronologia
  // include questi eventi sotto la commessa. L'id riunione → metadata.
  const supabase = createServerSupabase();
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa',
    entity_id: commessaId,
    action,
    metadata: {
      riunione_id: entityId,
      ...metadata,
    } as unknown as never,
  });
}
