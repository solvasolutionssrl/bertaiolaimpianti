import { notFound } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import type { RichiestaVista } from '@kommessa/api/permessi-richiesta';
import { requireTenantContextCached as requireTenantContext } from '@/app/_lib/tenant-cache';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiConfigDipendenti, leggiLabelTipi, leggiTipiRichiedibili, labelTipoConMappa } from '@/app/_lib/dipendenti-config';
import { Intestazione } from '../_components/intestazione';
import { SenzaScheda } from '../_components/senza-scheda';
import { mioDipendente } from '../_lib/me';
import { RichiesteMioClient } from './_components/richieste-mio-client';

export const dynamic = 'force-dynamic';

type Riga = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  tutto_il_giorno: boolean;
  ora_inizio: string | null;
  ora_fine: string | null;
  motivo: string | null;
  stato: string;
  decisione_nota: string | null;
  created_at: string;
};

/**
 * «Le mie richieste» da computer: ferie e permessi della persona che guarda,
 * con il modulo per inviarne una. Stesse azioni self del telefono
 * (`richiediPermesso`, `annullaRichiesta`), sempre filtrate sulla sua scheda.
 */
export default async function RichiesteMioPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  if (!(await tenantHasModule('dipendenti'))) notFound();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();
  const me = await mioDipendente(supabase, ctx.tenantId, ctx.userId);
  if (!me) {
    return (
      <>
        <Intestazione titolo="Le mie richieste" />
        <SenzaScheda />
      </>
    );
  }
  const [{ data: righeRaw }, labelMap, tipi] = await Promise.all([
    supabase
      .from('permesso_richieste' as never)
      .select('id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato, decisione_nota, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', me.dipendenteId)
      .order('data_inizio', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    leggiLabelTipi(supabase, ctx.tenantId),
    leggiTipiRichiedibili(supabase, ctx.tenantId),
  ]);
  const richieste: RichiestaVista[] = ((righeRaw as Riga[] | null) ?? []).map((r) => ({
    id: r.id,
    tipoLabel: labelTipoConMappa(r.tipo, labelMap),
    dataInizio: r.data_inizio,
    dataFine: r.data_fine,
    tuttoIlGiorno: r.tutto_il_giorno,
    oraInizio: r.ora_inizio ? r.ora_inizio.slice(0, 5) : null,
    oraFine: r.ora_fine ? r.ora_fine.slice(0, 5) : null,
    motivo: r.motivo,
    stato: r.stato as RichiestaVista['stato'],
    decisioneNota: r.decisione_nota,
    creataIl: r.created_at,
  }));

  return (
    <>
      <Intestazione titolo="Le mie richieste" sotto="Ferie e permessi: le richieste inviate, la risposta dell’ufficio e il modulo per una nuova." />
      <RichiesteMioClient dipendenteId={me.dipendenteId} oggiISO={romeDay(new Date())} tipi={tipi} richieste={richieste} />
    </>
  );
}
