import type { StatoGiornataTimbro } from '@kommessa/api/timbro-giornata';

import type { GiornataTimbroLetta, TimbroVisto } from './giornate';

/**
 * La giornata timbrata come la si passa a un componente client: senza
 * millisecondi, senza mappe, con i nomi gia' risolti. Un tipo solo per
 * ufficio, telefono e console, cosi' «da ripartire» ha una forma sola.
 */
export interface TimbroGiornataVista {
  chiave: string;
  dipendenteId: string;
  dipendenteNome: string;
  giorno: string;
  stato: StatoGiornataTimbro;
  motivo: string | null;
  inizioIso: string | null;
  fineIso: string | null;
  /** Presenza netta delle pause timbrate (minuti), da ripartire. */
  nettoMin: number;
  pausaTimbrataMin: number;
  inizioFisico: boolean;
  fineFisica: boolean;
  primoCantiere: { id: string; nome: string; codice: string | null } | null;
  timbri: TimbroVisto[];
}

export const ETICHETTA_STATO_TIMBRO: Record<StatoGiornataTimbro, string> = {
  nessun_timbro: '',
  presenza_aperta: 'In sede · presenza aperta',
  da_ripartire: 'Da ripartire',
  da_chiudere: 'Turno da chiudere',
  coperta: 'Ore attribuite',
  da_verificare: 'Da verificare',
};

export function vistaDaGiornata(
  g: GiornataTimbroLetta,
  dipendenteNome: string,
  nomeCantiere: (id: string) => { nome: string; codice: string | null } | null,
): TimbroGiornataVista {
  const s = g.scatola;
  const pc = s?.ingressoEsistente ? nomeCantiere(s.ingressoEsistente.cantiereId) : null;
  const primo = g.presenza?.intervalli[0]?.inizioMs ?? null;
  const ultimo = g.presenza?.intervalli[g.presenza.intervalli.length - 1]?.fineMs ?? null;
  const primoTimbro = g.timbri.find((t) => !t.scartato)?.ts ?? null;
  return {
    chiave: `${g.dipendenteId}:${g.giorno}`,
    dipendenteId: g.dipendenteId,
    dipendenteNome,
    giorno: g.giorno,
    stato: g.stato,
    motivo: g.motivo,
    inizioIso: s ? new Date(s.inizioMs).toISOString() : primo != null ? new Date(primo).toISOString() : primoTimbro,
    fineIso: s ? new Date(s.fineMs).toISOString() : ultimo != null ? new Date(ultimo).toISOString() : null,
    nettoMin: s?.nettoMin ?? g.presenza?.minutiNetti ?? 0,
    pausaTimbrataMin: s?.pausaTimbrataMin ?? g.presenza?.minutiPausa ?? 0,
    inizioFisico: s?.inizioFisico ?? true,
    fineFisica: s?.fineFisica ?? true,
    primoCantiere: s?.ingressoEsistente
      ? { id: s.ingressoEsistente.cantiereId, nome: pc?.nome ?? 'Cantiere', codice: pc?.codice ?? null }
      : null,
    timbri: g.timbri,
  };
}
