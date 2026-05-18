import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calendar, FolderOpen, PlusCircle } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatoBadge,
} from '@impiantixplus/ui';
import { createServerSupabase } from '@impiantixplus/api/server';

import { requirePortalContext } from './_lib/portal-context';
import { ProgressFasi } from './_components/progress-fasi';

export const metadata: Metadata = {
  title: 'Le mie commesse',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: string;
  data_apertura: string;
  cliente_indirizzo_cantiere: string | null;
}

interface FasiAgg {
  commessa_id: string;
  totali: number;
  completate: number;
}

/**
 * Homepage portale: lista commesse del cliente loggato.
 *
 * Filtro RLS: la RLS `commesse_portal_read` (vedi note in fondo) deve
 * intersecare tenant + cliente_id (== claim JWT `cliente_id`).
 * Qui aggiungiamo un `.eq('cliente_id', ctx.clienteId)` esplicito come
 * doppia barriera applicativa.
 */
export default async function PortalHomePage() {
  const ctx = await requirePortalContext();
  const supabase = createServerSupabase();

  const { data: commesse, error } = await supabase
    .from('commesse')
    .select(
      'id, codice_interno, nome_cartella, stato, data_apertura, cliente_indirizzo_cantiere',
    )
    .eq('cliente_id', ctx.clienteId)
    .order('data_apertura', { ascending: false })
    .returns<CommessaRow[]>();

  if (error) {
    console.error('[portal/home] errore lettura commesse', error.message);
  }

  const rows = commesse ?? [];
  const ids = rows.map((r) => r.id);

  // Aggregazione fasi: una query separata per evitare GROUP BY annidati.
  let fasiByCommessa = new Map<string, { totali: number; completate: number }>();
  if (ids.length > 0) {
    const { data: voci } = await supabase
      .from('commessa_voci')
      .select('commessa_id, stato')
      .in('commessa_id', ids)
      .returns<{ commessa_id: string; stato: string }[]>();
    fasiByCommessa = aggregaFasi(voci ?? []);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Le mie commesse</h1>
        <p className="text-sm text-muted-foreground">
          Ciao {ctx.cliente.ragioneSociale}. Qui trovi lo stato dei lavori in
          corso e i documenti che l&apos;ufficio ha pubblicato per te.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((c) => {
            const agg = fasiByCommessa.get(c.id) ?? { totali: 0, completate: 0 };
            return (
              <li key={c.id}>
                <Link
                  href={`/commessa/${c.id}`}
                  className="block transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Card className="h-full transition hover:border-[var(--brand-color,theme(colors.primary.DEFAULT))] hover:shadow-md">
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">
                          {umanizzaNomeCartella(c.nome_cartella)}
                        </CardTitle>
                        <StatoBadgeSafe stato={c.stato} />
                      </div>
                      <CardDescription className="font-mono text-xs uppercase tracking-wide">
                        {c.codice_interno}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {c.cliente_indirizzo_cantiere ? (
                        <p className="text-sm text-muted-foreground">
                          {c.cliente_indirizzo_cantiere}
                        </p>
                      ) : null}

                      <ProgressFasi
                        totali={agg.totali}
                        completate={agg.completate}
                        compact
                      />

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Aperta il {formatDate(c.data_apertura)}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          Dettagli <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Ti serve un nuovo intervento?
            </h2>
            <p className="text-sm text-muted-foreground">
              Apri una richiesta: l&apos;ufficio ti risponderà via email e qui
              nel portale.
            </p>
          </div>
          <Button asChild>
            <Link href="/richiedi">
              <PlusCircle className="h-4 w-4" />
              Richiedi intervento
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <FolderOpen className="h-10 w-10 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-base font-medium">Nessuna commessa attiva</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Non risultano ancora lavori a te associati. Se hai richiesto un
            intervento, l&apos;ufficio lo aprirà a breve.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/richiedi">Richiedi un intervento</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function aggregaFasi(
  rows: { commessa_id: string; stato: string }[],
): Map<string, { totali: number; completate: number }> {
  const map = new Map<string, { totali: number; completate: number }>();
  for (const r of rows) {
    const cur = map.get(r.commessa_id) ?? { totali: 0, completate: 0 };
    cur.totali += 1;
    if (r.stato === 'completata') cur.completate += 1;
    map.set(r.commessa_id, cur);
  }
  return map;
}

function umanizzaNomeCartella(s: string): string {
  // "Rossi_2026-05-10_SistemazioneBagno" → "Sistemazione Bagno"
  const last = s.split('_').slice(2).join('_') || s;
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function StatoBadgeSafe({ stato }: { stato: string }) {
  // StatoBadge è tipizzato sui valori commessa noti — fallback safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <StatoBadge stato={stato as any} />;
}
