'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireTenantContext } from '@kommessa/api/tenant';
import { createServiceSupabase } from '@kommessa/api/service';
import {
  getR2ProviderFromEnv,
  getR2ProviderFromTenantConfig,
} from '@kommessa/integrations/storage';
import { risolviCausale } from '@kommessa/api/paghe-essepaghe';
import { causaleEssePaghe } from '@kommessa/api/paghe-causali';
import { estremiDelMese, giorniDelPeriodo, tipoGiorno } from '@kommessa/api/paghe-mappatura';

import { tenantHasModule } from '@/app/_lib/modules';
import { configPagheDa } from '@/app/_lib/paghe-config';
import { auditTenant } from '@/app/_actions/_lib/audit';

/**
 * Azioni dell'export verso il programma paghe.
 *
 * Tutte passano dal service role dopo una guardia esplicita, come per ferie e
 * permessi: in lettura la tabella e' aperta solo all'ufficio, in scrittura a
 * nessuno. Ogni modifica finisce nel registro delle attivita': qui si tocca
 * quello che finira' in busta paga, e fra tre mesi deve essere possibile
 * risalire a chi ha scritto cosa.
 */

const PERCORSO = '/office/personalizzazioni/paghe';

export type EsitoPaghe = { ok: true; id?: string; quanti?: number } | { ok: false; error: string };

const PERIODO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'periodo non valido');
const GIORNO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data non valida');
const CODICE_CAUSALE = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9#+@]{2,4}$/, 'codice causale non valido');

type Service = ReturnType<typeof createServiceSupabase>;

async function contesto() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) return null;
  if (!(await tenantHasModule('paghe'))) return null;
  return ctx;
}

async function configGrezza(service: Service, tenantId: string): Promise<Record<string, unknown>> {
  const { data } = await service
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'paghe')
    .maybeSingle();
  return (data as { config: Record<string, unknown> | null } | null)?.config ?? {};
}

async function scriviConfig(
  service: Service,
  tenantId: string,
  config: Record<string, unknown>,
): Promise<string | null> {
  const { error } = await service
    .from('tenant_modules' as never)
    .update({ config, configured_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .eq('module_code', 'paghe');
  return error?.message ?? null;
}

/** Il dipendente deve essere di chi sta scrivendo. */
async function dipendenteDelTenant(
  service: Service,
  tenantId: string,
  dipendenteId: string,
): Promise<boolean> {
  const { data } = await service
    .from('dipendenti' as never)
    .select('id, tenant_id')
    .eq('id', dipendenteId)
    .maybeSingle();
  return (data as { tenant_id: string } | null)?.tenant_id === tenantId;
}

// ---------------------------------------------------------------------------
// Impostazioni e dizionario
// ---------------------------------------------------------------------------

const ImpostazioniSchema = z.object({
  codiceDitta: z.string().trim().max(7),
  programmaPresenze: z.string().trim().min(1).max(15),
  arrotondamentoMinuti: z.number().int().min(0).max(60),
  straordinarioFeriale: CODICE_CAUSALE,
  straordinarioSabato: CODICE_CAUSALE,
  straordinarioFestivo: CODICE_CAUSALE,
  viaggioEccedente: CODICE_CAUSALE,
});

export async function salvaImpostazioniPaghe(
  input: z.input<typeof ImpostazioniSchema>,
): Promise<EsitoPaghe> {
  const parsed = ImpostazioniSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const grezza = await configGrezza(service, ctx.tenantId);
  const prima = configPagheDa(grezza);

  const d = parsed.data;
  for (const codice of [
    d.straordinarioFeriale,
    d.straordinarioSabato,
    d.straordinarioFestivo,
    d.viaggioEccedente,
  ]) {
    if (!risolviCausale(codice, prima.causaliExtra)) {
      return { ok: false, error: `La causale ${codice} non esiste nella tabella delle causali.` };
    }
  }

  const regole = {
    ...(typeof grezza['regole_causali'] === 'object' && grezza['regole_causali']
      ? (grezza['regole_causali'] as Record<string, unknown>)
      : {}),
    straordinarioFeriale: d.straordinarioFeriale,
    straordinarioSabato: d.straordinarioSabato,
    straordinarioFestivo: d.straordinarioFestivo,
    viaggioEccedente: d.viaggioEccedente,
    arrotondamentoMinuti: d.arrotondamentoMinuti,
  };

  const errore = await scriviConfig(service, ctx.tenantId, {
    ...grezza,
    codice_ditta: d.codiceDitta,
    programma_presenze: d.programmaPresenze,
    regole_causali: regole,
  });
  if (errore) return { ok: false, error: errore };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe',
    action: 'paghe.impostazioni.update',
    before: { codiceDitta: prima.codiceDitta, regole: prima.regole },
    after: { codiceDitta: d.codiceDitta, regole },
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

const CausaleAssenzaSchema = z.object({
  tipo: z.string().trim().min(1).max(60),
  /** Vuoto significa tornare a non avere una scelta. */
  causale: z.union([CODICE_CAUSALE, z.literal('')]),
});

/** Decide con quale causale si comunica un tipo di assenza di Kommessa. */
export async function impostaCausaleAssenza(
  input: z.input<typeof CausaleAssenzaSchema>,
): Promise<EsitoPaghe> {
  const parsed = CausaleAssenzaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const grezza = await configGrezza(service, ctx.tenantId);
  const config = configPagheDa(grezza);

  if (parsed.data.causale && !risolviCausale(parsed.data.causale, config.causaliExtra)) {
    return { ok: false, error: 'Causale non riconosciuta.' };
  }

  const regoleSalvate =
    typeof grezza['regole_causali'] === 'object' && grezza['regole_causali']
      ? (grezza['regole_causali'] as Record<string, unknown>)
      : {};
  const assenze = {
    ...(typeof regoleSalvate['assenze'] === 'object' && regoleSalvate['assenze']
      ? (regoleSalvate['assenze'] as Record<string, unknown>)
      : {}),
    [parsed.data.tipo]: parsed.data.causale || null,
  };

  const errore = await scriviConfig(service, ctx.tenantId, {
    ...grezza,
    regole_causali: { ...regoleSalvate, assenze },
  });
  if (errore) return { ok: false, error: errore };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe',
    action: 'paghe.causale.assenza',
    after: { tipo: parsed.data.tipo, causale: parsed.data.causale || null },
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

const CausaleNuovaSchema = z.object({
  codice: CODICE_CAUSALE,
  descrizione: z.string().trim().min(2).max(80),
  famiglia: z.enum(['evento', 'straordinario']),
  record: z.enum(['12', '14']),
});

/** Apre una causale che nella tabella importata non c'e'. */
export async function aggiungiCausalePersonalizzata(
  input: z.input<typeof CausaleNuovaSchema>,
): Promise<EsitoPaghe> {
  const parsed = CausaleNuovaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const gia = causaleEssePaghe(parsed.data.codice);
  if (gia) {
    return {
      ok: false,
      error: `Il codice ${parsed.data.codice} esiste gia' in tabella: ${gia.descrizione}.`,
    };
  }

  const service = createServiceSupabase();
  const grezza = await configGrezza(service, ctx.tenantId);
  const config = configPagheDa(grezza);
  if (config.causaliExtra.some((c) => c.codice === parsed.data.codice)) {
    return { ok: false, error: 'Questa causale e' + "' gia' stata aggiunta." };
  }

  const extra = [
    ...config.causaliExtra.map((c) => ({
      codice: c.codice,
      descrizione: c.descrizione,
      famiglia: c.famiglia,
      record: c.record,
    })),
    parsed.data,
  ];

  const errore = await scriviConfig(service, ctx.tenantId, { ...grezza, causali_extra: extra });
  if (errore) return { ok: false, error: errore };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe',
    action: 'paghe.causale.crea',
    after: parsed.data,
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

export async function eliminaCausalePersonalizzata(codice: string): Promise<EsitoPaghe> {
  const parsed = CODICE_CAUSALE.safeParse(codice);
  if (!parsed.success) return { ok: false, error: 'Codice non valido.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const grezza = await configGrezza(service, ctx.tenantId);
  const config = configPagheDa(grezza);
  const extra = config.causaliExtra
    .filter((c) => c.codice !== parsed.data)
    .map((c) => ({
      codice: c.codice,
      descrizione: c.descrizione,
      famiglia: c.famiglia,
      record: c.record,
    }));

  const errore = await scriviConfig(service, ctx.tenantId, { ...grezza, causali_extra: extra });
  if (errore) return { ok: false, error: errore };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe',
    action: 'paghe.causale.elimina',
    before: { codice: parsed.data },
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Variazioni scritte a mano
// ---------------------------------------------------------------------------

const EventoSchema = z.object({
  id: z.string().uuid().optional(),
  periodo: PERIODO,
  dipendenteId: z.string().uuid(),
  causale: CODICE_CAUSALE,
  dal: GIORNO,
  al: GIORNO,
  ore: z.number().min(0).max(999.99),
  nota: z.string().trim().max(500).nullable().optional(),
  /** Per gli eventi giornalieri: saltare sabati, domeniche e festivi. */
  soloFeriali: z.boolean().optional(),
});

/**
 * Salva una variazione inserita dall'ufficio.
 *
 * Un evento giornaliero che copre piu' giorni viene aperto in una riga per
 * giorno, perche' il tracciato lo vuole cosi': chi scrive dice "ferie dal 15 al
 * 19" una volta sola e non deve ripetere cinque volte la stessa cosa.
 */
export async function salvaEventoPaghe(input: z.input<typeof EventoSchema>): Promise<EsitoPaghe> {
  const parsed = EventoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const d = parsed.data;
  if (d.al < d.dal) return { ok: false, error: 'La data di fine viene prima di quella di inizio.' };

  const mese = estremiDelMese(d.periodo);
  if (d.dal < mese.dal || d.al > mese.al) {
    return { ok: false, error: 'Le date devono stare dentro il mese che stai preparando.' };
  }

  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  if (!(await dipendenteDelTenant(service, ctx.tenantId, d.dipendenteId))) {
    return { ok: false, error: 'Dipendente non valido.' };
  }

  const config = configPagheDa(await configGrezza(service, ctx.tenantId));
  const causale = risolviCausale(d.causale, config.causaliExtra);
  if (!causale) return { ok: false, error: 'Causale non riconosciuta.' };

  const record = causale.record;
  if (record === '14' && d.ore <= 0) {
    return { ok: false, error: 'Un evento giornaliero deve avere le ore: sono obbligatorie.' };
  }

  const base = {
    tenant_id: ctx.tenantId,
    periodo: d.periodo,
    dipendente_id: d.dipendenteId,
    causale: causale.codice,
    ore: d.ore,
    record,
    nota: d.nota ?? null,
    creato_da: ctx.userId,
  };

  if (d.id) {
    const { error } = await service
      .from('paghe_eventi' as never)
      .update({ ...base, dal: d.dal, al: record === '12' ? d.al : d.dal } as never)
      .eq('id', d.id)
      .eq('tenant_id', ctx.tenantId);
    if (error) return { ok: false, error: error.message };
    await auditTenant(service, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      entityType: 'paghe_evento',
      entityId: d.id,
      action: 'paghe.evento.modifica',
      after: base,
    });
    revalidatePath(PERCORSO);
    return { ok: true, id: d.id, quanti: 1 };
  }

  const righe =
    record === '12'
      ? [{ ...base, dal: d.dal, al: d.al }]
      : giorniDelPeriodo(d.dal, d.al)
          .filter((g) => d.soloFeriali === false || tipoGiorno(g) === 'feriale')
          .map((g) => ({ ...base, dal: g, al: g }));

  if (righe.length === 0) {
    return { ok: false, error: 'Nel periodo scelto non ci sono giorni lavorativi.' };
  }

  const { data, error } = await service
    .from('paghe_eventi' as never)
    .insert(righe as never)
    .select('id');
  if (error) return { ok: false, error: error.message };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_evento',
    action: 'paghe.evento.crea',
    after: { ...base, dal: d.dal, al: d.al, righe: righe.length },
  });

  revalidatePath(PERCORSO);
  const creati = (data ?? []) as { id: string }[];
  return { ok: true, id: creati[0]?.id, quanti: creati.length };
}

export async function eliminaEventoPaghe(id: string): Promise<EsitoPaghe> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Riga non valida.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const { data: prima } = await service
    .from('paghe_eventi' as never)
    .select('id, tenant_id, causale, dal, al, ore')
    .eq('id', id)
    .maybeSingle();
  const riga = prima as { tenant_id: string } | null;
  if (!riga || riga.tenant_id !== ctx.tenantId) return { ok: false, error: 'Riga non trovata.' };

  const { error } = await service
    .from('paghe_eventi' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_evento',
    entityId: id,
    action: 'paghe.evento.elimina',
    before: prima,
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attestati di malattia
// ---------------------------------------------------------------------------

const CertificatoSchema = z.object({
  id: z.string().uuid().optional(),
  dipendenteId: z.string().uuid(),
  dal: GIORNO,
  al: GIORNO,
  tipoInfo: z.enum(['C', 'P', 'M']),
  numero: z.string().trim().max(30).nullable().optional(),
  nota: z.string().trim().max(500).nullable().optional(),
  eventoId: z.string().uuid().nullable().optional(),
  permessoId: z.string().uuid().nullable().optional(),
});

export async function salvaCertificato(
  input: z.input<typeof CertificatoSchema>,
): Promise<EsitoPaghe> {
  const parsed = CertificatoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const d = parsed.data;
  if (d.al < d.dal) return { ok: false, error: 'La data di fine viene prima di quella di inizio.' };

  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  if (!(await dipendenteDelTenant(service, ctx.tenantId, d.dipendenteId))) {
    return { ok: false, error: 'Dipendente non valido.' };
  }

  const riga = {
    tenant_id: ctx.tenantId,
    dipendente_id: d.dipendenteId,
    dal: d.dal,
    al: d.al,
    tipo_info: d.tipoInfo,
    numero: d.numero?.trim() || null,
    nota: d.nota ?? null,
    evento_id: d.eventoId ?? null,
    permesso_id: d.permessoId ?? null,
    creato_da: ctx.userId,
  };

  if (d.id) {
    const { error } = await service
      .from('paghe_certificati' as never)
      .update(riga as never)
      .eq('id', d.id)
      .eq('tenant_id', ctx.tenantId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(PERCORSO);
    return { ok: true, id: d.id };
  }

  const { data, error } = await service
    .from('paghe_certificati' as never)
    .insert(riga as never)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_certificato',
    entityId: (data as { id: string }).id,
    action: 'paghe.certificato.crea',
    after: { dal: d.dal, al: d.al, conNumero: Boolean(riga.numero) },
  });

  revalidatePath(PERCORSO);
  return { ok: true, id: (data as { id: string }).id };
}

const MIME_AMMESSI = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DIMENSIONE_MASSIMA = 15 * 1024 * 1024;

/** Archivia il documento del medico accanto al numero dell'attestato. */
export async function caricaAllegatoCertificato(formData: FormData): Promise<EsitoPaghe> {
  const certificatoId = String(formData.get('certificatoId') ?? '');
  if (!z.string().uuid().safeParse(certificatoId).success) {
    return { ok: false, error: 'Certificato non valido.' };
  }
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'File mancante.' };
  if (file.size > DIMENSIONE_MASSIMA) {
    return { ok: false, error: 'Il file supera i 15 MB.' };
  }
  if (!MIME_AMMESSI.includes(file.type)) {
    return { ok: false, error: 'Sono ammessi PDF e immagini.' };
  }

  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const { data: cert } = await service
    .from('paghe_certificati' as never)
    .select('id, tenant_id, r2_key, dal')
    .eq('id', certificatoId)
    .maybeSingle();
  const riga = cert as { tenant_id: string; r2_key: string | null; dal: string } | null;
  if (!riga || riga.tenant_id !== ctx.tenantId) {
    return { ok: false, error: 'Certificato non trovato.' };
  }

  const { data: tenantRow } = await service
    .from('tenants')
    .select('slug, r2_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const r2 =
    getR2ProviderFromTenantConfig(
      (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
    ) ?? getR2ProviderFromEnv();
  if (!r2) return { ok: false, error: 'Archivio documenti non configurato.' };

  const nomeSicuro = (file.name || 'certificato')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-80);
  const chiave = `tenants/${tenantRow?.slug ?? ctx.tenantSlug}/paghe/certificati/${riga.dal.slice(0, 4)}/${certificatoId}/${randomUUID().slice(0, 8)}_${nomeSicuro}`;

  try {
    await r2.putObject(chiave, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return { ok: false, error: 'Caricamento non riuscito, riprova.' };
  }

  const { error } = await service
    .from('paghe_certificati' as never)
    .update({
      r2_key: chiave,
      nome_file: file.name || nomeSicuro,
      mime: file.type,
      size_bytes: file.size,
    } as never)
    .eq('id', certificatoId)
    .eq('tenant_id', ctx.tenantId);
  if (error) {
    // Niente file orfani su un archivio che nessuno guarda piu'.
    await r2.delete(chiave).catch(() => undefined);
    return { ok: false, error: error.message };
  }

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_certificato',
    entityId: certificatoId,
    action: 'paghe.certificato.allegato',
    after: { nome: file.name, bytes: file.size },
  });

  revalidatePath(PERCORSO);
  return { ok: true, id: certificatoId };
}

export async function eliminaCertificato(id: string): Promise<EsitoPaghe> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Riga non valida.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const service = createServiceSupabase();
  const { data: cert } = await service
    .from('paghe_certificati' as never)
    .select('id, tenant_id, r2_key, numero, dal, al')
    .eq('id', id)
    .maybeSingle();
  const riga = cert as { tenant_id: string; r2_key: string | null } | null;
  if (!riga || riga.tenant_id !== ctx.tenantId) return { ok: false, error: 'Riga non trovata.' };

  const { error } = await service
    .from('paghe_certificati' as never)
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) return { ok: false, error: error.message };

  if (riga.r2_key) {
    const { data: tenantRow } = await service
      .from('tenants')
      .select('r2_config')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    const r2 =
      getR2ProviderFromTenantConfig(
        (tenantRow?.r2_config as Record<string, unknown> | null) ?? null,
      ) ?? getR2ProviderFromEnv();
    await r2?.delete(riga.r2_key).catch(() => undefined);
  }

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_certificato',
    entityId: id,
    action: 'paghe.certificato.elimina',
    before: cert,
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stato del mese
// ---------------------------------------------------------------------------

const StatoMeseSchema = z.object({
  periodo: PERIODO,
  consegnato: z.boolean(),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Segna il mese come consegnato allo Studio. Non blocca niente: serve a sapere
 * a colpo d'occhio quali mesi sono chiusi e quando sono stati mandati.
 */
export async function segnaStatoMese(input: z.input<typeof StatoMeseSchema>): Promise<EsitoPaghe> {
  const parsed = StatoMeseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.' };
  const ctx = await contesto();
  if (!ctx) return { ok: false, error: 'Non autorizzato.' };

  const d = parsed.data;
  const service = createServiceSupabase();
  const { error } = await service.from('paghe_mesi' as never).upsert(
    {
      tenant_id: ctx.tenantId,
      periodo: d.periodo,
      stato: d.consegnato ? 'consegnato' : 'bozza',
      consegnato_at: d.consegnato ? new Date().toISOString() : null,
      consegnato_da: d.consegnato ? ctx.userId : null,
      note: d.note ?? null,
    } as never,
    { onConflict: 'tenant_id,periodo' },
  );
  if (error) return { ok: false, error: error.message };

  await auditTenant(service, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    entityType: 'paghe_mese',
    action: d.consegnato ? 'paghe.mese.consegnato' : 'paghe.mese.riaperto',
    after: { periodo: d.periodo },
  });

  revalidatePath(PERCORSO);
  return { ok: true };
}
