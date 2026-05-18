import Link from 'next/link';
import { createServerSupabase } from '@impiantixplus/api/server';
import { requireTenantContextCached as requireTenantContext } from '../../_lib/tenant-cache';
import { Card, CardContent, CardHeader, CardTitle } from '@impiantixplus/ui';
import { Bell, BellRing } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { EmptyState } from '../../_components/empty-state';
import { fmtDataOra } from '../_lib/format';

export const metadata = { title: 'Notifiche' };
export const dynamic = 'force-dynamic';

interface SearchParams {
  filter?: 'all' | 'unread';
}

const TYPE_LABEL: Record<string, string> = {
  ticket_assigned: 'Ticket assegnato',
  ticket_new_message: 'Nuovo messaggio ticket',
  fase_zero_foto: 'Fase senza foto',
  dico_scadenza: 'DICO in scadenza',
  commessa_pronta: 'Commessa pronta per chiusura',
};

export default async function NotifichePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const filter = searchParams.filter ?? 'all';

  let q = supabase
    .from('notifiche')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (filter === 'unread') q = q.is('read_at', null);

  const { data, error } = await q;
  const rows = error ? [] : data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Notifiche"
        title="Centro notifiche"
        description="Eventi sui tuoi ticket e commesse. Filtra per leggere solo ciò che è nuovo."
        icon={<BellRing />}
        actions={
          <nav className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1 text-xs">
            <Link
              href="/office/notifiche?filter=all"
              className={`rounded-sm px-3 py-1 transition-colors ${
                filter === 'all'
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tutte
            </Link>
            <Link
              href="/office/notifiche?filter=unread"
              className={`rounded-sm px-3 py-1 transition-colors ${
                filter === 'unread'
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Non lette
            </Link>
          </nav>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === 'unread' ? 'Tutto letto' : 'Nessuna notifica'}
          description={
            filter === 'unread'
              ? 'Non ci sono notifiche non lette. Goditi il silenzio operativo.'
              : 'Le notifiche compaiono qui appena qualcuno apre un ticket, completa una fase o carica un DICO.'
          }
        />
      ) : (
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {rows.map((n: any) => {
            const payload = (n.payload ?? {}) as Record<string, any>;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-4 text-sm transition-colors hover:bg-muted/30 ${
                  n.read_at ? 'opacity-70' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                    n.read_at ? 'bg-muted-foreground/30' : 'bg-accent'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {TYPE_LABEL[n.type] ?? n.type}
                  </p>
                  {payload.descrizione && (
                    <p className="text-xs text-muted-foreground">
                      {payload.descrizione}
                    </p>
                  )}
                  {payload.commessa_id && (
                    <Link
                      href={`/office/commesse/${payload.commessa_id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Vai alla commessa →
                    </Link>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtDataOra(n.created_at)}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
      )}

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Preferenze
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span>Email</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked />
              <span>Push app (PWA)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" />
              <span>Solo in orario lavoro (8-19)</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Le preferenze verranno persistite quando il profilo utente sarà
              completato.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
