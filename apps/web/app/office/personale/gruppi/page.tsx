import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { leggiConfigDipendenti } from '../../../_lib/dipendenti-config';
import { GruppiClient, type GruppoRow, type DipRow, type UtenteRow } from './_components/gruppi-client';

export const dynamic = 'force-dynamic';

export default async function GruppiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const cfg = await leggiConfigDipendenti(supabase, ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  const [gruppiRes, membriRes, dipRes, usersRes] = await Promise.all([
    supabase
      .from('gruppi_approvazione' as never)
      .select('id, nome, approver_user_id, note')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
    supabase
      .from('gruppo_membri' as never)
      .select('gruppo_id, dipendente_id')
      .eq('tenant_id', ctx.tenantId),
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome, mansione')
      .eq('tenant_id', ctx.tenantId)
      .eq('stato_attivo', true)
      .order('cognome'),
    supabase
      .from('users')
      .select('id, display_name, role, puo_approvare_permessi')
      .eq('tenant_id', ctx.tenantId)
      .eq('attivo', true)
      .neq('role', 'cliente')
      .order('display_name'),
  ]);

  const membri = (membriRes.data ?? []) as unknown as { gruppo_id: string; dipendente_id: string }[];
  const perGruppo = new Map<string, string[]>();
  for (const m of membri) {
    const arr = perGruppo.get(m.gruppo_id);
    if (arr) arr.push(m.dipendente_id);
    else perGruppo.set(m.gruppo_id, [m.dipendente_id]);
  }

  const gruppi: GruppoRow[] = (
    (gruppiRes.data ?? []) as unknown as {
      id: string;
      nome: string;
      approver_user_id: string | null;
      note: string | null;
    }[]
  ).map((g) => ({
    id: g.id,
    nome: g.nome,
    approverUserId: g.approver_user_id,
    note: g.note,
    membri: perGruppo.get(g.id) ?? [],
  }));

  const dipendenti: DipRow[] = (
    (dipRes.data ?? []) as unknown as {
      id: string;
      nome: string;
      cognome: string;
      mansione: string | null;
    }[]
  ).map((d) => ({ id: d.id, nome: d.nome, cognome: d.cognome, mansione: d.mansione }));

  const utenti: UtenteRow[] = (
    (usersRes.data ?? []) as unknown as {
      id: string;
      display_name: string | null;
      role: string;
      puo_approvare_permessi: boolean | null;
    }[]
  ).map((u) => ({
    id: u.id,
    nome: u.display_name ?? '(senza nome)',
    role: u.role,
    puoApprovare: u.puo_approvare_permessi === true,
  }));

  return <GruppiClient gruppi={gruppi} dipendenti={dipendenti} utenti={utenti} />;
}
