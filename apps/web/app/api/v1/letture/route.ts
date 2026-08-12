import { createHash } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import { CONTRATTO, autenticaApi, erroreApi, leggiJson } from '../_lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENTITA_AMMESSE = ['commessa', 'cliente', 'dipendente'] as const;
const MAX_RECORD = 1000;

/**
 * Record in **lingua canonica**. La traduzione dal dialetto del gestionale la
 * fa l'agente, che quel gestionale lo conosce: Kommessa non deve indovinare
 * dove sta il nome e dove il codice, perche' la lista delle chiavi possibili
 * si allungherebbe a ogni cliente nuovo.
 *
 * I campi `external…` sono i dati **del gestionale**. Gli altri descrivono la
 * stessa entita' ma non sono identificativi, e per quelli il prefisso sarebbe
 * solo rumore.
 */
interface RecordLetto {
  /** Chiave primaria sul gestionale. E' l'aggancio: obbligatorio. */
  externalId: string;
  /** Nome leggibile: e' cio' che l'ufficio vede quando abbina. Obbligatorio. */
  nome?: string;
  /**
   * Codice leggibile della **commessa** sul gestionale (ERGO: `objectId`
   * ripetuto, perche' li' l'identificativo funge da codice). E' quello che
   * l'ufficio trascrive quando cerca la commessa nel loro sistema.
   */
  externalCodiceCommessa?: string | null;
  /**
   * Codice/matricola del **dipendente** sul gestionale.
   *
   * ⚠️ Va confrontato solo per uguaglianza esatta, mai con la nostra
   * matricola: le nostre sono `00001`, `00002`, `00019` e il confronto
   * morbido ignora gli zeri iniziali — su FPM avrebbe prodotto 33
   * accoppiamenti falsi su 35, cioe' ore sulla busta paga sbagliata.
   */
  externalCodiceDipendente?: string | null;
  /** Committente sul gestionale: i documenti di km e spese lo pretendono. */
  externalClienteId?: string | null;
  /**
   * Nome del committente. Serve quando l'agente deposita le commesse ma non i
   * clienti: senza, l'ufficio abbinerebbe alla cieca.
   */
  clienteNome?: string | null;
  /** Categoria/gruppo di lavoro (ERGO: `group.description`). */
  categoria?: string | null;
  /**
   * Indirizzo **gia' composto in una riga**. Se il gestionale lo tiene a pezzi
   * (via / cap / comune), ricomporli e' compito dell'agente: accettare la sua
   * forma vorrebbe dire farsi entrare il suo dialetto in casa, e il prossimo
   * gestionale chiamera' quei pezzi in un altro modo ancora.
   */
  indirizzo?: string | null;
  /**
   * `false` = commessa chiusa / dipendente non piu' in forza.
   *
   * Le chiuse vanno mandate lo stesso: senza, chi legge non puo' distinguere
   * «chiusa» da «sparita», e la nostra anagrafica perde per strada i lavori
   * vecchi su cui ci sono ancora ore da leggere.
   */
  attiva?: boolean | null;
  /** Risposta grezza del gestionale, come allegato. Non viene interpretata. */
  dati?: Record<string, unknown>;
}

/**
 * POST /api/v1/letture
 * body: { entita: 'commessa'|'cliente'|'dipendente', record: [{externalId, dati}] }
 *
 * L'agente deposita cio' che ha letto dal gestionale. I dati atterrano **grezzi**
 * in `integrazione_staging` e NON toccano le tabelle di dominio.
 *
 * Il motivo e' difensivo: un gestionale che risponde a meta', con campi
 * rinominati o con una pagina vuota per un timeout non deve poter corrompere i
 * cantieri veri. La promozione a dati di produzione e' un passo separato, fatto
 * da Kommessa, revisionabile.
 *
 * `contenuto_hash` serve a saltare in fretta cio' che non e' cambiato: con
 * qualche migliaio di record, riconciliare solo le differenze cambia i tempi.
 */
export async function POST(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const { tenantId, sistema } = g.ctx;
  if (!sistema) {
    return erroreApi(409, 'sistema_non_configurato', 'Manca il sistema di destinazione.');
  }

  const body = await leggiJson<{ entita?: string; record?: RecordLetto[] }>(request);
  const entita = body?.entita;
  const record = body?.record;

  if (!entita || !(ENTITA_AMMESSE as readonly string[]).includes(entita)) {
    return erroreApi(
      400,
      'entita_non_valida',
      `\`entita\` deve essere una fra: ${ENTITA_AMMESSE.join(', ')}.`,
    );
  }
  if (!Array.isArray(record) || record.length === 0) {
    return erroreApi(400, 'corpo_non_valido', 'Manca l\'elenco `record`.');
  }
  if (record.length > MAX_RECORD) {
    return erroreApi(
      413,
      'lotto_troppo_grande',
      `Massimo ${MAX_RECORD} record per chiamata: spezza in piu' pagine.`,
    );
  }

  const scartati: string[] = [];
  const righe = record
    .filter((r) => {
      // Senza identificativo il record non e' agganciabile a nulla; senza nome
      // l'ufficio si troverebbe ad abbinare stringhe vuote.
      const ok =
        r &&
        typeof r.externalId === 'string' &&
        r.externalId.trim() !== '' &&
        typeof r.nome === 'string' &&
        r.nome.trim() !== '';
      if (!ok) scartati.push(String((r as RecordLetto | undefined)?.externalId ?? '?'));
      return ok;
    })
    .map((r) => {
      // Una colonna sola per il codice del gestionale: quale dei due nomi
      // valga lo dice l'entita', e un dipendente non ha un codice commessa.
      const externalCodice =
        (entita === 'dipendente' ? r.externalCodiceDipendente : r.externalCodiceCommessa)
          ?.trim() || null;
      const canonici = [
        r.nome,
        externalCodice,
        r.externalClienteId,
        r.clienteNome,
        r.categoria,
        r.indirizzo,
        r.attiva,
      ];
      return {
        tenant_id: tenantId,
        sistema,
        entita,
        external_id: r.externalId.trim(),
        nome: r.nome!.trim().slice(0, 300),
        external_codice: externalCodice,
        external_cliente_id: r.externalClienteId?.trim() || null,
        cliente_nome: r.clienteNome?.trim().slice(0, 300) || null,
        categoria: r.categoria?.trim().slice(0, 120) || null,
        indirizzo: r.indirizzo?.trim().slice(0, 400) || null,
        attiva: typeof r.attiva === 'boolean' ? r.attiva : null,
        dati: r.dati ?? {},
        // L'impronta copre anche i campi canonici: se cambia il nome ma non il
        // grezzo (o viceversa) il record va comunque rivisto.
        contenuto_hash: createHash('sha256')
          .update(JSON.stringify([...canonici, r.dati ?? {}]))
          .digest('hex'),
        letto_at: new Date().toISOString(),
      };
    });

  if (righe.length === 0) {
    return erroreApi(
      400,
      'nessun_record_valido',
      'Ogni record deve avere `externalId` e `nome`.',
    );
  }

  const service = createServiceSupabase();
  const { error } = await service
    .from('integrazione_staging' as never)
    .upsert(righe as never, { onConflict: 'tenant_id,sistema,entita,external_id' });

  if (error) {
    return erroreApi(503, 'scrittura_fallita', 'Non riesco a salvare i dati letti.');
  }

  return Response.json({
    contratto: CONTRATTO,
    entita,
    salvati: righe.length,
    scartati,
  });
}
