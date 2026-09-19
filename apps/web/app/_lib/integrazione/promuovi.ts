import 'server-only';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  categoriaDaScrivere,
  chiaveCategoria,
  smistaCategorie,
  type CategoriaNostra,
} from '@kommessa/api/categorie-smistamento';

/**
 * Promozione: dal deposito delle letture ai dati veri.
 *
 * `/api/v1/letture` deposita e basta — e' voluto: un gestionale che risponde a
 * meta' non deve poter corrompere i cantieri veri. Questa funzione e' il passo
 * separato che porta in produzione cio' che il deposito contiene, e gira
 * quando **l'agente dichiara chiuso il giro** (`POST /esecuzioni {chiudi}`):
 * a quel punto sappiamo che la lettura e' finita, non che si e' interrotta.
 *
 * Fa due cose, in quest'ordine:
 *
 * 1. **Smista le categorie.** Ogni valore mai visto entra in
 *    `categoria_mappature`. Uguaglianza esatta con una categoria nostra →
 *    agganciato da solo; altrimenti resta `null` = "da smistare", e decide
 *    l'ufficio. Non si crea mai una categoria canonica da un valore esterno.
 * 2. **Crea i cantieri nuovi.** Una commessa che il gestionale ha e noi no
 *    diventa un cantiere, con la nostra numerazione e i dati che abbiamo.
 *
 * Idempotente: rigirarla non crea doppioni. Non tocca **mai** un cantiere che
 * esiste gia' — da quando e' nostro, il gestionale non lo riscrive piu'.
 */

/** Il timbro che accende l'etichetta «nuovo» in elenco. */
export const GIORNI_ETICHETTA_NUOVO = 5;

export interface EsitoPromozione {
  ok: boolean;
  motivo?: string;
  categorieCollegate: number;
  categorieDaSmistare: number;
  cantieriCreati: number;
  cantieriSaltati: Array<{ externalId: string; motivo: string }>;
  /** Cantieri che il gestionale dichiara chiusi e che abbiamo chiuso anche noi. */
  cantieriChiusi?: number;
  /** Cantieri tornati aperti sul gestionale e riaperti anche qui. */
  cantieriRiaperti?: number;
}

const NULLA: EsitoPromozione = {
  ok: true,
  categorieCollegate: 0,
  categorieDaSmistare: 0,
  cantieriCreati: 0,
  cantieriSaltati: [],
};

interface RigaStaging {
  external_id: string;
  nome: string | null;
  external_codice: string | null;
  cliente_nome: string | null;
  categoria: string | null;
  indirizzo: string | null;
  attiva: boolean | null;
  /** Quando il gestionale ci ha mandato QUESTA riga l'ultima volta. */
  letto_at: string | null;
}

export async function promuoviDalGestionale(
  tenantId: string,
): Promise<EsitoPromozione> {
  const service = createServiceSupabase();

  const [{ data: modRaw }, { data: tRaw }] = await Promise.all([
    service
      .from('tenant_modules' as never)
      .select('attivo, config')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'integrazione')
      .maybeSingle(),
    service.from('tenants').select('app_mode').eq('id', tenantId).maybeSingle(),
  ]);

  const mod = modRaw as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  if (!mod?.attivo) return { ...NULLA, ok: false, motivo: 'modulo spento' };

  const sistema =
    typeof mod.config?.sistema === 'string' ? mod.config.sistema : null;
  if (!sistema) return { ...NULLA, ok: false, motivo: 'gestionale non scelto' };

  // La creazione automatica vale per i cantieri. Le commesse del mondo
  // Kommessa hanno codice progressivo, cartelle su Nextcloud e tipologie: non
  // si fabbricano da una riga di staging.
  const mondo = (tRaw as unknown as { app_mode: string } | null)?.app_mode ?? 'kantiere';
  if (mondo === 'kommessa') {
    return { ...NULLA, ok: false, motivo: 'mondo commesse: creazione non automatica' };
  }

  const creaAutomatico = mod.config?.crea_cantieri_automatico !== false;

  const { data: stagingRaw } = await service
    .from('integrazione_staging' as never)
    .select(
      'external_id, nome, external_codice, cliente_nome, categoria, indirizzo, attiva, letto_at',
    )
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa');

  const staging = (stagingRaw ?? []) as unknown as RigaStaging[];
  if (staging.length === 0) return NULLA;

  // ---------------------------------------------------------------------
  // 1. Categorie
  // ---------------------------------------------------------------------
  const [{ data: catRaw }, { data: mapCatRaw }] = await Promise.all([
    service
      .from('cantiere_categorie' as never)
      .select('id, nome')
      .eq('tenant_id', tenantId),
    service
      .from('categoria_mappature' as never)
      .select('valore_esterno, categoria_id')
      .eq('tenant_id', tenantId)
      .eq('sistema', sistema),
  ]);

  const nostre = ((catRaw ?? []) as unknown as CategoriaNostra[]) ?? [];
  const esistenti = ((mapCatRaw ?? []) as unknown as {
    valore_esterno: string;
    categoria_id: string | null;
  }[]).map((m) => ({ valoreEsterno: m.valore_esterno, categoriaId: m.categoria_id }));

  const esito = smistaCategorie(
    staging.map((s) => s.categoria ?? ''),
    nostre,
    esistenti,
  );

  const adesso = new Date().toISOString();
  const righeCat = [
    ...esito.daCollegare.map((c) => ({
      tenant_id: tenantId,
      sistema,
      valore_esterno: c.valoreEsterno,
      categoria_id: c.categoriaId,
      visto_al: adesso,
    })),
    ...esito.daSmistare.map((v) => ({
      tenant_id: tenantId,
      sistema,
      valore_esterno: v,
      categoria_id: null,
      visto_al: adesso,
    })),
  ];
  if (righeCat.length > 0) {
    await service
      .from('categoria_mappature' as never)
      .upsert(righeCat as never, { onConflict: 'tenant_id,sistema,valore_esterno' });
  }

  // Mappa completa (anche quello appena scritto) per decidere cosa scrivere
  // sui cantieri nuovi.
  const nomePerId = new Map(nostre.map((c) => [c.id, c.nome]));
  const nostroNomePerValore = new Map<string, string>();
  for (const m of esistenti) {
    const nome = m.categoriaId ? nomePerId.get(m.categoriaId) : null;
    if (nome) nostroNomePerValore.set(chiaveCategoria(m.valoreEsterno), nome);
  }
  for (const c of esito.daCollegare) {
    const nome = nomePerId.get(c.categoriaId);
    if (nome) nostroNomePerValore.set(chiaveCategoria(c.valoreEsterno), nome);
  }

  // ---------------------------------------------------------------------
  // 2. Cantieri: prima quelli che esistono gia', poi quelli nuovi
  // ---------------------------------------------------------------------
  const [{ data: mapRaw }, { data: nostriRaw }] = await Promise.all([
    service
      .from('integrazione_mappature' as never)
      .select('external_id, entita_id')
      .eq('tenant_id', tenantId)
      .eq('sistema', sistema)
      .eq('entita', 'cantiere'),
    service
      .from('cantieri' as never)
      .select('id, codice, codice_commessa, stato')
      .eq('tenant_id', tenantId),
  ]);

  const mappature = (mapRaw ?? []) as unknown as {
    external_id: string;
    entita_id: string;
  }[];
  const giaCollegati = new Set(mappature.map((m) => m.external_id));
  const nostri = (nostriRaw ?? []) as unknown as {
    id: string;
    codice: string | null;
    codice_commessa: string | null;
    stato: string | null;
  }[];
  // Anche chi non e' ancora *mappato* ma ha lo stesso codice commessa esiste
  // gia': crearlo di nuovo sarebbe un doppione, e l'abbinamento lo sistema il
  // match. Questa e' la rete che impedisce di ricreare 186 cantieri se un
  // giorno le mappature venissero svuotate.
  const codiciNostri = new Set(
    nostri
      .map((c) => (c.codice_commessa ?? '').trim())
      .filter((c) => c !== ''),
  );

  // ---------------------------------------------------------------------
  // 2-bis. Con l'integrazione accesa, lo stato lo comanda il gestionale
  // ---------------------------------------------------------------------
  // Una commessa che si chiude la' si chiude anche qui la notte dopo, e se
  // torna aperta si riapre: e' la scelta del cliente, «lo stato vive secondo
  // quanto riporta il gestionale». Vale **solo** per chi ha il modulo
  // integrazione acceso (questa funzione gira solo per loro) e **solo** per i
  // cantieri che il gestionale nomina: quelli nati da noi non si toccano.
  //
  // Sta PRIMA del «niente da creare» di proposito: a regime i cantieri nuovi
  // sono zero e le chiusure diventano l'unica cosa che arriva davvero.
  const perId = new Map(nostri.map((c) => [c.id, c]));
  const nostroPerExternal = new Map<string, { id: string; stato: string | null }>();
  for (const m of mappature) {
    const c = perId.get(m.entita_id);
    if (c) nostroPerExternal.set(m.external_id, { id: c.id, stato: c.stato });
  }
  // Rete di riserva: chi non e' mappato ma porta lo stesso codice commessa e'
  // lo stesso lavoro. Non sovrascrive la mappatura, che resta piu' affidabile.
  for (const c of nostri) {
    const cod = (c.codice_commessa ?? '').trim();
    if (cod && !nostroPerExternal.has(cod)) {
      nostroPerExternal.set(cod, { id: c.id, stato: c.stato });
    }
  }

  // Il deposito non si svuota mai: si aggiorna riga per riga. Quindi contiene
  // anche commesse che il gestionale NON ha nominato in questo giro, con il
  // valore congelato all'ultima volta che le ha mandate. Senza questo filtro un
  // cantiere riaperto a mano dall'ufficio verrebbe richiuso alla prima
  // esecuzione successiva, da un dato vecchio, e nessuno capirebbe perche'.
  // Si considerano "di questo giro" le righe lette entro 6 ore dall'ultima.
  const letturaPiuRecente = staging.reduce(
    (max, s) => (s.letto_at && s.letto_at > max ? s.letto_at : max),
    '',
  );
  const sogliaFreschezza = letturaPiuRecente
    ? new Date(Date.parse(letturaPiuRecente) - 6 * 60 * 60 * 1000).toISOString()
    : null;

  const daChiudere: string[] = [];
  const daRiaprire: string[] = [];
  for (const s of staging) {
    // `attiva` assente = il gestionale non si esprime: non si tocca niente.
    if (s.attiva === null || s.attiva === undefined) continue;
    // Riga vecchia = non nominata in questo giro: vale come silenzio.
    if (sogliaFreschezza && (!s.letto_at || s.letto_at < sogliaFreschezza)) continue;
    // L'aggancio prova ENTRAMBE le chiavi: `codice_commessa` da noi contiene
    // `external_codice`, ma la mappatura e' su `external_id`. Sui gestionali
    // dove i due valori differiscono, cercarne uno solo non trova mai niente.
    const nostro =
      nostroPerExternal.get(s.external_id) ??
      (s.external_codice ? nostroPerExternal.get(s.external_codice.trim()) : undefined);
    if (!nostro) continue;
    if (s.attiva === false && nostro.stato !== 'chiuso') daChiudere.push(nostro.id);
    if (s.attiva === true && nostro.stato === 'chiuso') daRiaprire.push(nostro.id);
  }

  /**
   * A gruppi di 100: il primo giro puo' portarne centinaia in una volta.
   *
   * Torna quanti ne ha cambiati **davvero**. Contare le intenzioni invece delle
   * righe scritte farebbe dire al diario «chiusi: 186» anche se non ne fosse
   * passato uno, e quel numero serve proprio a fidarsi senza andare a guardare.
   */
  async function cambiaStato(ids: string[], stato: 'chiuso' | 'attivo'): Promise<number> {
    let fatti = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await service
        .from('cantieri' as never)
        .update({ stato } as never)
        .in('id', ids.slice(i, i + 100))
        .eq('tenant_id', tenantId)
        .select('id');
      if (error) {
        // Non si interrompe il giro per un gruppo andato storto: gli altri
        // cambi sono comunque giusti. Lo scarto fra intenzione e conteggio e'
        // il segnale che qualcosa non e' passato.
        console.error('[promuovi] cambio stato non riuscito', {
          tenantId,
          stato,
          quanti: ids.slice(i, i + 100).length,
          errore: error.message,
        });
        continue;
      }
      fatti += ((data ?? []) as unknown[]).length;
    }
    return fatti;
  }
  const chiusi = await cambiaStato(daChiudere, 'chiuso');
  const riaperti = await cambiaStato(daRiaprire, 'attivo');

  // Il freno `crea_cantieri_automatico` sta QUI e non piu' sopra: spegnere la
  // creazione dei cantieri nuovi non deve spegnere anche l'allineamento dello
  // stato di quelli che esistono gia'. Sono due decisioni diverse, e prima
  // erano legate dall'ordine delle righe.
  if (!creaAutomatico) {
    return {
      ok: true,
      motivo: 'creazione cantieri disattivata per questo cliente',
      categorieCollegate: esito.daCollegare.length,
      categorieDaSmistare: esito.daSmistare.length,
      cantieriCreati: 0,
      cantieriSaltati: [],
      cantieriChiusi: chiusi,
      cantieriRiaperti: riaperti,
    };
  }

  const daCreare = staging.filter(
    (s) => !giaCollegati.has(s.external_id) && !codiciNostri.has(s.external_id),
  );

  if (daCreare.length === 0) {
    return {
      ok: true,
      categorieCollegate: esito.daCollegare.length,
      categorieDaSmistare: esito.daSmistare.length,
      cantieriCreati: 0,
      cantieriSaltati: [],
      cantieriChiusi: chiusi,
      cantieriRiaperti: riaperti,
    };
  }

  // ⚠️ `cantieri.codice` = LA NOSTRA serie progressiva (CAN-00190). Il codice
  // del gestionale va in `codice_commessa` e mai qui: mescolarli renderebbe la
  // nostra numerazione incoerente con i cantieri gia' presenti.
  let prossimo = nostri.reduce((max, c) => {
    const n = Number((c.codice ?? '').replace(/^CAN-/, ''));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const saltati: EsitoPromozione['cantieriSaltati'] = [];
  let creati = 0;

  for (const s of daCreare) {
    prossimo += 1;
    const codice = `CAN-${String(prossimo).padStart(5, '0')}`;
    const nome = (s.nome ?? s.external_id).slice(0, 200);

    const { data: creato, error } = await service
      .from('cantieri' as never)
      .insert({
        tenant_id: tenantId,
        codice,
        nome,
        codice_commessa: s.external_codice ?? s.external_id,
        cliente_nome: s.cliente_nome,
        categoria: categoriaDaScrivere(s.categoria, nostroNomePerValore),
        indirizzo: s.indirizzo,
        // Anche quando l'indirizzo arriva resta da verificare: sul gestionale
        // e' spesso la sede legale del committente, non il posto dove si
        // lavora, e senza coordinate il cantiere non comparirebbe sulla mappa.
        indirizzo_da_verificare: true,
        // Il timbro che accende l'etichetta «nuovo» per qualche giorno.
        origine_gestionale_al: adesso,
        // Una commessa gia' chiusa sul gestionale nasce chiusa anche da noi:
        // serve per lo storico, non per lavorarci.
        stato: s.attiva === false ? 'chiuso' : 'attivo',
      } as never)
      .select('id')
      .single();

    if (error || !creato) {
      prossimo -= 1;
      saltati.push({
        externalId: s.external_id,
        motivo: error?.message.includes('duplicate')
          ? `codice "${codice}" già usato`
          : (error?.message ?? 'creazione fallita'),
      });
      continue;
    }

    const { error: errMap } = await service.from('integrazione_mappature' as never).insert({
      tenant_id: tenantId,
      sistema,
      entita: 'cantiere',
      entita_id: (creato as unknown as { id: string }).id,
      external_id: s.external_id,
      external_dati: {
        externalCodice: s.external_codice,
        nome: s.nome,
        clienteNome: s.cliente_nome,
      },
      origine: 'automatico',
    } as never);

    if (errMap) {
      // Il cantiere resta ma senza collegamento non riceverebbe ore: va detto,
      // non lasciato lì a sembrare a posto.
      saltati.push({
        externalId: s.external_id,
        motivo: 'cantiere creato ma collegamento fallito: ricollegalo a mano',
      });
      continue;
    }
    creati += 1;
  }

  return {
    ok: true,
    categorieCollegate: esito.daCollegare.length,
    categorieDaSmistare: esito.daSmistare.length,
    cantieriCreati: creati,
    cantieriSaltati: saltati,
    cantieriChiusi: chiusi,
    cantieriRiaperti: riaperti,
  };
}

/**
 * Come sopra, ma lascia scritto com'e' andata.
 *
 * Gira dentro `waitUntil`, cioe' dopo che la risposta e' gia' partita: se qui
 * si rompe qualcosa non lo vede nessuno. Prima l'esito finiva in un
 * `.catch(() => {})` e dai dati era impossibile distinguere **«ha girato a
 * vuoto perche' non c'era niente di nuovo»** da **«non e' mai partita»** — le
 * due cose lasciano lo stesso identico nulla, perche' la promozione scrive
 * solo quando trova roba nuova.
 *
 * Ora l'esito va in `integrazione_esecuzioni.dettaglio.promozione`, accanto a
 * quello che ha mandato l'agente. Cosi' basta guardare un giro qualunque,
 * senza aspettare che dal gestionale arrivi qualcosa.
 */
export async function promuoviERegistra(
  tenantId: string,
  esecuzioneId: string,
): Promise<void> {
  const al = new Date().toISOString();
  let promozione: Record<string, unknown>;

  try {
    const e = await promuoviDalGestionale(tenantId);
    promozione = {
      al,
      ok: e.ok,
      ...(e.motivo ? { motivo: e.motivo } : {}),
      categorieCollegate: e.categorieCollegate,
      categorieDaSmistare: e.categorieDaSmistare,
      cantieriCreati: e.cantieriCreati,
      cantieriChiusi: e.cantieriChiusi ?? 0,
      cantieriRiaperti: e.cantieriRiaperti ?? 0,
      saltati: e.cantieriSaltati.length,
      // Un assaggio basta: se sono tanti il numero sopra dice comunque quanti.
      esempiSaltati: e.cantieriSaltati.slice(0, 10),
    };
  } catch (err) {
    promozione = {
      al,
      ok: false,
      motivo: err instanceof Error ? err.message : 'errore sconosciuto',
    };
  }

  try {
    const service = createServiceSupabase();
    const { data } = await service
      .from('integrazione_esecuzioni' as never)
      .select('dettaglio')
      .eq('id', esecuzioneId)
      .maybeSingle();

    // Il `dettaglio` lo scrive l'agente e puo' essere qualunque cosa: lo
    // teniamo solo se e' un oggetto, altrimenti ci scriveremmo sopra.
    const prima = (data as unknown as { dettaglio: unknown } | null)?.dettaglio;
    const base =
      prima && typeof prima === 'object' && !Array.isArray(prima)
        ? (prima as Record<string, unknown>)
        : {};

    await service
      .from('integrazione_esecuzioni' as never)
      .update({ dettaglio: { ...base, promozione } } as never)
      .eq('id', esecuzioneId);
  } catch {
    // Se non riesce nemmeno a scrivere l'esito, pazienza: questo pezzo non
    // deve far saltare la chiusura del giro, che e' gia' andata a buon fine.
  }
}
