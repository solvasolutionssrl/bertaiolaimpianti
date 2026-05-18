import Link from 'next/link';
import { createServerSupabase } from '@impiantixplus/api/server';
import { Button } from '@impiantixplus/ui';
import { Inbox, Plus, TicketCheck } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';
import type { SlaStatus } from './_components/sla-badge';
import { TicketsListClient, type TicketRow } from './_components/tickets-list-client';

export const metadata = { title: 'Tickets' };
export const dynamic = 'force-dynamic';

const STATI = [
  { value: '', label: 'Tutti' },
  { value: 'aperto', label: 'Aperto' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'attesa_cliente', label: 'Attesa cliente' },
  { value: 'chiuso', label: 'Chiuso' },
];
const PRIORITA = [
  { value: '', label: 'Tutte' },
  { value: 'bassa', label: 'Bassa' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];
const SOURCES = [
  { value: '', label: 'Tutte' },
  { value: 'manual', label: 'Manuale' },
  { value: 'email', label: 'Email' },
  { value: 'portal_cliente', label: 'Portale cliente' },
  { value: 'imported_from_freshdesk', label: 'Freshdesk (legacy)' },
];
const SLA_FILTER = [
  { value: '', label: 'SLA: tutti' },
  { value: 'alert', label: 'Solo a rischio / breach' },
];

// Ordinamento priorità: urgente prima
const PRIORITY_ORDER: Record<string, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  bassa: 3,
};

interface SearchParams {
  stato?: string;
  priorita?: string;
  source?: string;
  sla?: string;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  // Usiamo la view tickets_with_sla per avere `sla_status` calcolato server-side.
  // I join lookup (cliente, assegnato) restano su FK presenti nella tabella
  // sottostante e funzionano regolarmente sulla view.
  let q = supabase
    .from('tickets_with_sla')
    .select(
      `
        id, codice, oggetto, stato, priorita, source, created_at,
        target_response_at, target_close_at, first_response_at, closed_at,
        sla_status,
        cliente:cliente_id ( id, ragione_sociale ),
        assegnato:assegnato_a ( id, display_name )
      `,
    )
    .limit(200);

  if (searchParams.stato) q = q.eq('stato', searchParams.stato as any);
  if (searchParams.priorita) q = q.eq('priorita', searchParams.priorita as any);
  if (searchParams.source) q = q.eq('source', searchParams.source as any);
  if (searchParams.sla === 'alert') {
    // Solo righe con sla_status alert (server-side IN)
    q = q.in('sla_status', [
      'risposta_a_rischio',
      'risposta_breach',
      'chiusura_a_rischio',
      'chiusura_breach',
    ]);
  }

  const [{ data, error }, staffRes] = await Promise.all([
    q,
    supabase
      .from('users')
      .select('id, display_name, role, attivo')
      .eq('attivo', true)
      .in('role', ['owner', 'admin', 'office', 'capo']),
  ]);
  let rows = error ? [] : data ?? [];
  const staff = ((staffRes.data ?? []) as any[]).map((u) => ({
    id: u.id as string,
    display_name: (u.display_name as string | null) ?? null,
  }));

  // Sort di default: priorità (urgente prima) poi target_close_at ASC,
  // con NULL in fondo. Lo facciamo client-side perché PostgREST non
  // ordina facilmente per enum custom in modo personalizzato.
  rows = [...rows].sort((a: any, b: any) => {
    const pa = PRIORITY_ORDER[a.priorita] ?? 99;
    const pb = PRIORITY_ORDER[b.priorita] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = a.target_close_at ? new Date(a.target_close_at).getTime() : Infinity;
    const tb = b.target_close_at ? new Date(b.target_close_at).getTime() : Infinity;
    return ta - tb;
  });

  const hasFilters = Boolean(
    searchParams.stato || searchParams.priorita || searchParams.source || searchParams.sla,
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Assistenza"
        title="Tickets"
        description="Richieste in entrata da clienti, email e portale. Convertili in commessa quando partono i lavori."
        icon={<TicketCheck />}
        actions={
          <Button asChild>
            <Link href="/office/tickets/nuovo">
              <Plus className="h-4 w-4" />
              Nuovo ticket
            </Link>
          </Button>
        }
      />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <SelectFilter name="stato" value={searchParams.stato ?? ''} options={STATI} />
        <SelectFilter name="priorita" value={searchParams.priorita ?? ''} options={PRIORITA} />
        <SelectFilter name="source" value={searchParams.source ?? ''} options={SOURCES} />
        <SelectFilter name="sla" value={searchParams.sla ?? ''} options={SLA_FILTER} />
        <Button type="submit" variant="secondary" size="sm">
          Filtra
        </Button>
        <Link
          href="/office/tickets"
          className="text-xs text-muted-foreground hover:underline"
        >
          Reset
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={hasFilters ? 'Nessun ticket con questi filtri' : 'Nessun ticket aperto'}
          description={
            hasFilters
              ? 'Allenta i filtri per vedere tutti i ticket o crea un nuovo ticket manuale.'
              : 'I ticket arriveranno da email, portale cliente o creazione manuale.'
          }
          action={
            hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/office/tickets">Reset filtri</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/office/tickets/nuovo">
                  <Plus className="h-4 w-4" />
                  Apri il primo ticket
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <TicketsListClient
          rows={rows.map((t: any) => {
            const cliente = Array.isArray(t.cliente) ? t.cliente[0] : t.cliente;
            const assegnato = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
            const r: TicketRow = {
              id: t.id,
              codice: t.codice,
              oggetto: t.oggetto,
              stato: t.stato,
              priorita: t.priorita,
              source: t.source,
              created_at: t.created_at,
              sla_status: (t.sla_status ?? 'ok') as SlaStatus,
              cliente: cliente
                ? { id: cliente.id, ragione_sociale: cliente.ragione_sociale }
                : null,
              assegnato: assegnato
                ? { id: assegnato.id, display_name: assegnato.display_name ?? '' }
                : null,
            };
            return r;
          })}
          staff={staff}
        />
      )}
    </div>
  );
}

function SelectFilter({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

