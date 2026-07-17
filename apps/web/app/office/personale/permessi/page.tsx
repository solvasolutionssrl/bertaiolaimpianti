import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import {
  leggiConfigDipendenti,
  leggiTipiRichiedibili,
  leggiLabelTipi,
  labelTipoConMappa,
} from '../../../_lib/dipendenti-config';
import { PermessiClient, type RichiestaRow, type DipOpt } from './_components/permessi-client';

export const dynamic = 'force-dynamic';

export default async function PermessiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  const [richRes, dipRes, usersRes, gruppiRes] = await Promise.all([
    supabase
      .from('permesso_richieste' as never)
      .select(
        'id, dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato, gruppo_id, approver_user_id, deciso_da, deciso_at, decisione_nota, created_at',
      )
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome, stato_attivo, user_id')
      .eq('tenant_id', ctx.tenantId)
      .order('cognome'),
    supabase.from('users').select('id, display_name').eq('tenant_id', ctx.tenantId),
    supabase.from('gruppi_approvazione' as never).select('id, nome').eq('tenant_id', ctx.tenantId),
  ]);

  const [tipiOpzioni, labelMap] = await Promise.all([
    leggiTipiRichiedibili(supabase, ctx.tenantId),
    leggiLabelTipi(supabase, ctx.tenantId),
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

  const richieste: RichiestaRow[] = (
    (richRes.data ?? []) as unknown as Array<{
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
    }>
  ).map((r) => ({
    id: r.id,
    dipendenteNome: dipMap.get(r.dipendente_id) ?? 'Dipendente',
    tipo: r.tipo,
    tipoLabel: labelTipoConMappa(r.tipo, labelMap),
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
  }));

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
