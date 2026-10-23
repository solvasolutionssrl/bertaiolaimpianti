/**
 * Fasi (sottocantieri) dal gestionale: dall'area di sosta ai cantieri.
 *
 * Il gestionale deposita le fasi con `POST /letture` (`entita:
 * 'sottocantiere'`): `externalId` (per ERGO `commessa.fase`, es. `25151.2`),
 * `nome`, il cantiere padre (`externalCantiereId`) e il codice della fase.
 * Questa funzione, pura, decide cosa fare di ogni riga in sosta:
 *
 *  - padre non collegato a un nostro cantiere → la fase **resta in sosta**
 *    (`senzaPadre`): qui non si crea mai un cantiere;
 *  - fase gia' mappata → si aggiorna solo se nome o codice sono cambiati;
 *  - fase non mappata ma gia' esistente sul cantiere con lo stesso codice
 *    (scritta a mano dall'ufficio prima dell'arrivo del gestionale) → si
 *    **collega** e si marca come del gestionale, senza crearne una seconda;
 *  - altrimenti → si **crea**, con `origine_gestionale_al`.
 *
 * ⚠️ Una fase che non arriva piu' NON si chiude e NON si cancella: per ERGO
 * puo' voler dire commessa chiusa, fase rimasta sola (e allora non la manda),
 * oppure una lettura fallita quella notte. Chiuderla qui farebbe sparire
 * una scelta dalle tendine per un silenzio.
 *
 * Idempotente: con i dati gia' allineati non produce nessuna operazione.
 */

export interface FaseInSosta {
  externalId: string;
  nome: string;
  /** Il codice della fase sul gestionale (`externalCodiceFase`); se manca vale l'externalId. */
  externalCodice: string | null;
  /** `externalId` del cantiere padre sul gestionale. */
  externalCantiereId: string | null;
  descrizione?: string | null;
}

export interface FaseNostra {
  id: string;
  cantiereId: string;
  nome: string;
  codice: string | null;
  origineGestionaleAl: string | null;
}

export interface MappaturaFase {
  externalId: string;
  entitaId: string;
}

export interface PianoFasi {
  crea: Array<{ externalId: string; cantiereId: string; nome: string; codice: string; descrizione: string | null }>;
  /** Fasi gia' nostre da allineare al gestionale (nome, codice, origine). */
  aggiorna: Array<{ id: string; nome?: string; codice?: string; origineGestionaleAl?: string }>;
  /** Mappature da scrivere (fasi create o collegate per codice). */
  mappa: Array<{ externalId: string; entitaId: string | null; nuova: boolean }>;
  /** Righe in sosta il cui cantiere padre non e' collegato: restano li'. */
  senzaPadre: Array<{ externalId: string; externalCantiereId: string | null }>;
}

const pulito = (s: string | null | undefined) => (s ?? '').trim();

export function pianificaFasiDalGestionale(input: {
  sosta: readonly FaseInSosta[];
  /** `externalId` del cantiere sul gestionale → id del nostro cantiere (mappature + codice commessa). */
  cantierePerExternal: ReadonlyMap<string, string>;
  fasiNostre: readonly FaseNostra[];
  mappature: readonly MappaturaFase[];
  adesso: string;
}): PianoFasi {
  const piano: PianoFasi = { crea: [], aggiorna: [], mappa: [], senzaPadre: [] };
  const nostraPerId = new Map(input.fasiNostre.map((f) => [f.id, f]));
  const mappataPerExternal = new Map(input.mappature.map((m) => [m.externalId, m.entitaId]));
  // Per collegare una fase scritta a mano: (cantiere, codice) → fase.
  const nostraPerCodice = new Map<string, FaseNostra>();
  for (const f of input.fasiNostre) {
    const c = pulito(f.codice);
    if (c) nostraPerCodice.set(`${f.cantiereId}|${c.toLowerCase()}`, f);
  }
  const gestite = new Set<string>();

  for (const s of input.sosta) {
    const externalId = pulito(s.externalId);
    if (!externalId || gestite.has(externalId)) continue;
    gestite.add(externalId);
    const padre = pulito(s.externalCantiereId);
    const cantiereId = padre ? input.cantierePerExternal.get(padre) : undefined;
    if (!cantiereId) {
      piano.senzaPadre.push({ externalId, externalCantiereId: padre || null });
      continue;
    }
    const nome = pulito(s.nome).slice(0, 200) || externalId;
    const codice = (pulito(s.externalCodice) || externalId).slice(0, 60);
    const descrizione = pulito(s.descrizione).slice(0, 1000) || null;

    const giaId = mappataPerExternal.get(externalId);
    const gia = giaId ? nostraPerId.get(giaId) : undefined;
    if (giaId && !gia) {
      // La mappatura punta a una fase che non c'e' piu' (cancellata a mano):
      // la mappatura si riscrive sulla fase ricreata.
      piano.crea.push({ externalId, cantiereId, nome, codice, descrizione });
      piano.mappa.push({ externalId, entitaId: null, nuova: false });
      continue;
    }
    if (gia) {
      const agg: PianoFasi['aggiorna'][number] = { id: gia.id };
      if (gia.nome !== nome) agg.nome = nome;
      if (pulito(gia.codice) !== codice) agg.codice = codice;
      if (!gia.origineGestionaleAl) agg.origineGestionaleAl = input.adesso;
      if (Object.keys(agg).length > 1) piano.aggiorna.push(agg);
      continue;
    }
    const perCodice = nostraPerCodice.get(`${cantiereId}|${codice.toLowerCase()}`);
    if (perCodice) {
      const agg: PianoFasi['aggiorna'][number] = { id: perCodice.id };
      if (perCodice.nome !== nome) agg.nome = nome;
      if (!perCodice.origineGestionaleAl) agg.origineGestionaleAl = input.adesso;
      if (Object.keys(agg).length > 1) piano.aggiorna.push(agg);
      piano.mappa.push({ externalId, entitaId: perCodice.id, nuova: true });
      continue;
    }
    piano.crea.push({ externalId, cantiereId, nome, codice, descrizione });
    piano.mappa.push({ externalId, entitaId: null, nuova: true });
  }
  return piano;
}

/**
 * La mappa `external del cantiere → nostro id`: prima le mappature vere, poi
 * il codice commessa come rete di riserva (non sovrascrive mai una mappatura).
 */
export function cantierePerExternalDa(
  mappature: readonly { externalId: string; entitaId: string }[],
  cantieri: readonly { id: string; codiceCommessa: string | null }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of mappature) out.set(m.externalId, m.entitaId);
  for (const c of cantieri) {
    const cod = pulito(c.codiceCommessa);
    if (cod && !out.has(cod)) out.set(cod, c.id);
  }
  return out;
}
