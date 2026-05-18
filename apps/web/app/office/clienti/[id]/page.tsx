import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@impiantixplus/api/server';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, StatoBadge } from '@impiantixplus/ui';
import { EmptyState } from '../../../_components/empty-state';
import { ClienteForm } from '../_components/form';
import { fmtData } from '../../_lib/format';

export const dynamic = 'force-dynamic';

export default async function ClienteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabase();
  const [clRes, comRes] = await Promise.all([
    supabase
      .from('clienti')
      .select(
        'id, ragione_sociale, tipo, indirizzo, citta, cap, provincia, partita_iva, codice_fiscale, telefoni, email, note',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('commesse')
      .select('id, codice_interno, stato, data_apertura, nome_cartella')
      .eq('cliente_id', params.id)
      .order('data_apertura', { ascending: false })
      .limit(20),
  ]);
  if (clRes.error || !clRes.data) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link
        href="/office/clienti"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Torna ai clienti
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {clRes.data.ragione_sociale}
        </h1>
      </header>

      <ClienteForm initial={clRes.data as any} />

      <section className="space-y-3">
        {(comRes.data ?? []).length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="Nessuna commessa per questo cliente"
            description="Apri una nuova commessa per cominciare a tracciare i lavori associati."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Commesse del cliente · {(comRes.data ?? []).length}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {(comRes.data ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-primary-soft/40 sm:px-6"
                  >
                    <Link
                      href={`/office/commesse/${c.id}`}
                      className="font-mono font-medium text-primary hover:underline"
                    >
                      {c.codice_interno}
                    </Link>
                    <span className="text-muted-foreground">·</span>
                    <span className="min-w-0 flex-1 truncate">{c.nome_cartella}</span>
                    <StatoBadge stato={c.stato as any} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmtData(c.data_apertura)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
