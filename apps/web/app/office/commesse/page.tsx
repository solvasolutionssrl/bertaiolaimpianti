import Link from 'next/link';
import { createServerSupabase } from '@kommessa/api/server';
import { Button, Input } from '@kommessa/ui';
import { Briefcase, FolderPlus, LayoutList, Plus, Search } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';
import { BozzeDaCompletare } from '../../_components/bozze-da-completare';
import {
  CommesseListClient,
  type CommessaRow,
} from './_components/commesse-list-client';

export const metadata = { title: 'Commesse' };
export const dynamic = 'force-dynamic';

const STATI: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tutti gli stati' },
  // 'bozza' non è più qui: le bozze vivono in commessa_bozze (tabella
  // dedicata, private all'autore) e si riprendono da "Da completare".
  { value: 'aperta', label: 'Non presa' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'collaudo', label: 'In collaudo' },
  { value: 'completata', label: 'Completata' },
  { value: 'archiviata', label: 'Archiviata' },
];

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  stato?: string;
  anno?: string;
  responsabile?: string;
  tipo?: string;
  page?: string;
}

export default async function CommessePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        descrizione_ai_finale,
        descrizione_ai_proposta,
        cliente_indirizzo_cantiere,
        stato,
        data_apertura,
        cliente:cliente_id ( id, ragione_sociale ),
        responsabile:responsabile_id ( id, display_name )
      `,
      { count: 'exact' },
    )
    .order('data_apertura', { ascending: false })
    .order('codice_interno', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (searchParams.stato) query = query.eq('stato', searchParams.stato as any);
  if (searchParams.responsabile)
    query = query.eq('responsabile_id', searchParams.responsabile);
  if (searchParams.anno) {
    const y = Number(searchParams.anno);
    if (!Number.isNaN(y)) {
      query = query
        .gte('data_apertura', `${y}-01-01`)
        .lte('data_apertura', `${y}-12-31`);
    }
  }
  if (searchParams.q) {
    query = query.or(
      `codice_interno.ilike.%${searchParams.q}%,nome_cartella.ilike.%${searchParams.q}%`,
    );
  }

  // Lista commesse + elenco responsabili (per la select filtro) sono
  // indipendenti: parallelizziamo per dimezzare la latenza percepita.
  const [{ data, count, error }, responsabili] = await Promise.all([
    query,
    supabase
      .from('users')
      .select('id, display_name')
      .eq('attivo', true),
  ]);
  const rows = error ? [] : data ?? [];
  const total = count ?? 0;

  // Carica tecnici assegnati per le commesse mostrate, per derivare
  // l'etichetta "Non preso" (aperta/bozza senza tecnici) lato UI.
  const visibleIds = rows.map((r) => r.id as string);
  let assegnateSet = new Set<string>();
  if (visibleIds.length > 0) {
    const { data: ass } = await supabase
      .from('commessa_tecnici')
      .select('commessa_id')
      .in('commessa_id', visibleIds);
    assegnateSet = new Set(
      ((ass ?? []) as Array<{ commessa_id: string }>).map((r) => r.commessa_id),
    );
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    searchParams.q ||
      searchParams.stato ||
      searchParams.anno ||
      searchParams.responsabile ||
      searchParams.tipo,
  );

  return (
    <div className="w-full space-y-4 px-4 pb-6 pt-1 md:px-6 md:pb-8 md:pt-2">
      <SectionHeader
        eyebrow="Commesse"
        title="Lista commesse"
        description="Filtra per stato, anno o responsabile. Clicca una riga per aprire il dettaglio."
        icon={<Briefcase />}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/office/commesse/panoramica">
                <LayoutList className="h-4 w-4" />
                Panoramica
              </Link>
            </Button>
            <Button asChild>
              <Link href="/office/commesse/nuova">
                <Plus className="h-4 w-4" />
                Nuova commessa
              </Link>
            </Button>
          </>
        }
      />

      <BozzeDaCompletare resumeBase="/office/commesse/nuova" variant="office" />

      <form method="GET" className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Cerca per cliente, codice, indirizzo…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            name="stato"
            defaultValue={searchParams.stato ?? ''}
            options={STATI}
          />
          <FilterSelect
            name="anno"
            defaultValue={searchParams.anno ?? ''}
            options={annoOptions()}
          />
          <FilterSelect
            name="responsabile"
            defaultValue={searchParams.responsabile ?? ''}
            options={[
              { value: '', label: 'Tutti i responsabili' },
              ...((responsabili.data ?? []).map((u) => ({
                value: u.id,
                label: u.display_name ?? '—',
              }))),
            ]}
          />
          <Button type="submit" variant="secondary" size="sm">
            Applica
          </Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/office/commesse">Reset</Link>
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Nessuna commessa trovata"
          description={
            hasFilters
              ? 'Prova ad allargare i filtri o resetta la ricerca per vedere tutte le commesse.'
              : 'Crea la tua prima commessa per iniziare a tracciare lavori, fasi e foto.'
          }
          action={
            hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/office/commesse">Reset filtri</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/office/commesse/nuova">
                  <Plus className="h-4 w-4" />
                  Crea la prima commessa
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <CommesseListClient
          rows={rows.map((c: any) => {
            const cliente = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
            const resp = Array.isArray(c.responsabile) ? c.responsabile[0] : c.responsabile;
            // "Cantiere" = il titolo umano della commessa: descrizione AI finale,
            // poi la proposta, fallback indirizzo cantiere.
            const cantiere: string | null =
              ((c.descrizione_ai_finale as string | null) ?? '').trim() ||
              ((c.descrizione_ai_proposta as string | null) ?? '').trim() ||
              ((c.cliente_indirizzo_cantiere as string | null) ?? '').trim() ||
              null;
            const r: CommessaRow = {
              id: c.id,
              codice_interno: c.codice_interno,
              stato: c.stato,
              data_apertura: c.data_apertura ?? null,
              cliente: cliente
                ? { id: cliente.id, ragione_sociale: cliente.ragione_sociale }
                : null,
              responsabile: resp
                ? { id: resp.id, display_name: resp.display_name ?? null }
                : null,
              assegnata: assegnateSet.has(c.id),
              cantiere,
            };
            return r;
          })}
          responsabili={((responsabili.data ?? []) as any[]).map((u) => ({
            id: u.id as string,
            display_name: (u.display_name as string | null) ?? null,
          }))}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        searchParams={searchParams}
      />
    </div>
  );
}

function FilterSelect({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
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

function annoOptions() {
  const now = new Date().getFullYear();
  const list = [{ value: '', label: 'Tutti gli anni' }];
  for (let y = now; y >= now - 5; y -= 1) {
    list.push({ value: String(y), label: String(y) });
  }
  return list;
}

function Pagination({
  page,
  totalPages,
  total,
  searchParams,
}: {
  page: number;
  totalPages: number;
  total: number;
  searchParams: SearchParams;
}) {
  const qs = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') sp.set(k, String(v));
    }
    sp.set('page', String(p));
    return `?${sp.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-muted-foreground">
        {total} commess{total === 1 ? 'a' : 'e'}
      </p>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" disabled={page <= 1}>
          <Link href={qs(Math.max(1, page - 1))}>← Precedente</Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button asChild variant="ghost" size="sm" disabled={page >= totalPages}>
          <Link href={qs(Math.min(totalPages, page + 1))}>Successiva →</Link>
        </Button>
      </div>
    </div>
  );
}
