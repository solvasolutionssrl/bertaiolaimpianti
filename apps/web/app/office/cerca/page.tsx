import Link from 'next/link';
import { createServerSupabase } from '@impiantixplus/api/server';
import { Card, CardContent, Input } from '@impiantixplus/ui';
import { FileText, Folder, Image as ImgIcon, Search, TicketCheck } from 'lucide-react';
import { SectionHeader } from '../../_components/section-header';
import { fmtData } from '../_lib/format';

export const metadata = { title: 'Ricerca' };
export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
}

export default async function CercaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = (searchParams.q ?? '').trim();
  const supabase = createServerSupabase();

  let commesse: any[] = [];
  let tickets: any[] = [];
  let documenti: any[] = [];
  let foto: any[] = [];

  if (q) {
    const [comRes, ticRes, fileRes] = await Promise.all([
      supabase
        .from('commesse')
        .select('id, codice_interno, nome_cartella, stato, data_apertura, cliente:cliente_id(ragione_sociale)')
        .or(`codice_interno.ilike.%${q}%,nome_cartella.ilike.%${q}%`)
        .limit(10),
      supabase
        .from('tickets')
        .select('id, codice, oggetto, stato, created_at')
        .or(`codice.ilike.%${q}%,oggetto.ilike.%${q}%`)
        .limit(10),
      supabase
        .from('file_refs')
        .select('id, filename, mime, commessa_id, uploaded_at, thumbnail_url')
        .ilike('filename', `%${q}%`)
        .limit(20),
    ]);
    commesse = comRes.data ?? [];
    tickets = ticRes.data ?? [];
    documenti = (fileRes.data ?? []).filter((f: any) => !f.mime.startsWith('image/'));
    foto = (fileRes.data ?? []).filter((f: any) => f.mime.startsWith('image/'));
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Ricerca"
        title="Ricerca globale"
        description="Trova commesse, ticket, documenti e foto con un'unica query."
        icon={<Search />}
      />

      <form method="GET">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cerca commesse, ticket, documenti, foto…"
            className="pl-9"
            autoFocus
          />
        </div>
      </form>

      {!q ? (
        <p className="text-sm text-muted-foreground">
          Inserisci un termine di ricerca per iniziare.
        </p>
      ) : (
        <div className="space-y-6">
          <Section title={`Commesse (${commesse.length})`} icon={<Folder className="h-4 w-4" />}>
            {commesse.length === 0 ? (
              <Empty />
            ) : (
              commesse.map((c: any) => {
                const cl = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
                return (
                  <Link
                    key={c.id}
                    href={`/office/commesse/${c.id}`}
                    className="block rounded-md border border-border p-3 text-sm hover:bg-muted/50"
                  >
                    <p>
                      <span className="font-mono font-medium">{c.codice_interno}</span> —{' '}
                      {cl?.ragione_sociale ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.nome_cartella} · {c.stato} · {fmtData(c.data_apertura)}
                    </p>
                  </Link>
                );
              })
            )}
          </Section>

          <Section title={`Ticket (${tickets.length})`} icon={<TicketCheck className="h-4 w-4" />}>
            {tickets.length === 0 ? (
              <Empty />
            ) : (
              tickets.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/office/tickets/${t.id}`}
                  className="block rounded-md border border-border p-3 text-sm hover:bg-muted/50"
                >
                  <p>
                    <span className="font-mono font-medium">{t.codice}</span> — {t.oggetto}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.stato}</p>
                </Link>
              ))
            )}
          </Section>

          <Section title={`Documenti (${documenti.length})`} icon={<FileText className="h-4 w-4" />}>
            {documenti.length === 0 ? (
              <Empty />
            ) : (
              documenti.map((f: any) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtData(f.uploaded_at)}
                  </span>
                </div>
              ))
            )}
          </Section>

          <Section title={`Foto (${foto.length})`} icon={<ImgIcon className="h-4 w-4" />}>
            {foto.length === 0 ? (
              <Empty />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {foto.map((f: any) => (
                  <div
                    key={f.id}
                    className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {f.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.thumbnail_url}
                        alt={f.filename}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImgIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <Card>
        <CardContent className="space-y-2 p-3">{children}</CardContent>
      </Card>
    </section>
  );
}

function Empty() {
  return <p className="py-3 text-center text-xs text-muted-foreground">Nessun risultato.</p>;
}
