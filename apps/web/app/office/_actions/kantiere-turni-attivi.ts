'use server';

import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, leggiPerId, type EsitoPagina } from '@kommessa/api/pagine';
import { requireTenantContext } from '@kommessa/api/tenant';
import { romeDay } from '@kommessa/api/rome-time';
import { dichiaraInizioPausa } from '@kommessa/api/timbro-passo';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/** Una pagina di righe da `leggiTutto`: il builder di supabase-js tipizzato a mano. */
type Pagina<T> = PromiseLike<EsitoPagina<T>>;

/**
 * **Chi c'è adesso.** Due bocche, una card.
 *
 * 1. **Turno su un cantiere** — un INGRESSO aperto in `timbrature`: la persona
 *    ha timbrato col QR o dall'app e sappiamo anche *dove*.
 * 2. **Presenza al terminale** — un badge in `timbri_grezzi` senza un'uscita di
 *    fine: sappiamo che c'è, non su quale cantiere.
 *
 * ⚠️⚠️ **La seconda bocca mancava, e la card mentiva.** Con il contenitore
 * virtuale (`Logiche_Integrazione_Timbro.md` §4) `timbrature` nasce solo
 * all'attribuzione delle ore: su un cliente che timbra al terminale restava
 * vuota tutto il giorno, quindi «Turni attivi» diceva **nessuno** mentre trenta
 * persone erano al lavoro. Misurato su FPM il 26/10/2026.
 *
 * ⭐ **E la pausa pranzo si vede solo grazie alla fase dichiarata.** Mentre si
 * mangia l'ultimo passaggio è un'uscita, quindi la giornata «risulta chiusa» e
 * la persona sparirebbe da qui per ricomparire al rientro. Se il terminale ha
 * chiesto e la persona ha risposto PAUSA (`passo: pause_start`,
 * `passo_origine: person`) lo sappiamo, e resta in elenco col pallino giallo.
 * Senza fase un'uscita resta un'uscita: è il prezzo dichiarato di non indovinare.
 *
 * Usato dal cruscotto Kantiere, con polling per una vista «live».
 */

export type TurnoAttivo = {
  dipendenteId: string;
  dipendenteNome: string;
  inizioTs: string;
  /** true se il turno è aperto ma il dipendente è in pausa pranzo. */
  inPausa: boolean;
  /** Da dove lo sappiamo: il turno su un cantiere, o il badge al terminale. */
  fonte: 'cantiere' | 'terminale';
  /** Pause già timbrate (minuti): si scalano dal tempo trascorso. */
  pausaMin: number;
  /** Il tempo scorre ancora (non è in pausa, non è finito). */
  aperta: boolean;
  /** Il netto già calcolato, per quando non scorre più. */
  nettoMin: number;
  viaggio: {
    sedeNome: string | null;
    km: number | null;
    durataMin: number | null;
    autista: boolean;
    mezzoTarga: string | null;
  } | null;
};

export type GruppoTurni = {
  /** `null` = il gruppo di chi c'è senza che si sappia su quale cantiere. */
  cantiereId: string | null;
  cantiereNome: string;
  turni: TurnoAttivo[];
};

type Result = { ok: true; gruppi: GruppoTurni[]; totale: number } | { ok: false; error: string };

type TimbRow = {
  id: string;
  dipendente_id: string;
  cantiere_id: string | null;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
};

export async function turniAttivi(): Promise<Result> {
  const ctx = await requireTenantContext();
  if (!['admin', 'office'].includes(ctx.role)) return { ok: false, error: 'FORBIDDEN' };
  if (!(await tenantHasModule('kantiere'))) return { ok: false, error: 'MODULO_OFF' };

  const supabase = createServerSupabase();

  // Finestra ampia (20h) per coprire i turni iniziati in giornata, evitando
  // ambiguità di fuso sul confine giorno. Solo timbrature su CANTIERE.
  const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
  // A pagine: con molti dipendenti 20 ore di timbrature superano le 1000 righe.
  let righe: TimbRow[];
  try {
    righe = await leggiTutto<TimbRow>(
      (da, a) =>
        supabase
          .from('timbrature' as never)
          .select('id, dipendente_id, cantiere_id, tipo, ts, pausa')
          .eq('tenant_id', ctx.tenantId)
          .not('cantiere_id', 'is', null)
          .gte('ts', since)
          .order('ts', { ascending: true })
          .order('id', { ascending: true })
          .range(da, a) as unknown as Pagina<TimbRow>,
      { contesto: 'turni attivi: timbrature' },
    );
  } catch (e) {
    console.error('[turni-attivi]', e);
    return { ok: false, error: 'LETTURA_FALLITA' };
  }

  // Per ogni (dipendente, cantiere): il turno resta "aperto" finché non arriva
  // un'uscita di FINE turno. L'uscita di pausa lo mantiene aperto ("in pausa").
  // `ingressoId` resta quello dell'inizio turno (a cui è legato il viaggio andata).
  const aperti = new Map<
    string,
    {
      dipId: string;
      cantId: string;
      inizioTs: string;
      ingressoId: string;
      inPausa: boolean;
      /** Quando è cominciata la pausa in corso: serve a congelare il conto. */
      pausaDaTs: string | null;
      /** Pause già chiuse dentro questo turno (minuti). */
      pausaMin: number;
    }
  >();
  for (const t of righe) {
    if (!t.cantiere_id) continue;
    const key = `${t.dipendente_id}:${t.cantiere_id}`;
    const cur = aperti.get(key);
    if (t.tipo === 'ingresso') {
      if (!cur) {
        aperti.set(key, {
          dipId: t.dipendente_id,
          cantId: t.cantiere_id,
          inizioTs: t.ts,
          ingressoId: t.id,
          inPausa: false,
          pausaDaTs: null,
          pausaMin: 0,
        });
      } else {
        // Ripresa dopo pausa: il buco si chiude e si somma, o il tempo
        // trascorso conterebbe anche l'ora del pranzo.
        if (cur.pausaDaTs) {
          cur.pausaMin += Math.max(0, Math.round((Date.parse(t.ts) - Date.parse(cur.pausaDaTs)) / 60_000));
          cur.pausaDaTs = null;
        }
        cur.inPausa = false;
      }
    } else if (t.pausa) {
      if (cur) {
        cur.inPausa = true;
        cur.pausaDaTs = t.ts;
      }
    } else {
      aperti.delete(key); // fine turno
    }
  }

  const attivi = Array.from(aperti.values());

  // ── Seconda bocca: chi c'è al terminale, senza un cantiere ────────────────
  // Si legge la giornata di OGGI (ora italiana) e si tiene chi è ancora
  // dentro: presenza aperta, oppure fermo in una pausa **dichiarata**.
  // ⚠️ Chi ha già un turno su un cantiere non si ripete: lì si sa anche dove.
  const conTurno = new Set(attivi.map((a) => a.dipId));
  const presenti: {
    dipId: string;
    inizioTs: string;
    inPausa: boolean;
    pausaMin: number;
    aperta: boolean;
    nettoMin: number;
  }[] = [];
  try {
    const oggi = romeDay(new Date());
    const giornate = await leggiGiornateTimbro(supabase, ctx.tenantId, { dalGiorno: oggi, alGiorno: oggi });
    for (const g of giornate.values()) {
      if (conTurno.has(g.dipendenteId)) continue;
      const vivi = g.timbri.filter((t) => !t.scartato);
      const ultimo = vivi[vivi.length - 1];
      if (!ultimo) continue;
      const aperta = g.presenza?.aperta === true;
      const inPausa = !aperta && ultimo.tipo === 'uscita' && dichiaraInizioPausa({ step: ultimo.passo, step_source: ultimo.passoOrigine });
      if (!aperta && !inPausa) continue;
      const inizioMs = g.presenza?.intervalli[0]?.inizioMs ?? null;
      presenti.push({
        dipId: g.dipendenteId,
        inizioTs: inizioMs != null ? new Date(inizioMs).toISOString() : (vivi[0]?.ts ?? ultimo.ts),
        inPausa,
        pausaMin: g.presenza?.minutiPausa ?? 0,
        aperta,
        nettoMin: g.presenza?.minutiNetti ?? 0,
      });
    }
  } catch (e) {
    // ⚠️ Il terminale non deve poter spegnere la card: se la lettura fallisce
    // si mostra comunque chi ha un turno su un cantiere.
    console.error('[turni-attivi] presenze dal terminale:', e);
  }

  if (attivi.length === 0 && presenti.length === 0) return { ok: true, gruppi: [], totale: 0 };

  const dipIds = [...new Set([...attivi.map((a) => a.dipId), ...presenti.map((p) => p.dipId)])];
  const cantIds = [...new Set(attivi.map((a) => a.cantId))];
  const ingressoIds = attivi.map((a) => a.ingressoId);

  type ViaRow = {
    timbratura_id: string;
    sede_id: string | null;
    distanza_km: number | null;
    durata_confermata_min: number | null;
    autista: boolean;
    mezzo_id: string | null;
  };
  type Dip = { id: string; nome: string; cognome: string };
  type Cant = { id: string; nome: string | null; codice: string | null };
  // Id a gruppi (URL) e ogni gruppo a pagine.
  let dipRows: Dip[];
  let cantRows: Cant[];
  let viaRows: ViaRow[];
  try {
    [dipRows, cantRows, viaRows] = await Promise.all([
      leggiPerId(
        dipIds,
        (gruppo, da, a) =>
          supabase
            .from('dipendenti' as never)
            .select('id, nome, cognome')
            .in('id', gruppo)
            .order('id')
            .range(da, a) as unknown as Pagina<Dip>,
        { contesto: 'turni attivi: dipendenti' },
      ),
      leggiPerId(
        cantIds,
        (gruppo, da, a) =>
          supabase
            .from('cantieri' as never)
            .select('id, nome, codice')
            .in('id', gruppo)
            .order('id')
            .range(da, a) as unknown as Pagina<Cant>,
        { contesto: 'turni attivi: cantieri' },
      ),
      leggiPerId(
        ingressoIds,
        (gruppo, da, a) =>
          supabase
            .from('timbratura_viaggio' as never)
            .select('timbratura_id, sede_id, distanza_km, durata_confermata_min, autista, mezzo_id')
            .in('timbratura_id', gruppo)
            .order('id')
            .range(da, a) as unknown as Pagina<ViaRow>,
        { contesto: 'turni attivi: viaggi' },
      ),
    ]);
  } catch (e) {
    console.error('[turni-attivi]', e);
    return { ok: false, error: 'LETTURA_FALLITA' };
  }

  const dipMap = new Map<string, string>();
  for (const d of dipRows) dipMap.set(d.id, titoloCase(`${d.nome} ${d.cognome}`));

  const cantMap = new Map<string, string>();
  for (const c of cantRows) cantMap.set(c.id, titoloCase(c.nome || c.codice || c.id));
  const viaByIngresso = new Map<string, ViaRow>();
  for (const v of viaRows) viaByIngresso.set(v.timbratura_id, v);

  // Risolvi sedi + mezzi referenziati dai viaggi
  const sedeIds = [...new Set(viaRows.flatMap((v) => (v.sede_id ? [v.sede_id] : [])))];
  const mezzoIds = [...new Set(viaRows.flatMap((v) => (v.mezzo_id ? [v.mezzo_id] : [])))];
  const [sediRes, mezziRes] = await Promise.all([
    sedeIds.length
      ? supabase.from('sedi' as never).select('id, nome').in('id', sedeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    mezzoIds.length
      ? supabase.from('mezzi' as never).select('id, targa').in('id', mezzoIds)
      : Promise.resolve({ data: [] as { id: string; targa: string }[] }),
  ]);
  const sedeMap = new Map<string, string>();
  for (const s of (sediRes.data as { id: string; nome: string }[] | null) ?? []) sedeMap.set(s.id, s.nome);
  const mezzoMap = new Map<string, string>();
  for (const m of (mezziRes.data as { id: string; targa: string }[] | null) ?? []) mezzoMap.set(m.id, m.targa);

  // Raggruppa per cantiere
  const gruppiMap = new Map<string, GruppoTurni>();
  for (const a of attivi) {
    const via = viaByIngresso.get(a.ingressoId) ?? null;
    const turno: TurnoAttivo = {
      dipendenteId: a.dipId,
      dipendenteNome: dipMap.get(a.dipId) ?? a.dipId,
      inizioTs: a.inizioTs,
      inPausa: a.inPausa,
      fonte: 'cantiere',
      pausaMin: a.pausaMin,
      // In pausa il tempo non scorre: vale il netto fino all'inizio della pausa.
      aperta: !a.inPausa,
      nettoMin: a.inPausa && a.pausaDaTs
        ? Math.max(0, Math.round((Date.parse(a.pausaDaTs) - Date.parse(a.inizioTs)) / 60_000) - a.pausaMin)
        : 0,
      viaggio: via
        ? {
            sedeNome: via.sede_id ? sedeMap.get(via.sede_id) ?? null : null,
            km: via.distanza_km != null ? Number(via.distanza_km) : null,
            durataMin: via.durata_confermata_min != null ? Number(via.durata_confermata_min) : null,
            autista: via.autista,
            mezzoTarga: via.mezzo_id ? mezzoMap.get(via.mezzo_id) ?? null : null,
          }
        : null,
    };
    const g = gruppiMap.get(a.cantId) ?? {
      cantiereId: a.cantId,
      cantiereNome: cantMap.get(a.cantId) ?? a.cantId,
      turni: [],
    };
    g.turni.push(turno);
    gruppiMap.set(a.cantId, g);
  }

  // Ordina i turni per ora inizio (più recente in alto) e i gruppi per nome
  const gruppi = Array.from(gruppiMap.values())
    .map((g) => ({
      ...g,
      turni: g.turni.sort((x, y) => Date.parse(y.inizioTs) - Date.parse(x.inizioTs)),
    }))
    .sort((a, b) => a.cantiereNome.localeCompare(b.cantiereNome));

  // ⚠️ Chi c'è e basta va **in fondo**, in un gruppo suo: il cantiere non si
  // inventa, e mischiarli coi turni localizzati farebbe credere che manchi
  // un'informazione che invece non è mai stata chiesta a nessuno.
  if (presenti.length > 0) {
    gruppi.push({
      cantiereId: null,
      cantiereNome: 'Presenti · cantiere da indicare',
      turni: presenti
        .map((p) => ({
          dipendenteId: p.dipId,
          dipendenteNome: dipMap.get(p.dipId) ?? p.dipId,
          inizioTs: p.inizioTs,
          inPausa: p.inPausa,
          fonte: 'terminale' as const,
          pausaMin: p.pausaMin,
          aperta: p.aperta,
          nettoMin: p.nettoMin,
          viaggio: null,
        }))
        .sort((x, y) => Date.parse(y.inizioTs) - Date.parse(x.inizioTs)),
    });
  }

  return { ok: true, gruppi, totale: attivi.length + presenti.length };
}
