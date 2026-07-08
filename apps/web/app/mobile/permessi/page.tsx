import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '../../_lib/modules';
import {
  leggiConfigDipendenti,
  leggiTipiRichiedibili,
  leggiLabelTipi,
  labelTipoConMappa,
} from '../../_lib/dipendenti-config';
import { PermessiMobileClient, type MiaRichiesta, type DaApprovare } from './_components/permessi-mobile-client';

export const metadata: Metadata = { title: 'Ferie e permessi' };
export const dynamic = 'force-dynamic';

export default async function PermessiMobilePage() {
  const ctx = await guardMobile();
  if (!(await tenantHasModule('dipendenti'))) notFound();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const mioDip = (dipRow as { id: string } | null)?.id ?? null;

  const [mieRes, daApprRes, dipRes, meRes] = await Promise.all([
    mioDip
      ? supabase
          .from('permesso_richieste' as never)
          .select(
            'id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato, decisione_nota, created_at',
          )
          .eq('tenant_id', ctx.tenantId)
          .eq('dipendente_id', mioDip)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from('permesso_richieste' as never)
      .select(
        'id, dipendente_id, tipo, data_inizio, data_fine, tutto_il_giorno, ora_inizio, ora_fine, motivo, stato',
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('approver_user_id', ctx.userId)
      .in('stato', ['in_attesa', 'modifica_richiesta'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('dipendenti' as never).select('id, nome, cognome').eq('tenant_id', ctx.tenantId),
    supabase.from('users').select('puo_approvare_permessi').eq('id', ctx.userId).maybeSingle(),
  ]);

  const dipMap = new Map(
    ((dipRes.data ?? []) as unknown as { id: string; nome: string; cognome: string }[]).map((d) => [
      d.id,
      `${d.cognome} ${d.nome}`.trim(),
    ]),
  );

  const labelMap = await leggiLabelTipi(supabase, ctx.tenantId);

  const fmt = (r: {
    tipo: string;
    data_inizio: string;
    data_fine: string;
    tutto_il_giorno: boolean;
    ora_inizio: string | null;
    ora_fine: string | null;
  }) => ({
    tipoLabel: labelTipoConMappa(r.tipo, labelMap),
    dataInizio: r.data_inizio,
    dataFine: r.data_fine,
    tuttoIlGiorno: r.tutto_il_giorno,
    oraInizio: r.ora_inizio ? r.ora_inizio.slice(0, 5) : null,
    oraFine: r.ora_fine ? r.ora_fine.slice(0, 5) : null,
  });

  const mieRichieste: MiaRichiesta[] = (
    (mieRes.data ?? []) as unknown as Array<{
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
    }>
  ).map((r) => ({
    id: r.id,
    ...fmt(r),
    motivo: r.motivo,
    stato: r.stato as MiaRichiesta['stato'],
    decisioneNota: r.decisione_nota,
  }));

  const daApprovare: DaApprovare[] = (
    (daApprRes.data ?? []) as unknown as Array<{
      id: string;
      dipendente_id: string;
      tipo: string;
      data_inizio: string;
      data_fine: string;
      tutto_il_giorno: boolean;
      ora_inizio: string | null;
      ora_fine: string | null;
      motivo: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    dipendenteNome: dipMap.get(r.dipendente_id) ?? 'Dipendente',
    ...fmt(r),
    motivo: r.motivo,
  }));

  const puoApprovare =
    (meRes.data as { puo_approvare_permessi?: boolean } | null)?.puo_approvare_permessi === true ||
    daApprovare.length > 0;

  const tipiOpzioni = await leggiTipiRichiedibili(supabase, ctx.tenantId);

  return (
    <PermessiMobileClient
      mioDip={mioDip}
      oggiISO={romeDay(new Date())}
      tipiOpzioni={tipiOpzioni}
      mieRichieste={mieRichieste}
      daApprovare={daApprovare}
      puoApprovare={puoApprovare}
    />
  );
}
