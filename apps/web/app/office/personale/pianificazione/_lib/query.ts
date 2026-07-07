import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { normalizzaOra, type Fascia } from '@kommessa/api/pianificazione';

type Supa = ReturnType<typeof createServerSupabase>;

export interface BloccoView {
  id: string;
  data: string; // 'YYYY-MM-DD'
  tipo: 'cantiere' | 'evento';
  cantiereId: string | null;
  cantiereNome: string | null;
  titolo: string | null;
  luogo: string | null;
  fascia: Fascia;
  oraInizio: string; // 'HH:MM'
  oraFine: string; // 'HH:MM'
  note: string | null;
  stato: 'bozza' | 'pubblicato';
  membri: string[]; // dipendente ids
  mezzi: string[]; // mezzo ids
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
    .select(
      'id, data, tipo, cantiere_id, titolo, luogo, fascia, ora_inizio, ora_fine, note, stato, ' +
        'membri:pianificazione_membri(dipendente_id), ' +
        'mezzi:pianificazione_blocco_mezzi(mezzo_id), ' +
        'cantiere:cantieri(nome)',
    )
    .eq('tenant_id', tenantId)
    .gte('data', dataFrom)
    .lte('data', dataTo)
    .order('data');

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    data: string;
    tipo: 'cantiere' | 'evento';
    cantiere_id: string | null;
    titolo: string | null;
    luogo: string | null;
    fascia: Fascia;
    ora_inizio: string;
    ora_fine: string;
    note: string | null;
    stato: 'bozza' | 'pubblicato';
    membri: { dipendente_id: string }[] | null;
    mezzi: { mezzo_id: string }[] | null;
    cantiere: { nome: string } | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    data: r.data,
    tipo: r.tipo,
    cantiereId: r.cantiere_id ?? null,
    cantiereNome: r.cantiere?.nome ?? null,
    titolo: r.titolo ?? null,
    luogo: r.luogo ?? null,
    fascia: r.fascia,
    oraInizio: normalizzaOra(r.ora_inizio) ?? '08:00',
    oraFine: normalizzaOra(r.ora_fine) ?? '17:00',
    note: r.note ?? null,
    stato: r.stato,
    membri: (r.membri ?? []).map((m) => m.dipendente_id),
    mezzi: (r.mezzi ?? []).map((m) => m.mezzo_id),
  }));
}
