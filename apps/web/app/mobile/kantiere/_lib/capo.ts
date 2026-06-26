import { createServerSupabase } from '@kommessa/api/server';
import { statoTurno } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/**
 * Helper "gestione squadra" per il caposquadra Kantiere.
 *
 * Il ruolo "capo" non è un ruolo utente ma una riga `cantiere_squadra.ruolo='capo'`.
 * Qui rileviamo se l'utente corrente è capo di almeno un cantiere e, per la
 * pagina dedicata, costruiamo lo stato live (a casa / in turno / in pausa) di
 * ogni membro dei cantieri di cui è capo. Le mutazioni vivono nelle action
 * `_actions/kantiere-capo.ts`. Server-only (legge con il client RLS-scoped).
 */

export type StatoMembro = 'idle' | 'lavoro' | 'pausa';

export interface MembroStato {
  dipendenteId: string;
  nome: string;
  ruolo: 'capo' | 'membro';
  stato: StatoMembro;
  /** ISO inizio turno (primo ingresso aperto), o null se a casa. */
  inizioTs: string | null;
  /** ISO inizio pausa in corso, o null. */
  inizioPausa: string | null;
  /** true se oggi risulta già una pausa pranzo timbrata su questo cantiere. */
  pausaOggiFatta: boolean;
}

export interface CantiereSquadra {
  cantiereId: string;
  cantiereNome: string;
  membri: MembroStato[];
}

async function dipendenteId(
  supabase: ReturnType<typeof createServerSupabase>,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** true se l'utente è capo di almeno un cantiere. Gating della tab dedicata. */
export async function sonoCapoSquadra(tenantId: string, userId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const dipId = await dipendenteId(supabase, tenantId, userId);
  if (!dipId) return false;
  const { data } = await supabase
    .from('cantiere_squadra' as never)
    .select('cantiere_id')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipId)
    .eq('ruolo', 'capo')
    .limit(1);
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

type TimbRow = {
  dipendente_id: string;
  cantiere_id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
};

/** Cantieri di cui l'utente è capo, con lo stato turno odierno di ogni membro. */
export async function squadraDelCapo(tenantId: string, userId: string): Promise<CantiereSquadra[]> {
  const supabase = createServerSupabase();
  const dipId = await dipendenteId(supabase, tenantId, userId);
  if (!dipId) return [];

  // Cantieri dove sono capo.
  const { data: capoRows } = await supabase
    .from('cantiere_squadra' as never)
    .select('cantiere_id')
    .eq('tenant_id', tenantId)
    .eq('dipendente_id', dipId)
    .eq('ruolo', 'capo');
  const cantieriIds = [
    ...new Set(((capoRows as { cantiere_id: string }[] | null) ?? []).map((r) => r.cantiere_id)),
  ];
  if (cantieriIds.length === 0) return [];

  // Tutta la squadra di quei cantieri.
  const { data: squadRows } = await supabase
    .from('cantiere_squadra' as never)
    .select('cantiere_id, dipendente_id, ruolo')
    .eq('tenant_id', tenantId)
    .in('cantiere_id', cantieriIds);
  const squad =
    (squadRows as { cantiere_id: string; dipendente_id: string; ruolo: 'capo' | 'membro' }[] | null) ??
    [];
  if (squad.length === 0) return [];

  const dipIds = [...new Set(squad.map((s) => s.dipendente_id))];

  const [cantRes, dipRes] = await Promise.all([
    supabase.from('cantieri' as never).select('id, nome, codice').in('id', cantieriIds),
    supabase.from('dipendenti' as never).select('id, nome, cognome').in('id', dipIds),
  ]);
  const cantMap = new Map<string, string>();
  for (const c of (cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? [])
    cantMap.set(c.id, titoloCase(c.nome || c.codice || c.id));
  const dipMap = new Map<string, string>();
  for (const d of (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [])
    dipMap.set(d.id, titoloCase(`${d.nome} ${d.cognome}`));

  // Timbrature di oggi (Europe/Rome) per quei dipendenti su quei cantieri.
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));
  const { data: timbRows } = await supabase
    .from('timbrature' as never)
    .select('dipendente_id, cantiere_id, tipo, ts, pausa')
    .eq('tenant_id', tenantId)
    .in('dipendente_id', dipIds)
    .in('cantiere_id', cantieriIds)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: true });
  const timb = (timbRows as TimbRow[] | null) ?? [];

  // Eventi per (cantiere:dipendente).
  const eventiByKey = new Map<string, { tipo: 'ingresso' | 'uscita'; ts: string; pausa: boolean | null }[]>();
  for (const t of timb) {
    const key = `${t.cantiere_id}:${t.dipendente_id}`;
    const arr = eventiByKey.get(key) ?? [];
    arr.push({ tipo: t.tipo, ts: t.ts, pausa: t.pausa });
    eventiByKey.set(key, arr);
  }

  return cantieriIds
    .map((cid) => {
      const membri = squad
        .filter((s) => s.cantiere_id === cid)
        .map<MembroStato>((s) => {
          const eventi = eventiByKey.get(`${cid}:${s.dipendente_id}`) ?? [];
          const info = statoTurno(eventi);
          const aperto = info.stato !== 'idle';
          // Inizio turno reale = primo ingresso di fine-turno (non di pausa).
          const inizioTs = aperto
            ? eventi.find((e) => e.tipo === 'ingresso' && !e.pausa)?.ts ?? info.ingressoAperto
            : null;
          // Pausa pranzo già fatta oggi su questo cantiere: serve a decidere se
          // il dialog di fine turno deve mostrare il box "pausa non rilevata".
          const pausaOggiFatta = eventi.some((e) => e.pausa);
          return {
            dipendenteId: s.dipendente_id,
            nome: dipMap.get(s.dipendente_id) ?? s.dipendente_id,
            ruolo: s.ruolo,
            stato: info.stato,
            inizioTs,
            inizioPausa: info.inizioPausa,
            pausaOggiFatta,
          };
        })
        .sort((a, b) => {
          // In turno e in pausa in cima (attivi), poi a casa; a parità per nome.
          const rank = (m: MembroStato) => (m.stato === 'idle' ? 1 : 0);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return a.nome.localeCompare(b.nome);
        });
      return { cantiereId: cid, cantiereNome: cantMap.get(cid) ?? cid, membri };
    })
    .sort((a, b) => a.cantiereNome.localeCompare(b.cantiereNome));
}
