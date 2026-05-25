'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import type { AppRole } from '@impiantixplus/api';

import {
  chatCompletion,
  getChatModel,
  isOpenAIConfigured,
} from '../_lib/openai';

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
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono creare una riunione' };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('commessa_riunione' as never)
    .insert({
      tenant_id: ctx.tenantId,
      commessa_id: parsed.data.commessaId,
      data_riunione: parsed.data.dataRiunione ?? new Date().toISOString().slice(0, 10),
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
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono modificare' };
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
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono eliminare' };
  }
  const supabase = createServerSupabase();
  const { data: r } = await supabase
    .from('commessa_riunione' as never)
    .select('commessa_id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!r) return { ok: false, error: 'Riunione non trovata' };
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

// ─── ALLEGATO ───────────────────────────────────────────────────────

const AllegatoInput = z.object({
  riunioneId: z.string().uuid(),
  fileRefId: z.string().uuid(),
  kind: z.enum(['foto', 'pdf_acquisito']),
});

export async function aggiungiAllegatoRiunione(
  input: unknown,
): Promise<Result> {
  const parsed = AllegatoInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido' };

  const ctx = await safeCtx();
  if (!ctx) return { ok: false, error: 'Sessione non valida' };
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono allegare' };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('commessa_riunione_allegato' as never)
    .upsert(
      {
        tenant_id: ctx.tenantId,
        riunione_id: parsed.data.riunioneId,
        file_ref_id: parsed.data.fileRefId,
        kind: parsed.data.kind,
      } as never,
      { onConflict: 'riunione_id,file_ref_id' },
    );
  if (error) return { ok: false, error: `Allegato fallito: ${error.message}` };
  return { ok: true };
}

// ─── AI REPORT + TODO EXTRACTION ─────────────────────────────────────

export interface TodoProposto {
  titolo: string;
  priorita: 'bassa' | 'media' | 'alta' | 'urgente';
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
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono generare il report' };
  }

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

  const system = `Sei un assistente che riepiloga riunioni di cantiere/sopralluogo per un'impresa di impianti idro-termo-sanitari italiani (Bertaiola Impianti).

Ricevi il verbale grezzo di una riunione (può essere scritto a mano o dettato a voce, italiano). Devi produrre:
1. un "reportino": riassunto sintetico in italiano, max 6 punti chiave, in markdown leggero (- elenco puntato, **grassetto** per evidenze). Linguaggio asciutto, tecnico, professionale.
2. "todo_proposti": una lista di azioni concrete e verificabili emerse dalla riunione che sembrano "cose da fare". Ogni TODO ha titolo breve (max 80 caratteri, imperativo: "Ordinare pompa…", "Chiamare Mario…"), priorita (bassa/media/alta/urgente — desumi dal tono: "subito"/"entro domani" → urgente; "appena puoi"/"settimana prossima" → media; "quando capita" → bassa) e una note opzionale di contesto (max 200 caratteri).

REGOLE:
- Non inventare azioni: includi SOLO quelle esplicitamente menzionate o chiaramente implicate.
- Se non emergono azioni, "todo_proposti" è un array vuoto.
- Non mettere come TODO cose già fatte/risolte durante la riunione.
- Output STRICT JSON, nessun testo prima/dopo.`;

  const userPrompt = `${parsed.data.contestoCommessa ? `Contesto commessa: ${parsed.data.contestoCommessa}\n\n` : ''}Verbale grezzo:\n"""\n${testo}\n"""\n\nRispondi con JSON: { "reportino": "...", "todo_proposti": [{ "titolo": "...", "priorita": "bassa|media|alta|urgente", "note": "..." }] }`;

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
            priorita: z.enum(['bassa', 'media', 'alta', 'urgente']),
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

    return {
      ok: true,
      data: {
        reportino: safe.data.reportino,
        todo_proposti: safe.data.todo_proposti,
        modello: completion.model,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 300) : 'Errore OpenAI',
    };
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
        priorita: z.enum(['bassa', 'media', 'alta', 'urgente']),
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
  if (!FULL_ROLES.has(ctx.role)) {
    return { ok: false, error: 'Solo admin/office possono creare TODO' };
  }

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
    assegnato_a: t.assegnatoA ?? null,
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
  const supabase = createServerSupabase();
  await supabase.from('audit_events').insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.userId,
    actor_role: ctx.role,
    entity_type: 'commessa_riunione',
    entity_id: entityId,
    action,
    metadata: {
      commessa_id: commessaId,
      ...metadata,
    } as unknown as never,
  });
}
