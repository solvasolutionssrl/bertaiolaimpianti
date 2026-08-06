'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';
import { requireTenantContext } from '@kommessa/api/tenant';
import {
  duplicati,
  proponiAbbinamenti,
  type Abbinamento,
  type CandidatoEsterno,
  type CandidatoNostro,
} from '@kommessa/api/integrazione-abbina';

/**
 * Collegamento delle anagrafiche fra Kommessa e il gestionale del cliente.
 *
 * Finche' questa tabella e' vuota **non parte niente**: ogni operazione si
 * ferma con "anagrafica non collegata". E' quindi il primo lavoro da fare, ma
 * anche quello in cui si sbaglia piu' facilmente: un abbinamento errato non
 * da' errore, manda le ore sulla commessa di un altro — e sul gestionale non
 * si cancella.
 *
 * Per questo qui si **propone** soltanto. Conferma e responsabilita' restano
 * all'ufficio, che il cantiere lo conosce.
 */

export interface RigaCollegamento {
  nostroId: string;
  nostroCodice: string | null;
  nostroNome: string;
  nostroCliente: string | null;
  /** Proposta automatica, o quanto era gia' stato confermato. */
  externalId: string | null;
  externalNome: string | null;
  externalCodice: string | null;
  forza: Abbinamento['forza'] | 'confermato';
  motivo: string;
}

export interface DatiCollegamenti {
  ok: boolean;
  error?: string;
  /** Quanti record il gestionale ci ha mandato: se 0, non c'e' niente da fare. */
  esterniTotali: number;
  righe: RigaCollegamento[];
  /** Elenco completo per il menu a tendina quando si sceglie a mano. */
  esterni: Array<{ externalId: string; etichetta: string }>;
}

const VUOTO: DatiCollegamenti = { ok: true, esterniTotali: 0, righe: [], esterni: [] };

/** Da un record grezzo del gestionale tira fuori nome e codice, se ci sono. */
function leggiEsterno(externalId: string, dati: Record<string, unknown>): CandidatoEsterno {
  const s = (k: string): string | null => {
    const v = dati[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  return {
    externalId,
    // I gestionali chiamano le stesse cose in modi diversi: si prova in ordine
    // invece di imporre uno schema, cosi' un ERP nuovo non richiede codice.
    codice: s('codice') ?? s('code') ?? s('codiceCommessa') ?? s('number') ?? null,
    nome:
      s('descrizione') ?? s('description') ?? s('nome') ?? s('name') ?? externalId,
    cliente: s('cliente') ?? s('customer') ?? s('companyName') ?? s('ragioneSociale') ?? null,
  };
}

async function contesto() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) return null;

  const service = createServiceSupabase();
  const { data: mod } = await service
    .from('tenant_modules' as never)
    .select('attivo, config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();

  const modulo = mod as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  if (!modulo?.attivo) return null;
  const sistema =
    typeof modulo.config?.sistema === 'string' ? modulo.config.sistema : null;
  if (!sistema) return null;

  const { data: t } = await service
    .from('tenants')
    .select('app_mode')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const mondo = (t as unknown as { app_mode: string } | null)?.app_mode ?? 'kantiere';

  return { ctx, service, sistema, mondo };
}

export async function caricaCollegamenti(): Promise<DatiCollegamenti> {
  const c = await contesto();
  if (!c) {
    return { ...VUOTO, ok: false, error: 'Integrazione non attiva o permessi mancanti.' };
  }
  const { ctx, service, sistema, mondo } = c;

  // Nel mondo Kantiere l'unita' di lavoro sta in `cantieri`, altrove in
  // `commesse`. E' l'unico punto della pagina che deve saperlo.
  const inKantiere = mondo !== 'kommessa';
  const { data: nostriRaw } = inKantiere
    ? await service
        .from('cantieri' as never)
        .select('id, nome, codice_commessa, cliente_nome')
        .eq('tenant_id', ctx.tenantId)
        .order('nome')
    : await service
        .from('commesse')
        .select('id, nome_cartella, codice_interno, descrizione_ai_finale')
        .eq('tenant_id', ctx.tenantId)
        .not('stato', 'in', '(archiviata)')
        .order('codice_interno', { ascending: false });

  const nostri: CandidatoNostro[] = ((nostriRaw ?? []) as unknown as Record<string, string | null>[]).map(
    (r) => ({
      id: r.id as string,
      codice: (r.codice_commessa ?? r.codice_interno) ?? null,
      nome:
        (r.nome ?? r.descrizione_ai_finale ?? r.nome_cartella ?? '') || '(senza nome)',
      cliente: r.cliente_nome ?? null,
    }),
  );

  const { data: stagingRaw } = await service
    .from('integrazione_staging' as never)
    .select('external_id, dati')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa');

  const esterni: CandidatoEsterno[] = (
    (stagingRaw ?? []) as unknown as { external_id: string; dati: Record<string, unknown> }[]
  ).map((r) => leggiEsterno(r.external_id, r.dati ?? {}));

  const { data: mapRaw } = await service
    .from('integrazione_mappature' as never)
    .select('entita_id, external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .in('entita', ['cantiere', 'commessa']);

  const gia = ((mapRaw ?? []) as unknown as { entita_id: string; external_id: string }[]).map(
    (m) => ({ nostroId: m.entita_id, externalId: m.external_id }),
  );
  const giaMappa = new Map(gia.map((g) => [g.nostroId, g.externalId]));
  const perId = new Map(esterni.map((e) => [e.externalId, e]));
  const nostriPerId = new Map(nostri.map((n) => [n.id, n]));

  const proposte = proponiAbbinamenti(nostri, esterni, gia);
  const daProposta = new Map(proposte.map((p) => [p.nostroId, p]));

  const righe: RigaCollegamento[] = nostri.map((n) => {
    const confermato = giaMappa.get(n.id);
    const p = daProposta.get(n.id);
    const ext = confermato ?? p?.externalId ?? null;
    const e = ext ? perId.get(ext) : undefined;
    return {
      nostroId: n.id,
      nostroCodice: n.codice,
      nostroNome: n.nome,
      nostroCliente: n.cliente ?? null,
      externalId: ext,
      externalNome: e?.nome ?? (confermato ? '(non piu\' nell\'ultima lettura)' : null),
      externalCodice: e?.codice ?? null,
      forza: confermato ? 'confermato' : (p?.forza ?? 'nessuno'),
      motivo: confermato ? 'gia\' confermato dall\'ufficio' : (p?.motivo ?? ''),
    };
  });

  // Prima quello che richiede una decisione: i certi si scorrono in fondo.
  const ordine = { nessuno: 0, debole: 1, probabile: 2, certo: 3, confermato: 4 };
  righe.sort(
    (a, b) =>
      ordine[a.forza] - ordine[b.forza] || a.nostroNome.localeCompare(b.nostroNome),
  );

  void nostriPerId;
  return {
    ok: true,
    esterniTotali: esterni.length,
    righe,
    esterni: esterni
      .map((e) => ({
        externalId: e.externalId,
        etichetta: [e.codice, e.nome].filter(Boolean).join(' · '),
      }))
      .sort((a, b) => a.etichetta.localeCompare(b.etichetta)),
  };
}

const SalvaSchema = z.object({
  scelte: z
    .array(
      z.object({
        nostroId: z.string().uuid(),
        externalId: z.string().min(1).nullable(),
      }),
    )
    .max(2000),
});

export interface EsitoSalvataggio {
  ok: boolean;
  error?: string;
  salvati: number;
  rimossi: number;
  /** Bloccanti: lo stesso id del gestionale scelto per due record diversi. */
  duplicati: Array<{ externalId: string; nomi: string[] }>;
}

export async function salvaCollegamenti(input: unknown): Promise<EsitoSalvataggio> {
  const parsed = SalvaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Dati non validi.', salvati: 0, rimossi: 0, duplicati: [] };
  }
  const c = await contesto();
  if (!c) {
    return {
      ok: false,
      error: 'Integrazione non attiva o permessi mancanti.',
      salvati: 0,
      rimossi: 0,
      duplicati: [],
    };
  }
  const { ctx, service, sistema, mondo } = c;
  const entita = mondo === 'kommessa' ? 'commessa' : 'cantiere';

  // Duplicati: BLOCCANTE. Se due nostri record puntassero allo stesso id del
  // gestionale, le ore verrebbero imputate due volte e nessuno se ne
  // accorgerebbe finche' i costi non risultano doppi.
  const dup = duplicati(parsed.data.scelte);
  if (dup.length > 0) {
    const nomi = new Map<string, string>();
    const { data } = await service
      .from(entita === 'cantiere' ? ('cantieri' as never) : 'commesse')
      .select(entita === 'cantiere' ? 'id, nome' : 'id, nome_cartella')
      .in('id', dup.flatMap((d) => d.nostriId));
    for (const r of (data ?? []) as unknown as Record<string, string | null>[]) {
      const id = r.id;
      if (!id) continue;
      nomi.set(id, r.nome ?? r.nome_cartella ?? id.slice(0, 8));
    }
    return {
      ok: false,
      error: 'Lo stesso record del gestionale è stato scelto più volte.',
      salvati: 0,
      rimossi: 0,
      duplicati: dup.map((d) => ({
        externalId: d.externalId,
        nomi: d.nostriId.map((i) => nomi.get(i) ?? i.slice(0, 8)),
      })),
    };
  }

  const daScollegare = parsed.data.scelte.filter((s) => !s.externalId).map((s) => s.nostroId);
  const daCollegare = parsed.data.scelte.filter(
    (s): s is { nostroId: string; externalId: string } => !!s.externalId,
  );

  let rimossi = 0;
  if (daScollegare.length > 0) {
    const { count } = await service
      .from('integrazione_mappature' as never)
      .delete({ count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .eq('sistema', sistema)
      .eq('entita', entita)
      .in('entita_id', daScollegare);
    rimossi = count ?? 0;
  }

  if (daCollegare.length > 0) {
    const { error } = await service.from('integrazione_mappature' as never).upsert(
      daCollegare.map((s) => ({
        tenant_id: ctx.tenantId,
        sistema,
        entita,
        entita_id: s.nostroId,
        external_id: s.externalId,
        // Passato da qui = una persona l'ha guardato. `manuale` protegge la
        // riga da futuri ri-abbinamenti automatici dell'agente.
        origine: 'manuale',
      })) as never,
      { onConflict: 'tenant_id,sistema,entita,entita_id' },
    );
    if (error) {
      return {
        ok: false,
        error: 'Salvataggio fallito: ' + error.message,
        salvati: 0,
        rimossi,
        duplicati: [],
      };
    }
  }

  revalidatePath('/office/integrazione');
  return { ok: true, salvati: daCollegare.length, rimossi, duplicati: [] };
}
