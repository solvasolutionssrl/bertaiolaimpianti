import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import { lunediDellaSettimana, addGiorni } from '@kommessa/api/pianificazione';
import { caricaBlocchiRange, caricaAssenze } from './_lib/query';
import { PianificazioneClient, type DipRow, type CantRow, type MezzoRow } from './_components/pianificazione-client';

export const dynamic = 'force-dynamic';

export default async function PianificazionePage({
  searchParams,
}: {
  searchParams: { lun?: string };
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const oggi = romeDay(new Date());
  const oggiLunedi = lunediDellaSettimana(oggi);
  const lunRaw = searchParams.lun;
  const lunedi =
    lunRaw && /^\d{4}-\d{2}-\d{2}$/.test(lunRaw) ? lunediDellaSettimana(lunRaw) : oggiLunedi;
  const domenica = addGiorni(lunedi, 6);

  const [dipRes, cantRes, mezziRes, blocchi, assenze, gruppiRes, membriRes] = await Promise.all([
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome, mansione, a_turni, stato_attivo')
      .eq('tenant_id', ctx.tenantId)
      .eq('stato_attivo', true)
      .order('cognome'),
    supabase
      .from('cantieri' as never)
      .select('id, nome, codice_commessa, cliente_nome, categoria, stato')
      .eq('tenant_id', ctx.tenantId)
      .neq('stato', 'chiuso')
      .order('nome'),
    supabase
      .from('mezzi' as never)
      .select('id, targa, modello, tipo, attivo')
      .eq('tenant_id', ctx.tenantId)
      .eq('attivo', true)
      .order('targa'),
    caricaBlocchiRange(supabase, ctx.tenantId, lunedi, domenica),
    caricaAssenze(supabase, ctx.tenantId, lunedi, domenica),
    supabase
      .from('gruppi_approvazione' as never)
      .select('id, nome, colore')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
    supabase
      .from('gruppo_membri' as never)
      .select('gruppo_id, dipendente_id')
      .eq('tenant_id', ctx.tenantId),
  ]);

  const gruppi = ((gruppiRes.data ?? []) as unknown as {
    id: string;
    nome: string;
    colore: string | null;
  }[]).map((g) => ({ id: g.id, nome: g.nome, colore: g.colore }));
  const dipGruppo: Record<string, string> = {};
  for (const m of (membriRes.data ?? []) as unknown as {
    gruppo_id: string;
    dipendente_id: string;
  }[]) {
    dipGruppo[m.dipendente_id] = m.gruppo_id;
  }

  const dipendenti: DipRow[] = ((dipRes.data ?? []) as unknown as Array<{
    id: string;
    nome: string;
    cognome: string;
    mansione: string | null;
    a_turni: boolean;
  }>).map((d) => ({
    id: d.id,
    nome: d.nome,
    cognome: d.cognome,
    mansione: d.mansione,
    aTurni: d.a_turni,
  }));

  const cantieri: CantRow[] = ((cantRes.data ?? []) as unknown as Array<{
    id: string;
    nome: string;
    codice_commessa: string | null;
    cliente_nome: string | null;
    categoria: string | null;
  }>).map((c) => ({
    id: c.id,
    nome: c.nome,
    codiceCommessa: c.codice_commessa,
    clienteNome: c.cliente_nome,
    categoria: c.categoria,
  }));

  const mezzi: MezzoRow[] = ((mezziRes.data ?? []) as unknown as Array<{
    id: string;
    targa: string;
    modello: string | null;
    tipo: string;
  }>).map((m) => ({ id: m.id, targa: m.targa, modello: m.modello, tipo: m.tipo }));

  return (
    <PianificazioneClient
      lunediISO={lunedi}
      oggiLunediISO={oggiLunedi}
      oggiISO={oggi}
      dipendenti={dipendenti}
      cantieri={cantieri}
      mezzi={mezzi}
      blocchi={blocchi}
      assenze={assenze}
      gruppi={gruppi}
      dipGruppo={dipGruppo}
    />
  );
}
