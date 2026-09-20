import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { leggiPerId, leggiTutto } from '@kommessa/api/pagine';
import { numeroAttestatoObbligatorio, serveGiustificativo } from '@kommessa/api/permessi-tipi';
import {
  leggiConfigDipendenti,
  leggiTipiRichiedibili,
  leggiTipiPermessoCustom,
  leggiLabelTipi,
  labelTipoConMappa,
} from '../../../_lib/dipendenti-config';
import { PermessiClient, type RichiestaRow, type DipOpt } from './_components/permessi-client';

/** L'assenza come sta nel database. */
type RichiestaDb = {
  id: string;
  dipendente_id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  tutto_il_giorno: boolean;
  ora_inizio: string | null;
  ora_fine: string | null;
  motivo: string | null;
  stato: string;
  gruppo_id: string | null;
  approver_user_id: string | null;
  deciso_da: string | null;
  deciso_at: string | null;
  decisione_nota: string | null;
  created_at: string;
};

/** Il giustificativo archiviato di un'assenza, come sta nel database. */
type CertificatoRow = {
  id: string;
  permesso_id: string | null;
  tipo_info: 'C' | 'P' | 'M';
  numero: string | null;
  nota: string | null;
  nome_file: string | null;
  size_bytes: number | null;
  r2_key: string | null;
};

export const dynamic = 'force-dynamic';

export default async function PermessiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  const [assenze, dipRes, usersRes, gruppiRes] = await Promise.all([
    // Tutte, a pagine. Con un tetto fisso le assenze piu' vecchie uscivano
    // dall'elenco: i contatori dei filtri mentivano, una richiesta rimasta in
    // attesa diventava indecidibile, e soprattutto non si poteva piu' aprire
    // il giustificativo di una malattia di mesi prima — che intanto
    // continuava a entrare nel file del consulente senza PUC, perche' lui le
    // assenze le legge paginate.
    leggiTutto<RichiestaDb>(
      (da, a) =>
        supabase
          .from('permesso_richieste' as never)
          .select(
            'id, dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato, gruppo_id, approver_user_id, deciso_da, deciso_at, decisione_nota, created_at',
          )
          .eq('tenant_id', ctx.tenantId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(da, a) as never,
      { contesto: 'richieste di ferie e permessi' },
    ),
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome, stato_attivo, user_id')
      .eq('tenant_id', ctx.tenantId)
      .order('cognome'),
    supabase.from('users').select('id, display_name').eq('tenant_id', ctx.tenantId),
    supabase.from('gruppi_approvazione' as never).select('id, nome').eq('tenant_id', ctx.tenantId),
  ]);

  const [tipiOpzioni, labelMap, tipiCustom] = await Promise.all([
    leggiTipiRichiedibili(supabase, ctx.tenantId),
    leggiLabelTipi(supabase, ctx.tenantId),
    // Servono per sapere se un tipo creato dall'azienda vuole un documento:
    // il catalogo non lo conosce, la config del cliente si'.
    leggiTipiPermessoCustom(supabase, ctx.tenantId),
  ]);

  const dipRows = (dipRes.data ?? []) as unknown as {
    id: string;
    nome: string;
    cognome: string;
    stato_attivo: boolean;
    user_id: string | null;
  }[];
  const dipMap = new Map(dipRows.map((d) => [d.id, `${d.cognome} ${d.nome}`.trim()]));
  const dipendentiOpts: DipOpt[] = dipRows
    .filter((d) => d.stato_attivo)
    .map((d) => ({ id: d.id, nome: `${d.cognome} ${d.nome}`.trim() }));
  const mioDip = dipRows.find((d) => d.user_id === ctx.userId)?.id ?? null;
  const userMap = new Map(
    ((usersRes.data ?? []) as unknown as { id: string; display_name: string | null }[]).map((u) => [
      u.id,
      u.display_name ?? '—',
    ]),
  );
  const gruppoMap = new Map(
    ((gruppiRes.data ?? []) as unknown as { id: string; nome: string }[]).map((g) => [g.id, g.nome]),
  );

  // I giustificativi delle assenze mostrate. A gruppi di id, non tutti in una
  // volta: la lista degli id finisce nell'indirizzo della richiesta.
  const idAssenze = assenze.map((r) => r.id);
  const certificati = await leggiPerId<string, CertificatoRow>(
    idAssenze,
    (gruppo, da, a) =>
      supabase
        .from('paghe_certificati' as never)
        .select('id, permesso_id, tipo_info, numero, nota, nome_file, size_bytes, r2_key')
        .in('permesso_id', gruppo)
        .order('permesso_id')
        .order('id')
        .range(da, a) as never,
    { contesto: 'giustificativi delle assenze' },
  );
  const certPerAssenza = new Map<string, CertificatoRow>();
  for (const c of certificati) if (c.permesso_id) certPerAssenza.set(c.permesso_id, c);

  const richieste: RichiestaRow[] = assenze.map((r) => {
    const cert = certPerAssenza.get(r.id) ?? null;
    return {
    id: r.id,
    dipendenteNome: dipMap.get(r.dipendente_id) ?? 'Dipendente',
    tipo: r.tipo,
    tipoLabel: labelTipoConMappa(r.tipo, labelMap),
    // La regola non guarda la parola «malattia»: la porta il tipo con se'.
    richiedeGiustificativo: serveGiustificativo(r.tipo, tipiCustom),
    numeroObbligatorio: numeroAttestatoObbligatorio(r.tipo),
    giustificativo: cert
      ? {
          id: cert.id,
          tipoInfo: cert.tipo_info,
          numero: cert.numero,
          nota: cert.nota,
          nomeFile: cert.nome_file,
          sizeBytes: cert.size_bytes,
          haAllegato: Boolean(cert.r2_key),
        }
      : null,
    dataInizio: r.data_inizio,
    dataFine: r.data_fine,
    tuttoIlGiorno: r.tutto_il_giorno,
    oraInizio: r.ora_inizio ? r.ora_inizio.slice(0, 5) : null,
    oraFine: r.ora_fine ? r.ora_fine.slice(0, 5) : null,
    motivo: r.motivo,
    stato: r.stato as RichiestaRow['stato'],
    gruppoNome: r.gruppo_id ? gruppoMap.get(r.gruppo_id) ?? null : null,
    approverNome: r.approver_user_id ? userMap.get(r.approver_user_id) ?? null : null,
    decisoNome: r.deciso_da ? userMap.get(r.deciso_da) ?? null : null,
    decisoAt: r.deciso_at,
    decisioneNota: r.decisione_nota,
    createdAt: r.created_at,
    };
  });

  return (
    <PermessiClient
      richieste={richieste}
      dipendenti={dipendentiOpts}
      tipiOpzioni={tipiOpzioni}
      mioDip={mioDip}
      oggiISO={romeDay(new Date())}
    />
  );
}
