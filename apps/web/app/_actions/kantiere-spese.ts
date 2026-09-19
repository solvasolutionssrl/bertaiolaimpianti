'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { CATEGORIE_SPESA, calcolaImponibile, normalizzaCategoria } from '@kommessa/api/spese';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { leggiMetodiPagamento } from '@/app/_lib/metodi-pagamento';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';
import { chiaviSpeseValide } from '@/app/api/kantiere/spese/_lib/r2-spese';
import { processSpesaAI } from '@/app/api/kantiere/spese/_lib/analisi-spesa';
import { auditTenant } from '@/app/_actions/_lib/audit';
import { cantiereScrivibile } from '@/app/_actions/_lib/lavoro-aperto';
import {
  buildSnapshotSpesa,
  diffSnapshotSpesa,
  type SpesaRowForSnapshot,
  type DiffEntry,
} from '@/app/_lib/versioni/snapshot-spesa';
import { scriviVersioneSpesa } from '@/app/_actions/_lib/scrivi-versione-spesa';
import { nomeUtente } from '@/app/_actions/_lib/scrivi-versione';

type Risultato = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Cancella best-effort le chiavi R2 di una spesa (foto + thumb) quando la riga
 * DB non viene creata: evita di lasciare file orfani caricati da /scan. Risolve
 * il provider come la route scan (config tenant con fallback env). Non lancia
 * mai: l'orfano è benigno, non deve a sua volta far fallire il flusso.
 */
async function cancellaR2BestEffort(
  tenantId: string,
  keys: (string | null | undefined)[],
): Promise<void> {
  const presenti = keys.filter((k): k is string => !!k);
  if (presenti.length === 0) return;
  try {
    const service = createServiceSupabase();
    const { data: t } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', tenantId)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig((t?.r2_config as Record<string, unknown> | null) ?? null) ??
      getR2ProviderFromEnv();
    if (!r2) return;
    for (const k of presenti) {
      try {
        await r2.delete(k);
      } catch {
        // singola chiave non cancellabile: ignora
      }
    }
  } catch {
    // best-effort: l'orfano R2 non blocca nulla
  }
}

/**
 * Il metodo di pagamento non e' piu' un elenco chiuso: lo gestisce l'ufficio da
 * Impostazioni > Pagamenti. Qui si controlla solo la forma; che il codice esista
 * per QUESTO cliente lo verifica `metodoAmmesso` prima di scrivere — altrimenti
 * un client modificato potrebbe infilare qualunque testo nel database.
 */
const MetodoPagamentoSchema = z.string().trim().min(2).max(40).nullable().optional();

/**
 * Il codice appartiene all'elenco del cliente?
 *
 * Si guardano anche quelli ritirati: modificare una spesa vecchia non deve
 * costringere a cambiarle anche il metodo di pagamento.
 */
async function metodoAmmesso(
  supabase: Parameters<typeof leggiMetodiPagamento>[0],
  tenantId: string,
  codice: string | null | undefined,
): Promise<boolean> {
  if (codice === null || codice === undefined) return true;
  const metodi = await leggiMetodiPagamento(supabase, tenantId);
  return metodi.some((m) => m.codice === codice);
}

const CreaOfficeSchema = z.object({
  dipendenteId: z.string().uuid(),
  cantiereId: z.string().uuid().nullable().optional(),
  categoria: z.enum(CATEGORIE_SPESA),
  importoTotale: z.number().finite().positive(),
  importoIva: z.number().finite().nonnegative().nullable().optional(),
  valuta: z.string().trim().min(1).max(8).default('EUR'),
  ragioneSociale: z.string().trim().max(200).nullable().optional(),
  dataScontrino: z.string().datetime({ offset: true }).nullable().optional(),
  partitaIva: z.string().trim().max(40).nullable().optional(),
  metodoPagamento: MetodoPagamentoSchema,
  numeroDocumento: z.string().trim().max(60).nullable().optional(),
  indirizzoEsercente: z.string().trim().max(200).nullable().optional(),
  numeroPersone: z.number().int().positive().max(99).default(1),
  note: z.string().trim().max(2000).nullable().optional(),
  // foto opzionale (caricata via /scan prima del salvataggio)
  r2Key: z.string().min(1).max(500).nullable().optional(),
  r2ThumbKey: z.string().min(1).max(500).nullable().optional(),
  mime: z.string().min(1).max(127).nullable().optional(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).nullable().optional(),
  aiRaw: z.unknown().optional(),
  /**
   * L'ufficio ha confermato di voler scrivere su un cantiere chiuso. Senza
   * questo la scrittura viene rifiutata con `CANTIERE_CHIUSO`, cosi' la UI sa
   * che deve chiedere conferma invece di mostrare un errore.
   */
  forzato: z.boolean().optional(),
});

/**
 * Creazione spesa lato OFFICE/ADMIN per conto di un dipendente scelto.
 * Usa service role (la RLS consente l'insert solo "le proprie"): il permesso
 * e' garantito qui dal controllo di ruolo + scoping esplicito al tenant.
 */
export async function creaSpesaOffice(
  input: z.input<typeof CreaOfficeSchema>,
): Promise<Risultato> {
  const parsed = CreaOfficeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const d = parsed.data;

  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { ok: false, error: 'NON_AUTORIZZATO' };
  }
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };
  if (!(await chiaviSpeseValide(ctx.tenantId, [d.r2Key, d.r2ThumbKey]))) {
    return { ok: false, error: 'CHIAVE_NON_VALIDA' };
  }
  if (!(await kontabilitaAttiva(createServiceSupabase(), ctx.tenantId))) {
    return { ok: false, error: 'KONTABILITA_ASSENTE' };
  }

  const service = createServiceSupabase();

  // dipendente scelto deve appartenere al tenant del chiamante
  const { data: dip } = await service
    .from('dipendenti' as never)
    .select('id, tenant_id')
    .eq('id', d.dipendenteId)
    .maybeSingle();
  const dipRow = dip as { id: string; tenant_id: string } | null;
  if (!dipRow || dipRow.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'DIPENDENTE_NON_VALIDO' };
  }

  // cantiere (se scelto) deve appartenere al tenant → ricava commessa
  // L'ufficio da computer puo' sempre registrare, anche su un cantiere chiuso:
  // gli si chiede solo conferma (`forzato`). Dall'app questa strada non esiste.
  let commessaId: string | null = null;
  if (d.cantiereId) {
    const scrivibile = await cantiereScrivibile(service, d.cantiereId, ctx.tenantId, {
      forzato: d.forzato,
    });
    if (!scrivibile.ok) return { ok: false, error: scrivibile.error };
    commessaId = scrivibile.commessaId ?? null;
  }

  // Il codice del metodo deve stare nell'elenco di QUESTO cliente: lo schema
  // controlla la forma, non l'appartenenza.
  if (!(await metodoAmmesso(service, ctx.tenantId, d.metodoPagamento))) {
    return { ok: false, error: 'Metodo di pagamento non valido.' };
  }
  const imponibile = calcolaImponibile(d.importoTotale, d.importoIva ?? null);

  const { data: inserted, error } = await service
    .from('spese' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: d.dipendenteId,
      cantiere_id: d.cantiereId ?? null,
      commessa_id: commessaId,
      categoria: d.categoria,
      ragione_sociale: d.ragioneSociale ?? null,
      importo_totale: d.importoTotale,
      importo_iva: d.importoIva ?? null,
      imponibile,
      valuta: d.valuta,
      partita_iva: d.partitaIva ?? null,
      metodo_pagamento: d.metodoPagamento ?? null,
      numero_documento: d.numeroDocumento ?? null,
      indirizzo_esercente: d.indirizzoEsercente ?? null,
      numero_persone: d.numeroPersone,
      data_scontrino: d.dataScontrino ?? null,
      r2_key: d.r2Key ?? null,
      r2_thumb_key: d.r2ThumbKey ?? null,
      foto_mime: d.mime ?? null,
      foto_size_bytes: d.sizeBytes ?? null,
      stato: 'confermata',
      ai_raw: (d.aiRaw as object | undefined) ?? null,
    } as never)
    .select('id')
    .single();

  if (error) {
    await cancellaR2BestEffort(ctx.tenantId, [d.r2Key, d.r2ThumbKey]);
    return { ok: false, error: error.message };
  }

  revalidatePath('/office/kantiere/kontabilita');
  return { ok: true, id: (inserted as { id: string }).id };
}

const AggiornaSchema = z.object({
  id: z.string().uuid(),
  categoria: z.enum(CATEGORIE_SPESA).optional(),
  cantiereId: z.string().uuid().nullable().optional(),
  ragioneSociale: z.string().trim().max(200).nullable().optional(),
  importoTotale: z.number().finite().positive().optional(),
  importoIva: z.number().finite().nonnegative().nullable().optional(),
  metodoPagamento: MetodoPagamentoSchema,
  numeroPersone: z.number().int().positive().max(99).optional(),
  dataScontrino: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  /** Conferma dell'ufficio per riassegnare la spesa a un cantiere chiuso. */
  forzato: z.boolean().optional(),
});

const SNAP_COLS =
  'categoria, cantiere_id, ragione_sociale, importo_totale, importo_iva, metodo_pagamento, numero_persone, data_scontrino, note';

/**
 * Modifica una spesa (ufficio). Solo owner/admin/office (i tecnici sono sola
 * lettura). Scrive una versione in `spese_versioni` ad ogni modifica reale
 * (best-effort: se la tabella non è ancora applicata, la modifica passa lo stesso).
 */
export async function aggiornaSpesa(input: z.input<typeof AggiornaSchema>): Promise<Risultato> {
  const parsed = AggiornaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const d = parsed.data;

  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { ok: false, error: 'NON_AUTORIZZATO' };
  }
  const supabase = createServerSupabase();

  // Stato PRIMA (per snapshot versione + ricalcolo imponibile).
  const { data: prev } = await supabase
    .from('spese' as never)
    .select(SNAP_COLS)
    .eq('id', d.id)
    .maybeSingle();
  const prevRow = prev as SpesaRowForSnapshot | null;
  if (!prevRow) return { ok: false, error: 'NON_TROVATA' };

  const patch: Record<string, unknown> = {};
  if (d.categoria !== undefined) patch.categoria = normalizzaCategoria(d.categoria);
  if (d.ragioneSociale !== undefined) patch.ragione_sociale = d.ragioneSociale;
  if (d.note !== undefined) patch.note = d.note;
  if (d.metodoPagamento !== undefined) {
    if (!(await metodoAmmesso(supabase, ctx.tenantId, d.metodoPagamento))) {
      return { ok: false, error: 'Metodo di pagamento non valido.' };
    }
    patch.metodo_pagamento = d.metodoPagamento;
  }
  if (d.numeroPersone !== undefined) patch.numero_persone = d.numeroPersone;
  if (d.dataScontrino !== undefined) patch.data_scontrino = d.dataScontrino;
  if (d.importoTotale !== undefined) patch.importo_totale = d.importoTotale;
  if (d.importoIva !== undefined) patch.importo_iva = d.importoIva;
  if (d.importoTotale !== undefined || d.importoIva !== undefined) {
    const tot = d.importoTotale ?? prevRow.importo_totale ?? null;
    const iva = d.importoIva !== undefined ? d.importoIva : prevRow.importo_iva ?? null;
    patch.imponibile = calcolaImponibile(tot, iva);
  }
  // Riassegnando il cantiere: prima si VALIDA che appartenga al tenant (lettura
  // RLS-scoped → null se di un altro tenant), poi si scrive cantiere_id + la
  // commessa derivata. Evita di puntare la spesa al cantiere di un altro tenant.
  if (d.cantiereId) {
    const scrivibile = await cantiereScrivibile(supabase, d.cantiereId, ctx.tenantId, {
      forzato: d.forzato,
    });
    if (!scrivibile.ok) return { ok: false, error: scrivibile.error };
    patch.cantiere_id = d.cantiereId;
    patch.commessa_id = scrivibile.commessaId ?? null;
  } else if (d.cantiereId === null) {
    patch.cantiere_id = null;
    patch.commessa_id = null;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase.from('spese' as never).update(patch as never).eq('id', d.id);
  if (error) return { ok: false, error: error.message };

  // Versione (best-effort): snapshot DOPO + diff coi campi labelati.
  try {
    const pick = <T,>(k: string, cur: T): T => (k in patch ? (patch[k] as T) : cur);
    const dopoRow: SpesaRowForSnapshot = {
      categoria: pick('categoria', prevRow.categoria),
      cantiere_id: pick('cantiere_id', prevRow.cantiere_id),
      ragione_sociale: pick('ragione_sociale', prevRow.ragione_sociale),
      importo_totale: pick('importo_totale', prevRow.importo_totale),
      importo_iva: pick('importo_iva', prevRow.importo_iva),
      metodo_pagamento: pick('metodo_pagamento', prevRow.metodo_pagamento),
      numero_persone: pick('numero_persone', prevRow.numero_persone),
      data_scontrino: pick('data_scontrino', prevRow.data_scontrino),
      note: pick('note', prevRow.note),
    };
    const diff = diffSnapshotSpesa(buildSnapshotSpesa(prevRow), buildSnapshotSpesa(dopoRow));
    if (diff.length > 0) {
      const nome = await nomeUtente(supabase, ctx.userId);
      await scriviVersioneSpesa(supabase, {
        tenantId: ctx.tenantId,
        spesaId: d.id,
        snapshot: buildSnapshotSpesa(dopoRow),
        diff,
        azione: 'modifica',
        modificatoDa: ctx.userId,
        modificatoDaNome: nome,
      });
    }
  } catch {
    // versioning best-effort: non blocca la modifica
  }

  revalidatePath('/office/kantiere/kontabilita');
  revalidatePath('/mobile/kantiere/spese');
  return { ok: true };
}

export async function eliminaSpesa(id: string): Promise<Risultato> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID_NON_VALIDO' };
  // Guard coerente con le altre azioni spese (prima si affidava solo a RLS →
  // un tecnico riceveva un finto ok senza cancellare nulla). Scoping tenant
  // esplicito sulla delete (difesa in profondità oltre a RLS).
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) {
    return { ok: false, error: 'NON_AUTORIZZATO' };
  }
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('spese' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  // Azione distruttiva → traccia (prima non lasciava alcun log).
  await auditTenant(supabase, {
    tenantId: ctx.tenantId, actorUserId: ctx.userId, actorRole: ctx.role,
    entityType: 'spesa', entityId: id, action: 'spesa.elimina',
  });
  revalidatePath('/office/kantiere/kontabilita');
  revalidatePath('/mobile/kantiere/spese');
  return { ok: true };
}

/**
 * Ri-lancia l'analisi AII di una spesa (recovery per righe rimaste in
 * 'in_elaborazione' se il task in background è morto, o per ri-leggere una
 * ricevuta finita in 'bozza'). Permesso: office/admin/owner oppure il proprietario
 * della spesa. Rimette lo stato a 'in_elaborazione' e processa in background.
 */
export async function rianalizzaSpesa(id: string): Promise<Risultato> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID_NON_VALIDO' };
  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };

  const service = createServiceSupabase();
  const { data: row } = await service
    .from('spese' as never)
    .select('id, tenant_id, dipendente_id, r2_key')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  const spesa = row as { id: string; dipendente_id: string; r2_key: string | null } | null;
  if (!spesa) return { ok: false, error: 'NON_TROVATA' };
  if (!spesa.r2_key) return { ok: false, error: 'FOTO_ASSENTE' };

  const manager = ['owner', 'admin', 'office'].includes(ctx.role);
  if (!manager) {
    // Un tecnico può rianalizzare solo le PROPRIE spese.
    const { data: mio } = await service
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const mioDip = (mio as { id: string } | null)?.id;
    if (!mioDip || mioDip !== spesa.dipendente_id) return { ok: false, error: 'NON_AUTORIZZATO' };
  }

  await service
    .from('spese' as never)
    .update({ stato: 'in_elaborazione', analisi_errore: null } as never)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);

  waitUntil(
    processSpesaAI({ tenantId: ctx.tenantId, spesaId: id }).catch(() => {
      /* resta in elaborazione → riprovabile */
    }),
  );

  revalidatePath('/mobile/kantiere/spese');
  revalidatePath('/office/kantiere/kontabilita');
  return { ok: true };
}

export type VersioneSpesa = {
  versione: number;
  azione: string;
  diff: DiffEntry[];
  modificatoDaNome: string | null;
  createdAt: string;
};

/** Cronologia modifiche di una spesa (owner/admin/office). Best-effort. */
export async function cronologiaSpesa(
  id: string,
): Promise<{ ok: true; versioni: VersioneSpesa[] } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'ID_NON_VALIDO' };
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) return { ok: false, error: 'NON_AUTORIZZATO' };
  const supabase = createServerSupabase();
  try {
    const { data, error } = await supabase
      .from('spese_versioni' as never)
      .select('versione, azione, diff, modificato_da_nome, created_at')
      .eq('spesa_id', id)
      .order('versione', { ascending: false })
      .limit(20);
    if (error) return { ok: true, versioni: [] }; // tabella non applicata → vuota
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    return {
      ok: true,
      versioni: rows.map((r) => ({
        versione: Number(r.versione),
        azione: String(r.azione),
        diff: (r.diff as DiffEntry[]) ?? [],
        modificatoDaNome: (r.modificato_da_nome as string | null) ?? null,
        createdAt: String(r.created_at),
      })),
    };
  } catch {
    return { ok: true, versioni: [] };
  }
}
