import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { leggiMiaGiornata } from '@/app/office/_lib/mia-giornata';
import { leggiGiornateTimbro } from '@/app/_lib/timbro/giornate';
import { vistaDaGiornata, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { metaNotifica } from '@/app/_components/notifiche-meta';
import { Intestazione } from './_components/intestazione';
import { SenzaScheda } from './_components/senza-scheda';
import { OggiClient, type AvvisoRecente } from './_components/oggi-client';
import { spostaGiorno } from './_lib/me';

export const dynamic = 'force-dynamic';

/**
 * «Oggi» del tecnico da computer (23/10/2026). La stessa lettura della pillola
 * dell'ufficio (`leggiMiaGiornata`) e le mie giornate timbrate ancora da
 * sistemare: tutto filtrato sulla MIA scheda dipendente.
 */
export default async function OggiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const mia = await leggiMiaGiornata(ctx.tenantId, ctx.userId, ctx.role);
  const oggi = romeDay(new Date());

  const [timbro, anomalie, avvisi] = mia
    ? await Promise.all([
        leggiGiornateTimbro(supabase, ctx.tenantId, { dalGiorno: spostaGiorno(oggi, -31), alGiorno: oggi, dipendenteId: mia.dipendenteId }),
        supabase
          .from('rapportini' as never)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
          .eq('dipendente_id', mia.dipendenteId)
          .eq('stato', 'bozza')
          .gte('data', spostaGiorno(oggi, -31))
          .lt('data', oggi),
        supabase
          .from('notifiche')
          .select('id, type, payload, read_at, created_at')
          .eq('user_id', ctx.userId)
          .order('created_at', { ascending: false })
          .limit(6),
      ])
    : [null, null, null];

  if (!mia) {
    return (
      <>
        <Intestazione titolo="Oggi" />
        <SenzaScheda />
      </>
    );
  }

  const nomeCantiere = (id: string) => {
    const c = mia.cantieri.find((x) => x.id === id);
    return c ? { nome: c.nome, codice: c.codice } : null;
  };
  const nomeFase = (id: string) => mia.cantieri.flatMap((c) => c.sottocantieri ?? []).find((f) => f.id === id)?.nome ?? null;
  const viste: TimbroGiornataVista[] = [...(timbro?.values() ?? [])]
    .map((g) => vistaDaGiornata(g, `${ctx.email}`, nomeCantiere, mia.modalitaLavoro, nomeFase))
    .sort((a, b) => b.giorno.localeCompare(a.giorno));
  const timbroOggi = viste.find((g) => g.giorno === oggi) ?? null;
  const daSistemare = viste.filter((g) => g.stato === 'da_ripartire' || g.stato === 'da_chiudere' || g.stato === 'da_verificare');

  const avvisiRecenti: AvvisoRecente[] = (
    (avvisi?.data as { id: string; type: string; payload: Record<string, unknown> | null; read_at: string | null; created_at: string }[] | null) ?? []
  ).map((n) => {
    const p = n.payload ?? {};
    return {
      id: n.id,
      titolo: typeof p.title === 'string' ? p.title : typeof p.descrizione === 'string' ? p.descrizione : metaNotifica(n.type).label,
      quando: n.created_at,
      url: typeof p.url === 'string' && p.url.startsWith('/office') ? p.url : null,
      letto: !!n.read_at,
    };
  });

  return (
    <>
      <Intestazione titolo="Oggi" sotto="La giornata, le ore da completare e gli ultimi avvisi." />
      <OggiClient mia={mia} timbroOggi={timbroOggi} timbro={daSistemare} nAnomalie={anomalie?.count ?? 0} avvisi={avvisiRecenti} />
    </>
  );
}
