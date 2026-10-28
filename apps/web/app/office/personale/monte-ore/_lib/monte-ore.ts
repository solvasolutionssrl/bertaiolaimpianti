import 'server-only';

import { createServerSupabase } from '@kommessa/api/server';
import { COLONNE_QUOTE, sommaQuote, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import { leggiPerId, leggiTutto } from '@kommessa/api/pagine';
import { estremiDelMese, giorniDelPeriodo } from '@kommessa/api/paghe-mappatura';
import { margineMese, type GiornoMargine, type MargineMese } from '@kommessa/api/margine-ore';
import { romeDay } from '@kommessa/api/rome-time';
import { leggiRegolaQuote } from '@/app/_lib/kantiere-config';

/**
 * Il monte ore di un mese, persona per persona (28/10/2026).
 *
 * Mette insieme le giornate registrate (le quote delle righe, cioe' le stesse
 * ore che vanno nell'export) e le assenze approvate; la regola sta in
 * `@kommessa/api/margine-ore`. I giorni futuri non si contano: il mese in corso
 * si legge fino a oggi.
 */

export interface MonteOrePersona {
  id: string;
  nome: string;
  mansione: string | null;
  saldo: MargineMese;
}

type Supa = ReturnType<typeof createServerSupabase>;

function minutiFra(inizio: string | null, fine: string | null): number {
  if (!inizio || !fine) return 0;
  const [hi, mi] = inizio.split(':').map(Number);
  const [hf, mf] = fine.split(':').map(Number);
  const d = (hf! * 60 + mf!) - (hi! * 60 + mi!);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export async function caricaMonteOre(
  supabase: Supa,
  tenantId: string,
  periodo: string,
  opts: { dipendenteId?: string } = {},
): Promise<{ persone: MonteOrePersona[]; dal: string; al: string; orarioMin: number }> {
  const mese = estremiDelMese(periodo);
  const oggi = romeDay(new Date());
  const al = mese.al < oggi ? mese.al : oggi;
  const dal = mese.dal;
  const regola = await leggiRegolaQuote(supabase, tenantId);
  if (dal > al) return { persone: [], dal, al, orarioMin: regola.orarioOrdinarioMin };

  const [dipendenti, rapportini, permessi] = await Promise.all([
    leggiTutto<{ id: string; nome: string; cognome: string; mansione: string | null }>(
      (da, a) => {
        let q = supabase
          .from('dipendenti' as never)
          .select('id, nome, cognome, mansione')
          .eq('tenant_id', tenantId)
          .eq('stato_attivo', true);
        if (opts.dipendenteId) q = q.eq('id', opts.dipendenteId);
        return q.order('cognome').order('id').range(da, a) as never;
      },
      { contesto: 'dipendenti monte ore' },
    ),
    leggiTutto<{ id: string; dipendente_id: string; data: string; stato: string; orario_ordinario_min: number | null }>(
      (da, a) => {
        let q = supabase
          .from('rapportini' as never)
          .select('id, dipendente_id, data, stato, orario_ordinario_min')
          .eq('tenant_id', tenantId)
          .gte('data', dal)
          .lte('data', al)
          .neq('stato', 'rifiutato');
        if (opts.dipendenteId) q = q.eq('dipendente_id', opts.dipendenteId);
        return q.order('data').order('id').range(da, a) as never;
      },
      { contesto: 'giornate monte ore' },
    ),
    leggiTutto<{
      dipendente_id: string;
      data_inizio: string;
      data_fine: string;
      tutto_il_giorno: boolean;
      ora_inizio: string | null;
      ora_fine: string | null;
    }>(
      (da, a) => {
        let q = supabase
          .from('permesso_richieste' as never)
          .select('id, dipendente_id, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine')
          .eq('tenant_id', tenantId)
          .eq('stato', 'approvato')
          .lte('data_inizio', al)
          .gte('data_fine', dal);
        if (opts.dipendenteId) q = q.eq('dipendente_id', opts.dipendenteId);
        return q.order('data_inizio').order('id').range(da, a) as never;
      },
      { contesto: 'assenze monte ore' },
    ),
  ]);

  const righe = await leggiPerId<string, RigaRapportinoLetta & { rapportino_id: string }>(
    rapportini.map((r) => r.id),
    (gruppo, da, a) =>
      supabase
        .from('rapportino_righe' as never)
        .select(`rapportino_id, ${COLONNE_QUOTE}`)
        .in('rapportino_id', gruppo)
        .order('rapportino_id')
        .order('id')
        .range(da, a) as never,
    { contesto: 'ore monte ore' },
  );
  const righePer = new Map<string, (RigaRapportinoLetta & { rapportino_id: string })[]>();
  for (const r of righe) {
    const l = righePer.get(r.rapportino_id);
    if (l) l.push(r);
    else righePer.set(r.rapportino_id, [r]);
  }

  const chiave = (dip: string, data: string) => `${dip}|${data}`;
  const giornata = new Map(rapportini.map((r) => [chiave(r.dipendente_id, r.data), r]));
  const assenteIntero = new Set<string>();
  const permessoMin = new Map<string, number>();
  for (const p of permessi) {
    const inizio = p.data_inizio < dal ? dal : p.data_inizio;
    const fine = p.data_fine > al ? al : p.data_fine;
    for (const d of giorniDelPeriodo(inizio, fine)) {
      const k = chiave(p.dipendente_id, d);
      if (p.tutto_il_giorno) assenteIntero.add(k);
      else permessoMin.set(k, (permessoMin.get(k) ?? 0) + minutiFra(p.ora_inizio, p.ora_fine));
    }
  }

  const giorni = giorniDelPeriodo(dal, al);
  const persone = dipendenti.map((d) => {
    const elenco: GiornoMargine[] = giorni.map((data) => {
      const k = chiave(d.id, data);
      const rap = giornata.get(k);
      const tot = rap ? sommaQuote(righePer.get(rap.id) ?? []) : null;
      return {
        data,
        minutiLavoro: tot?.minutiLavoro ?? 0,
        minutiViaggioOrdinari: tot?.minutiViaggioOrdinari ?? 0,
        minutiViaggioEccedenti: tot?.minutiViaggioEccedenti ?? 0,
        orarioMin: rap?.orario_ordinario_min ?? regola.orarioOrdinarioMin,
        minutiPermesso: permessoMin.get(k) ?? 0,
        assenzaIntera: assenteIntero.has(k),
        registrata: Boolean(rap),
      };
    });
    return {
      id: d.id,
      nome: `${d.cognome} ${d.nome}`.trim(),
      mansione: d.mansione,
      saldo: margineMese(elenco),
    };
  });

  return { persone, dal, al, orarioMin: regola.orarioOrdinarioMin };
}
