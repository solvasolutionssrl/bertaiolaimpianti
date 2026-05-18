import Link from 'next/link';
import { createServerSupabase } from '@impiantixplus/api/server';
import { Button, Card, CardContent, Input } from '@impiantixplus/ui';
import { Plus, Search, Users, UserPlus } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';

export const metadata = { title: 'Clienti' };
export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
}

export default async function ClientiPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createServerSupabase();
  let q = supabase
    .from('clienti')
    .select('id, ragione_sociale, tipo, citta, telefoni, email')
    .order('ragione_sociale')
    .limit(200);
  if (searchParams.q) {
    q = q.ilike('ragione_sociale', `%${searchParams.q}%`);
  }
  const { data, error } = await q;
  const rows = error ? [] : data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Anagrafica"
        title="Clienti"
        description="Aziende e persone fisiche associate alle commesse. Cerca per ragione sociale."
        icon={<Users />}
        actions={
          <Button asChild>
            <Link href="/office/clienti/nuovo">
              <Plus className="h-4 w-4" />
              Nuovo cliente
            </Link>
          </Button>
        }
      />

      <form method="GET">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Cerca ragione sociale…"
            className="pl-9"
          />
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={searchParams.q ? 'Nessun cliente trovato' : 'Anagrafica clienti vuota'}
          description={
            searchParams.q
              ? `Nessun risultato per "${searchParams.q}". Prova un altro termine.`
              : 'Aggiungi il primo cliente per cominciare a creare commesse e ticket.'
          }
          action={
            searchParams.q ? (
              <Button asChild variant="outline">
                <Link href="/office/clienti">Reset ricerca</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/office/clienti/nuovo">
                  <Plus className="h-4 w-4" />
                  Aggiungi cliente
                </Link>
              </Button>
            )
          }
        />
      ) : (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Ragione sociale</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Città</th>
                  <th className="px-4 py-3 font-medium">Telefono</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any, i: number) => (
                  <tr
                    key={c.id}
                    className={
                      i % 2 === 0
                        ? 'border-b border-border transition-colors hover:bg-primary-soft/50'
                        : 'border-b border-border bg-muted/20 transition-colors hover:bg-primary-soft/50'
                    }
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/office/clienti/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.ragione_sociale}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.tipo === 'azienda' ? 'Azienda' : 'Persona fisica'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.citta ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.telefoni ?? []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(c.email ?? []).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
