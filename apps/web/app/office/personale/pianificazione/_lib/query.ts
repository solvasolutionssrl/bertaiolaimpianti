import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { normalizzaOra, addGiorni, type Fascia } from '@kommessa/api/pianificazione';
import { labelTipoPermesso } from '@kommessa/api/permessi-tipi';

type Supa = ReturnType<typeof createServerSupabase>;

/** Assenza approvata proiettata su un singolo giorno (per i conflitti/indicatori). */
export interface AssenzaView {
  dipendenteId: string;
  data: string; // 'YYYY-MM-DD'
  tuttoIlGiorno: boolean;
  oraInizio: string | null; // 'HH:MM'
  oraFine: string | null;
  tipoLabel: string;
}

/**
 * Ferie/permessi APPROVATI che intersecano il range, espansi per giorno. Usato
 * dalla pianificazione per bloccare/segnalare l'assegnazione di chi è assente.
 */
export async function caricaAssenze(
  supabase: Supa,
  tenantId: string,
  dataFrom: string,
  dataTo: string,
): Promise<AssenzaView[]> {
  const { data } = await supabase
    .from('permesso_richieste' as never)
    .select('dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine')
    .eq('tenant_id', tenantId)
    .eq('stato', 'approvato')
    .lte('data_inizio', dataTo)
    .gte('data_fine', dataFrom);

  const rows = (data ?? []) as unknown as Array<{
    dipendente_id: string;
    tipo: string;
    data_inizio: string;
    data_fine: string;
    tutto_il_giorno: boolean;
    ora_inizio: string | null;
    ora_fine: string | null;
  }>;

  const out: AssenzaView[] = [];
  for (const r of rows) {
    let d = r.data_inizio < dataFrom ? dataFrom : r.data_inizio;
    const end = r.data_fine > dataTo ? dataTo : r.data_fine;
    let guard = 0;
    while (d <= end && guard < 400) {
      out.push({
        dipendenteId: r.dipendente_id,
        data: d,
        tuttoIlGiorno: r.tutto_il_giorno,
        oraInizio: normalizzaOra(r.ora_inizio),
        oraFine: normalizzaOra(r.ora_fine),
        tipoLabel: labelTipoPermesso(r.tipo),
      });
      d = addGiorni(d, 1);
      guard++;
    }
  }
  return out;
}

export type TipoBlocco = 'cantiere' | 'evento' | 'formazione';

export interface BloccoView {
  id: string;
  data: string; // 'YYYY-MM-DD'
  tipo: TipoBlocco;
  cantiereId: string | null;
  cantiereNome: string | null;
  titolo: string | null;
  luogo: string | null;
  luogoLat: number | null;
  luogoLng: number | null;
  fascia: Fascia;
  oraInizio: string; // 'HH:MM'
  oraFine: string; // 'HH:MM'
  note: string | null;
  stato: 'bozza' | 'pubblicato';
  membri: string[]; // dipendente ids
  mezzi: string[]; // mezzo ids
}

const SELECT_BLOCCO =
  'id, data, tipo, cantiere_id, titolo, luogo, luogo_lat, luogo_lng, fascia, ora_inizio, ora_fine, note, stato, ' +
  'membri:pianificazione_membri(dipendente_id), ' +
  'mezzi:pianificazione_blocco_mezzi(mezzo_id), ' +
  'cantiere:cantieri(nome)';

interface BloccoRowRaw {
  id: string;
  data: string;
  tipo: TipoBlocco;
  cantiere_id: string | null;
  titolo: string | null;
  luogo: string | null;
  luogo_lat: number | null;
  luogo_lng: number | null;
  fascia: Fascia;
  ora_inizio: string;
  ora_fine: string;
  note: string | null;
  stato: 'bozza' | 'pubblicato';
  membri: { dipendente_id: string }[] | null;
  mezzi: { mezzo_id: string }[] | null;
  cantiere: { nome: string } | null;
}

function mapBloccoRow(r: BloccoRowRaw): BloccoView {
  return {
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    cantiereId: r.cantiere_id ?? null,
    cantiereNome: r.cantiere?.nome ?? null,
    titolo: r.titolo ?? null,
    luogo: r.luogo ?? null,
    luogoLat: r.luogo_lat ?? null,
    luogoLng: r.luogo_lng ?? null,
    fascia: r.fascia,
    oraInizio: normalizzaOra(r.ora_inizio) ?? '08:00',
    oraFine: normalizzaOra(r.ora_fine) ?? '17:00',
    note: r.note ?? null,
    stato: r.stato,
    membri: (r.membri ?? []).map((m) => m.dipendente_id),
    mezzi: (r.mezzi ?? []).map((m) => m.mezzo_id),
  };
}

/**
 * Blocchi pianificati (con membri, mezzi e nome cantiere) in un range di giorni
 * [dataFrom, dataTo] inclusi. Una sola query con embed PostgREST. Usato dalla
 * pagina (settimana) e dalle action (singolo giorno) per il calcolo conflitti.
 */
export async function caricaBlocchiRange(
  supabase: Supa,
  tenantId: string,
  dataFrom: string,
  dataTo: string,
): Promise<BloccoView[]> {
  const { data } = await supabase
    .from('pianificazione_blocchi' as never)
    .select(SELECT_BLOCCO)
    .eq('tenant_id', tenantId)
    .gte('data', dataFrom)
    .lte('data', dataTo)
    .order('data');

  return ((data ?? []) as unknown as BloccoRowRaw[]).map(mapBloccoRow);
}

/** Un singolo blocco per id (scoping tenant esplicito). Per sposta/ripeti. */
export async function caricaBloccoById(
  supabase: Supa,
  tenantId: string,
  id: string,
): Promise<BloccoView | null> {
  const { data } = await supabase
    .from('pianificazione_blocchi' as never)
    .select(SELECT_BLOCCO)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return mapBloccoRow(data as unknown as BloccoRowRaw);
}
