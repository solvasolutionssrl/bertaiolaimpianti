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

/** Commessa che esiste sul gestionale e da noi no. */
export interface SoloNelGestionale {
  externalId: string;
  codice: string | null;
  nome: string;
  cliente: string | null;
}

export interface DatiCollegamenti {
  ok: boolean;
  error?: string;
  /** Quanti record il gestionale ci ha mandato: se 0, non c'e' niente da fare. */
  esterniTotali: number;
  righe: RigaCollegamento[];
  /** Elenco completo per il menu a tendina quando si sceglie a mano. */
  esterni: Array<{ externalId: string; etichetta: string }>;
  /** Nel gestionale ma non da noi: si possono creare. */
  soloNelGestionale: SoloNelGestionale[];
  /** Gia' collegati: gli unici su cui ha senso mandare una riga di prova. */
  collegati: Array<{ id: string; etichetta: string }>;
}

const VUOTO: DatiCollegamenti = {
  ok: true,
  esterniTotali: 0,
  righe: [],
  esterni: [],
  soloNelGestionale: [],
  collegati: [],
};

/** Colonne canoniche di `integrazione_staging`. */
interface RigaStaging {
  external_id: string;
  nome: string | null;
  codice: string | null;
  cliente_external_id: string | null;
  attiva: boolean | null;
}

/**
 * I record arrivano gia' in lingua canonica: qui non si interpreta niente.
 *
 * La traduzione dal dialetto del gestionale la fa l'agente — che quel
 * gestionale lo conosce — e ce la consegna con nomi di campo nostri. Se
 * Kommessa provasse a indovinare (`description`? `descrizione`? `name`?) la
 * lista delle chiavi si allungherebbe a ogni cliente nuovo, e sarebbe dialetto
 * dell'ERP dentro il nostro codice.
 *
 * `nomiCliente` serve solo a mostrare il committente accanto alla commessa:
 * il collegamento lo porta gia' l'agente in `cliente_external_id`.
 */
function daStaging(r: RigaStaging, nomiCliente: Map<string, string>): CandidatoEsterno {
  return {
    externalId: r.external_id,
    codice: r.codice,
    nome: r.nome ?? r.external_id,
    cliente: r.cliente_external_id
      ? (nomiCliente.get(r.cliente_external_id) ?? null)
      : null,
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

  // I clienti servono solo per mostrare il committente accanto alla commessa e
  // per rafforzare l'abbinamento quando i nomi si somigliano.
  const { data: clientiRaw } = await service
    .from('integrazione_staging' as never)
    .select('external_id, nome')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'cliente');
  const nomiCliente = new Map(
    ((clientiRaw ?? []) as unknown as { external_id: string; nome: string | null }[])
      .filter((r) => r.nome)
      .map((r) => [r.external_id, r.nome!]),
  );

  const { data: stagingRaw } = await service
    .from('integrazione_staging' as never)
    .select('external_id, nome, codice, cliente_external_id, attiva')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa');

  const esterni: CandidatoEsterno[] = (
    (stagingRaw ?? []) as unknown as RigaStaging[]
  ).map((r) => daStaging(r, nomiCliente));

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

  // Quello che il gestionale ha e noi no. Non si creano da soli: un ERP porta
  // anche anni di commesse chiuse, e crearle tutte allagherebbe l'elenco
  // cantieri di roba morta. Si mostrano e si sceglie.
  const abbinati = new Set(
    righe.map((r) => r.externalId).filter((x): x is string => !!x),
  );
  const soloNelGestionale: SoloNelGestionale[] = esterni
    .filter((e) => !abbinati.has(e.externalId))
    .map((e) => ({
      externalId: e.externalId,
      codice: e.codice,
      nome: e.nome,
      cliente: e.cliente ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

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
    soloNelGestionale,
    collegati: righe
      .filter((r) => r.externalId)
      .map((r) => ({
        id: r.nostroId,
        etichetta: [r.nostroCodice, r.nostroNome].filter(Boolean).join(' · '),
      }))
      .sort((a, b) => a.etichetta.localeCompare(b.etichetta)),
  };
}

const CreaSchema = z.object({
  externalIds: z.array(z.string().min(1)).min(1).max(500),
});

export interface EsitoCreazione {
  ok: boolean;
  error?: string;
  creati: number;
  saltati: Array<{ externalId: string; motivo: string }>;
}

/**
 * Crea in Kommessa i cantieri che esistono solo sul gestionale, gia' collegati.
 *
 * Il verso e' quello giusto per come lavora il cliente: la commessa nasce nel
 * gestionale (e' li' che si fa l'offerta e si apre la posizione), e Kommessa la
 * **arricchisce** con quello che il gestionale non ha — posizione sulla mappa,
 * foto, QR, referenti, note di cantiere.
 *
 * Da qui in avanti quel cantiere e' **nostro**: nessun sync successivo lo
 * sovrascrive. Il gestionale non torna piu' a toccarlo.
 */
export async function creaDaGestionale(input: unknown): Promise<EsitoCreazione> {
  const parsed = CreaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Dati non validi.', creati: 0, saltati: [] };

  const c = await contesto();
  if (!c) {
    return {
      ok: false,
      error: 'Integrazione non attiva o permessi mancanti.',
      creati: 0,
      saltati: [],
    };
  }
  const { ctx, service, sistema, mondo } = c;

  // Creare commesse nel mondo Kommessa e' un'altra storia: hanno codice
  // progressivo, cartelle su Nextcloud, tipologie. Qui si ferma.
  if (mondo === 'kommessa') {
    return {
      ok: false,
      error:
        'La creazione automatica vale per i cantieri. Le commesse vanno create dal flusso normale.',
      creati: 0,
      saltati: [],
    };
  }

  const { data: stagingRaw } = await service
    .from('integrazione_staging' as never)
    .select('external_id, nome, codice, cliente_external_id, attiva')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa')
    .in('external_id', parsed.data.externalIds);

  const daCreare = ((stagingRaw ?? []) as unknown as RigaStaging[]).map((r) =>
    daStaging(r, new Map()),
  );

  // Chi e' gia' collegato non si ricrea: sarebbe un doppione silenzioso.
  const { data: mapEsistenti } = await service
    .from('integrazione_mappature' as never)
    .select('external_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'cantiere')
    .in('external_id', parsed.data.externalIds);
  const gia = new Set(
    ((mapEsistenti ?? []) as unknown as { external_id: string }[]).map((m) => m.external_id),
  );

  // ⚠️ Due codici diversi, da non confondere mai:
  //   * `cantieri.codice`          = il NOSTRO, interno e progressivo (CAN-00190).
  //                                  E' la nostra numerazione: il gestionale non
  //                                  la conosce e non deve entrarci.
  //   * `cantieri.codice_commessa` = quello del CLIENTE / del gestionale (26084).
  // Mettere il loro codice in `codice` inquinerebbe la nostra serie e la
  // renderebbe incoerente con i 190 cantieri gia' presenti.
  const { data: ultimoRaw } = await service
    .from('cantieri' as never)
    .select('codice')
    .eq('tenant_id', ctx.tenantId)
    .like('codice', 'CAN-%')
    .order('codice', { ascending: false })
    .limit(1);

  const ultimo = (ultimoRaw ?? []) as unknown as { codice: string }[];
  let prossimo =
    Number((ultimo[0]?.codice ?? '').replace(/^CAN-/, '')) || 0;

  const saltati: EsitoCreazione['saltati'] = [];
  let creati = 0;

  for (const e of daCreare) {
    if (gia.has(e.externalId)) {
      saltati.push({ externalId: e.externalId, motivo: 'già collegato' });
      continue;
    }

    prossimo += 1;
    const codice = `CAN-${String(prossimo).padStart(5, '0')}`;

    const { data: creato, error } = await service
      .from('cantieri' as never)
      .insert({
        tenant_id: ctx.tenantId,
        codice,
        nome: e.nome.slice(0, 200),
        // Qui, e solo qui, va il codice del gestionale.
        codice_commessa: e.codice,
        cliente_nome: e.cliente,
        // Nato dal gestionale, che di indirizzi non ne manda: va completato in
        // ufficio. Il flag lo rende visibile invece di lasciarlo scoperto.
        indirizzo_da_verificare: true,
      } as never)
      .select('id')
      .single();

    if (error || !creato) {
      saltati.push({
        externalId: e.externalId,
        motivo: error?.message.includes('duplicate')
          ? `codice "${codice}" già usato`
          : (error?.message ?? 'creazione fallita'),
      });
      continue;
    }

    const { error: errMap } = await service.from('integrazione_mappature' as never).insert({
      tenant_id: ctx.tenantId,
      sistema,
      entita: 'cantiere',
      entita_id: (creato as unknown as { id: string }).id,
      external_id: e.externalId,
      external_dati: { codice: e.codice, nome: e.nome, cliente: e.cliente },
      origine: 'manuale',
    } as never);

    if (errMap) {
      // Il cantiere resta, ma senza collegamento non riceverebbe ore: meglio
      // dirlo che lasciarlo lì a sembrare a posto.
      saltati.push({
        externalId: e.externalId,
        motivo: 'cantiere creato ma collegamento fallito: ricollegalo a mano',
      });
      continue;
    }
    creati += 1;
  }

  revalidatePath('/office/integrazione');
  return { ok: true, creati, saltati };
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
