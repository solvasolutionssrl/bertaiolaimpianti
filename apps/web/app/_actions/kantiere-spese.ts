'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { CATEGORIE_SPESA, calcolaImponibile, normalizzaCategoria } from '@kommessa/api/spese';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';

import { tenantHasModule } from '@/app/_lib/modules';
import { mioTurnoAttivo } from '@/app/mobile/kantiere/_lib/turno-attivo';
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

const CreaSchema = z.object({
  r2Key: z.string().min(1).max(500),
  r2ThumbKey: z.string().min(1).max(500).nullable().optional(),
  mime: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive().max(8 * 1024 * 1024),
  ragioneSociale: z.string().trim().max(200).nullable().optional(),
  categoria: z.enum(CATEGORIE_SPESA),
  importoTotale: z.number().finite().positive(),
  importoIva: z.number().finite().nonnegative().nullable().optional(),
  valuta: z.string().trim().min(1).max(8).default('EUR'),
  dataScontrino: z.string().datetime({ offset: true }).nullable().optional(),
  partitaIva: z.string().trim().max(40).nullable().optional(),
  metodoPagamento: z.enum(['contanti', 'carta', 'altro']).nullable().optional(),
  numeroDocumento: z.string().trim().max(60).nullable().optional(),
  indirizzoEsercente: z.string().trim().max(200).nullable().optional(),
  numeroPersone: z.number().int().positive().max(99).default(1),
  note: z.string().trim().max(2000).nullable().optional(),
  aiRaw: z.unknown().optional(),
});

/**
 * Risolve il cantiere a cui agganciare la spesa:
 *  1) turno attivo (lavoro o pausa) → quel cantiere;
 *  2) fallback: se nel giorno dello scontrino il dipendente ha timbrato su un
 *     SOLO cantiere, usa quello;
 *  3) altrimenti null ("da assegnare").
 */
async function agganciaCantiere(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  dipId: string,
  dataScontrinoIso: string | null,
): Promise<string | null> {
  const turno = await mioTurnoAttivo();
  if (turno) return turno.cantiereId;

  if (!dataScontrinoIso) return null;
  const giorno = romeDay(new Date(dataScontrinoIso));
  const { fromIso, toIso } = romeDayBoundsUtc(giorno);
  const { data: rows } = await supabase
    .from('timbrature' as never)
    .select('cantiere_id')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipId)
    .not('cantiere_id', 'is', null)
    .gte('ts', fromIso)
    .lt('ts', toIso);
  const cantieri = new Set(
    ((rows as { cantiere_id: string | null }[] | null) ?? [])
      .map((r) => r.cantiere_id)
      .filter((x): x is string => !!x),
  );
  return cantieri.size === 1 ? [...cantieri][0]! : null;
}

export async function creaSpesa(input: z.input<typeof CreaSchema>): Promise<Risultato> {
  const parsed = CreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'DATI_NON_VALIDI' };
  const d = parsed.data;

  const ctx = await requireTenantContext();
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_ASSENTE' };

  const supabase = createServerSupabase();
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const dipId = (dipRow as { id: string } | null)?.id;
  if (!dipId) return { ok: false, error: 'DIPENDENTE_ASSENTE' };

  const cantiereId = await agganciaCantiere(
    supabase,
    ctx.tenantId,
    dipId,
    d.dataScontrino ?? null,
  );

  // commessa derivata dal cantiere (se collegato a una commessa)
  let commessaId: string | null = null;
  if (cantiereId) {
    const { data: cant } = await supabase
      .from('cantieri' as never)
      .select('commessa_id')
      .eq('id', cantiereId)
      .maybeSingle();
    commessaId = (cant as { commessa_id: string | null } | null)?.commessa_id ?? null;
  }

  const imponibile = calcolaImponibile(d.importoTotale, d.importoIva ?? null);

  const { data: inserted, error } = await supabase
    .from('spese' as never)
    .insert({
      tenant_id: ctx.tenantId,
      dipendente_id: dipId,
      cantiere_id: cantiereId,
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
      r2_key: d.r2Key,
      r2_thumb_key: d.r2ThumbKey ?? null,
      foto_mime: d.mime,
      foto_size_bytes: d.sizeBytes,
      stato: 'confermata',
      ai_raw: (d.aiRaw as object | undefined) ?? null,
    } as never)
    .select('id')
    .single();

  if (error) {
    // DB fallito dopo l'upload /scan: rimuovi la foto orfana da R2.
    await cancellaR2BestEffort(ctx.tenantId, [d.r2Key, d.r2ThumbKey]);
    return { ok: false, error: error.message };
  }

  revalidatePath('/mobile/kantiere/spese');
  revalidatePath('/office/kantiere/kontabilita');
  return { ok: true, id: (inserted as { id: string }).id };
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
  metodoPagamento: z.enum(['contanti', 'carta', 'altro']).nullable().optional(),
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
  let commessaId: string | null = null;
  if (d.cantiereId) {
    const { data: cant } = await service
      .from('cantieri' as never)
      .select('id, tenant_id, commessa_id')
      .eq('id', d.cantiereId)
      .maybeSingle();
    const cantRow = cant as { id: string; tenant_id: string; commessa_id: string | null } | null;
    if (!cantRow || cantRow.tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'CANTIERE_NON_VALIDO' };
    }
    commessaId = cantRow.commessa_id ?? null;
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
  metodoPagamento: z.enum(['contanti', 'carta', 'altro']).nullable().optional(),
  numeroPersone: z.number().int().positive().max(99).optional(),
  dataScontrino: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
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
  if (d.cantiereId !== undefined) patch.cantiere_id = d.cantiereId;
  if (d.ragioneSociale !== undefined) patch.ragione_sociale = d.ragioneSociale;
  if (d.note !== undefined) patch.note = d.note;
  if (d.metodoPagamento !== undefined) patch.metodo_pagamento = d.metodoPagamento;
  if (d.numeroPersone !== undefined) patch.numero_persone = d.numeroPersone;
  if (d.dataScontrino !== undefined) patch.data_scontrino = d.dataScontrino;
  if (d.importoTotale !== undefined) patch.importo_totale = d.importoTotale;
  if (d.importoIva !== undefined) patch.importo_iva = d.importoIva;
  if (d.importoTotale !== undefined || d.importoIva !== undefined) {
    const tot = d.importoTotale ?? prevRow.importo_totale ?? null;
    const iva = d.importoIva !== undefined ? d.importoIva : prevRow.importo_iva ?? null;
    patch.imponibile = calcolaImponibile(tot, iva);
  }
  // riassegnando il cantiere, riallinea la commessa derivata
  if (d.cantiereId) {
    const { data: cant } = await supabase
      .from('cantieri' as never)
      .select('commessa_id')
      .eq('id', d.cantiereId)
      .maybeSingle();
    patch.commessa_id = (cant as { commessa_id: string | null } | null)?.commessa_id ?? null;
  } else if (d.cantiereId === null) {
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
  await requireTenantContext();
  const supabase = createServerSupabase();
  const { error } = await supabase.from('spese' as never).delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/office/kantiere/kontabilita');
  revalidatePath('/mobile/kantiere/spese');
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
