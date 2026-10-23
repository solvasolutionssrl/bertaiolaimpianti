import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto } from '@kommessa/api/pagine';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { kontabilitaAttiva } from '@/app/_lib/kontabilita-config';
import { leggiMiaGiornata } from '@/app/office/_lib/mia-giornata';
import { etichettaConFase, nomiSottocantieri } from '@/app/_lib/sottocantieri-nomi';
import { Intestazione } from '../_components/intestazione';
import { SenzaScheda } from '../_components/senza-scheda';
import { mioDipendente } from '../_lib/me';
import { SpeseMioClient, type SpesaMia } from './_components/spese-mio-client';

export const dynamic = 'force-dynamic';

type SpesaRow = { id: string; cantiere_id: string | null; sottocantiere_id: string | null; categoria: string | null; ragione_sociale: string | null; importo_totale: number | null; valuta: string | null; data_scontrino: string | null; stato: string | null; foto_mime: string | null; r2_key: string | null };

/** Le MIE spese: filtrate sulla scheda dipendente di chi guarda, in sola lettura, piu' il caricamento. */
export default async function SpeseMioPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const me = await mioDipendente(supabase, ctx.tenantId, ctx.userId);
  if (!me) {
    return (
      <>
        <Intestazione titolo="Le mie spese" />
        <SenzaScheda />
      </>
    );
  }
  const [kontabilita, mia, spese] = await Promise.all([
    kontabilitaAttiva(supabase, ctx.tenantId),
    leggiMiaGiornata(ctx.tenantId, ctx.userId, ctx.role),
    leggiTutto<SpesaRow>(
      (x, y) =>
        supabase
          .from('spese' as never)
          .select('id, cantiere_id, sottocantiere_id, categoria, ragione_sociale, importo_totale, valuta, data_scontrino, stato, foto_mime, r2_key')
          .eq('tenant_id', ctx.tenantId)
          .eq('dipendente_id', me.dipendenteId)
          .order('data_scontrino', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(x, y) as never,
      { contesto: 'le mie spese' },
    ),
  ]);
  const nomi = new Map<string, string>();
  const ids = [...new Set(spese.map((s) => s.cantiere_id).filter((x): x is string => !!x))];
  if (ids.length > 0) {
    const { data } = await supabase.from('cantieri' as never).select('id, nome, codice').in('id', ids.slice(0, 200));
    for (const c of (data as { id: string; nome: string | null; codice: string | null }[] | null) ?? []) nomi.set(c.id, c.nome || c.codice || c.id);
  }
  const fasi = await nomiSottocantieri(supabase, ctx.tenantId, spese.map((s) => s.sottocantiere_id));
  const righe: SpesaMia[] = spese.map((s) => ({
    id: s.id,
    cantiere: s.cantiere_id ? etichettaConFase(nomi.get(s.cantiere_id) ?? 'Cantiere', s.sottocantiere_id, fasi) : null,
    categoria: s.categoria,
    ragioneSociale: s.ragione_sociale,
    importo: s.importo_totale == null ? null : Number(s.importo_totale),
    valuta: s.valuta ?? 'EUR',
    data: s.data_scontrino,
    stato: s.stato,
    fotoMime: s.foto_mime,
    hasFile: !!s.r2_key,
  }));
  return (
    <>
      <Intestazione titolo="Le mie spese" sotto={kontabilita ? 'Le ricevute caricate e il caricamento di una nuova.' : 'La registrazione delle spese non è attiva per questa azienda.'} />
      <SpeseMioClient spese={righe} cantieri={mia?.cantieri ?? []} kontabilita={kontabilita} />
    </>
  );
}
