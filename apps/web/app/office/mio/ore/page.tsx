import { createServerSupabase } from '@kommessa/api/server';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { leggiTutto, leggiPerGruppi } from '@kommessa/api/pagine';
import { arrotondaTimbrature } from '@kommessa/api/arrotondamento-timbri';
import { COLONNE_QUOTE, quoteDaRiga, type RigaRapportinoLetta } from '@kommessa/api/kantiere-quote';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { leggiRegolaTimbri } from '@/app/_lib/kantiere-config';
import { leggiMiaGiornata } from '@/app/office/_lib/mia-giornata';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
import { vistaDaGiornata, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { etichettaConFase, nomiSottocantieri } from '@/app/_lib/sottocantieri-nomi';
import { Intestazione } from '../_components/intestazione';
import { SenzaScheda } from '../_components/senza-scheda';
import { spostaGiorno } from '../_lib/me';
import { OreMioClient, type RigaOreMia } from './_components/ore-mio-client';

export const dynamic = 'force-dynamic';

type RapportinoRow = { id: string; data: string; stato: string };
type RigaRow = RigaRapportinoLetta & { rapportino_id: string; cantiere_id: string | null; sottocantiere_id: string | null };
type TimbRow = { id: string; cantiere_id: string | null; sottocantiere_id: string | null; tipo: string; ts: string; pausa: boolean | null; origine: string | null; created_at: string | null; auto_chiusa: boolean | null };

/**
 * «Le mie ore» da computer: le MIE giornate del periodo. Stesse letture di
 * Presenze e ore, filtrate sulla scheda dipendente di chi guarda e senza i
 * comandi dell'ufficio.
 */
export default async function OreMioPage({ searchParams }: { searchParams: { da?: string; a?: string; stato?: string } }) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const mia = await leggiMiaGiornata(ctx.tenantId, ctx.userId, ctx.role);
  if (!mia) {
    return (
      <>
        <Intestazione titolo="Le mie ore" />
        <SenzaScheda />
      </>
    );
  }
  const oggi = romeDay(new Date());
  const valida = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const a = valida(searchParams.a) ?? oggi;
  const da = valida(searchParams.da) ?? spostaGiorno(a, -31);
  const soloBozze = searchParams.stato === 'bozza';
  const me = mia.dipendenteId;

  const rapportini = await leggiTutto<RapportinoRow>(
    (x, y) => {
      let q = supabase.from('rapportini' as never).select('id, data, stato').eq('tenant_id', ctx.tenantId).eq('dipendente_id', me).gte('data', da).lte('data', a);
      if (soloBozze) q = q.eq('stato', 'bozza').lt('data', oggi);
      return q.order('data', { ascending: false }).order('id').range(x, y) as never;
    },
    { contesto: 'le mie giornate' },
  );
  const righeData = await leggiPerGruppi(rapportini.map((r) => r.id), (gruppo) =>
    leggiTutto<RigaRow>(
      (x, y) => supabase.from('rapportino_righe' as never).select(`rapportino_id, cantiere_id, sottocantiere_id, ${COLONNE_QUOTE}`).in('rapportino_id', gruppo).order('id').range(x, y) as never,
      { contesto: 'le mie righe' },
    ),
  );
  const { fromIso } = romeDayBoundsUtc(da);
  const { toIso } = romeDayBoundsUtc(a);
  const timbRaw = await leggiTutto<TimbRow>(
    (x, y) =>
      supabase
        .from('timbrature' as never)
        .select('id, cantiere_id, sottocantiere_id, tipo, ts, pausa, origine, created_at, auto_chiusa')
        .eq('tenant_id', ctx.tenantId)
        .eq('dipendente_id', me)
        .gte('ts', fromIso)
        .lt('ts', toIso)
        .order('ts')
        .order('id')
        .range(x, y) as never,
    { contesto: 'le mie timbrature' },
  );
  const timb = arrotondaTimbrature(timbRaw, await leggiRegolaTimbri(supabase, ctx.tenantId));
  const [viaggiLegati, viaggiSciolti] = await Promise.all([
    leggiPerGruppi(timb.map((t) => t.id), async (gruppo) => {
      const { data } = await supabase.from('timbratura_viaggio' as never).select('timbratura_id, distanza_km, durata_confermata_min, autista').in('timbratura_id', gruppo);
      return (data as { timbratura_id: string; distanza_km: number | null; durata_confermata_min: number | null; autista: boolean | null }[] | null) ?? [];
    }),
    supabase.from('timbratura_viaggio' as never).select('data, distanza_km, durata_confermata_min, autista').eq('dipendente_id', me).is('timbratura_id', null).gte('data', da).lte('data', a),
  ]);

  const nomiCantieri = new Map<string, string>();
  for (const c of mia.cantieri) nomiCantieri.set(c.id, c.nome);
  const idsFuori = [...new Set([...righeData.map((r) => r.cantiere_id), ...timb.map((t) => t.cantiere_id)])].filter((id): id is string => !!id && !nomiCantieri.has(id));
  if (idsFuori.length > 0) {
    const { data } = await supabase.from('cantieri' as never).select('id, nome, codice').in('id', idsFuori.slice(0, 200));
    for (const c of (data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []) nomiCantieri.set(c.id, c.nome || c.codice || c.id);
  }
  const fasi = await nomiSottocantieri(supabase, ctx.tenantId, [...righeData.map((r) => r.sottocantiere_id), ...timb.map((t) => t.sottocantiere_id)]);
  const etichetta = (cantiereId: string | null, faseId: string | null) =>
    cantiereId ? etichettaConFase(nomiCantieri.get(cantiereId) ?? 'Cantiere', faseId, fasi) : 'Senza cantiere';

  const giornoDi = (ts: string) => romeDay(new Date(ts));
  const timbPerGiorno = new Map<string, TimbRow[]>();
  for (const t of timb) {
    const g = giornoDi(t.ts);
    timbPerGiorno.set(g, [...(timbPerGiorno.get(g) ?? []), t]);
  }
  const giornoDiTimb = new Map(timb.map((t) => [t.id, giornoDi(t.ts)]));
  const viaggioPerGiorno = new Map<string, { km: number; min: number }>();
  const sommaViaggio = (g: string, km: number, min: number, autista: boolean) => {
    const v = viaggioPerGiorno.get(g) ?? { km: 0, min: 0 };
    if (autista) v.km += km;
    v.min += min;
    viaggioPerGiorno.set(g, v);
  };
  for (const v of viaggiLegati) {
    const g = giornoDiTimb.get(v.timbratura_id);
    if (g) sommaViaggio(g, Number(v.distanza_km) || 0, Number(v.durata_confermata_min) || 0, !!v.autista);
  }
  for (const v of (viaggiSciolti.data as { data: string; distanza_km: number | null; durata_confermata_min: number | null; autista: boolean | null }[] | null) ?? []) {
    sommaViaggio(v.data, Number(v.distanza_km) || 0, Number(v.durata_confermata_min) || 0, !!v.autista);
  }

  // Le giornate viste dal terminale (badge e presenza dall'app).
  const nomeCantiere = (id: string) => (nomiCantieri.has(id) ? { nome: nomiCantieri.get(id)!, codice: null } : null);
  const nomeFase = (id: string) => fasi.get(id)?.nome ?? null;
  const timbroLette = await leggiGiornateTimbro(supabase, ctx.tenantId, { dalGiorno: da, alGiorno: a, dipendenteId: me });
  const timbroViste = new Map<string, TimbroGiornataVista>();
  for (const g of timbroLette.values()) timbroViste.set(g.giorno, vistaDaGiornata(g, '', nomeCantiere, mia.modalitaLavoro, nomeFase));

  const righePerRapportino = new Map<string, RigaRow[]>();
  for (const r of righeData) righePerRapportino.set(r.rapportino_id, [...(righePerRapportino.get(r.rapportino_id) ?? []), r]);
  const righe: RigaOreMia[] = rapportini.map((r) => {
    const rr = righePerRapportino.get(r.id) ?? [];
    let lavoro = 0, ord = 0, straord = 0, viaggio = 0;
    for (const x of rr) {
      const q = quoteDaRiga(x);
      lavoro += q.minutiLavoro;
      ord += q.minutiOrdinari;
      straord += q.minutiStraordinari;
      viaggio += q.minutiViaggio;
    }
    const v = viaggioPerGiorno.get(r.data);
    return {
      id: r.id,
      data: r.data,
      stato: r.stato,
      daVerificare: r.stato === 'bozza' && r.data < oggi,
      lavoroMin: lavoro,
      ordinarieMin: ord,
      straordinarieMin: straord,
      viaggioMin: viaggio || v?.min || 0,
      viaggioKm: v?.km ?? 0,
      righe: rr.map((x) => {
        const q = quoteDaRiga(x);
        return { etichetta: etichetta(x.cantiere_id, x.sottocantiere_id), lavoroMin: q.minutiLavoro, viaggioMin: q.minutiViaggio };
      }),
      timbrature: (timbPerGiorno.get(r.data) ?? []).map((t) => ({
        tipo: t.tipo,
        ts: t.ts,
        commessaTitolo: etichetta(t.cantiere_id, t.sottocantiere_id),
        pausa: t.pausa,
        origine: t.origine,
        createdAt: t.created_at,
        autoChiusa: t.auto_chiusa,
      })),
      timbro: timbroViste.get(r.data) ?? null,
    };
  });
  // Giornate timbrate senza rapportino: la presenza c'e', le ore no.
  const conRapportino = new Set(rapportini.map((r) => r.data));
  if (!soloBozze) {
    for (const g of timbroViste.values()) {
      if (conRapportino.has(g.giorno)) continue;
      righe.push({ id: `timbro:${g.chiave}`, data: g.giorno, stato: 'bozza', daVerificare: false, lavoroMin: 0, ordinarieMin: 0, straordinarieMin: 0, viaggioMin: 0, viaggioKm: 0, righe: [], timbrature: [], timbro: g });
    }
    righe.sort((x, y) => y.data.localeCompare(x.data));
  }
  const daRipartire = [...timbroViste.values()].filter((g) => g.stato === 'da_ripartire' || g.stato === 'da_chiudere').sort((x, y) => y.giorno.localeCompare(x.giorno));

  return (
    <>
      <Intestazione titolo="Le mie ore" sotto={soloBozze ? 'Solo le giornate da verificare.' : 'Le giornate del periodo, con la linea del giorno e il dettaglio.'} />
      <OreMioClient mia={mia} righe={righe} daRipartire={daRipartire} periodo={{ da, a }} haTimbratureOggi={mia.haTimbratureOggi} />
    </>
  );
}
