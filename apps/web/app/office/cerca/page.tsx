import Link from 'next/link';
import {
  Briefcase,
  Building2,
  CircleDot,
  FileText,
  Image as ImgIcon,
  MapPin,
  Search,
  Sparkles,
  TicketCheck,
  Tag as TagIcon,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { Card, CardContent, Input } from '@kommessa/ui';

import { SectionHeader } from '../../_components/section-header';
import { TagChip } from '../../_components/tag-editor';
import { fmtData } from '../_lib/format';
import { elencaTagTenant } from '../../_actions/commessa-tag';

export const metadata = { title: 'Ricerca' };
export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  tag?: string;
}

/**
 * Ricerca globale potenziata.
 *
 * Cerca in:
 *  - commesse (codice, nome cartella, indirizzo cantiere, descrizione AI)
 *  - clienti (ragione sociale → trova le loro commesse)
 *  - tickets (codice, oggetto, descrizione)
 *  - file (filename, ocr)
 *  - TODO (titolo, descrizione)
 *  - riunioni (titolo, reportino, corpo, trascrizione)
 *  - tag (filtro singolo via chip)
 *
 * Ranking commesse: codice esatto > prefix > contiene.
 */
export default async function CercaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireTenantContext();
  const q = (searchParams.q ?? '').trim();
  const tagFilter = (searchParams.tag ?? '').trim().toLowerCase();
  const supabase = createServerSupabase();

  const tenantTags = await elencaTagTenant();

  let commesseRows: Array<{
    id: string;
    codice_interno: string | null;
    nome_cartella: string | null;
    stato: string | null;
    cliente_indirizzo_cantiere: string | null;
    data_apertura: string | null;
    cliente_ragione_sociale: string | null;
    tags: string[];
  }> = [];
  let clientiRows: Array<{ id: string; ragione_sociale: string }> = [];
  let ticketsRows: Array<{
    id: string;
    codice: string;
    oggetto: string;
    stato: string;
  }> = [];
  let documentiRows: Array<{
    id: string;
    filename: string;
    uploaded_at: string;
    commessa_id: string | null;
  }> = [];
  let fotoRows: Array<{
    id: string;
    filename: string;
    thumbnail_url: string | null;
    commessa_id: string | null;
  }> = [];
  let todoRows: Array<{
    id: string;
    titolo: string;
    stato: string;
    commessa_id: string;
    codice_interno: string | null;
  }> = [];
  let riunioniRows: Array<{
    id: string;
    titolo: string | null;
    data_riunione: string;
    commessa_id: string;
    codice_interno: string | null;
    snippet: string | null;
  }> = [];

  // ─── Filtro per tag (chip cliccato) ──────────────────────────────────
  if (tagFilter) {
    const { data: byTag } = await supabase
      .from('commessa_tags')
      .select(
        `tag, commessa:commesse!commessa_tags_commessa_id_fkey (
           id, codice_interno, nome_cartella, stato, cliente_indirizzo_cantiere, data_apertura,
           cliente:clienti ( ragione_sociale )
         )`,
      )
      .eq('tag', tagFilter)
      .limit(50);
    commesseRows = ((byTag ?? []) as Array<any>)
      .map((row) => {
        const c = Array.isArray(row.commessa) ? row.commessa[0] : row.commessa;
        if (!c) return null;
        const cl = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
        return {
          id: c.id as string,
          codice_interno: (c.codice_interno as string | null) ?? null,
          nome_cartella: (c.nome_cartella as string | null) ?? null,
          stato: (c.stato as string | null) ?? null,
          cliente_indirizzo_cantiere:
            (c.cliente_indirizzo_cantiere as string | null) ?? null,
          data_apertura: (c.data_apertura as string | null) ?? null,
          cliente_ragione_sociale:
            (cl?.ragione_sociale as string | undefined) ?? null,
          tags: [tagFilter],
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  // ─── Ricerca testuale ───────────────────────────────────────────────
  if (q) {
    const pattern = `%${q}%`;
    const [comRes, cliRes, ticRes, fileRes, todoRes, riuRes, byCliRes] =
      await Promise.all([
        supabase
          .from('commesse')
          .select(
            `id, codice_interno, nome_cartella, stato, cliente_indirizzo_cantiere, data_apertura,
             descrizione_ai_finale, descrizione_ai_proposta,
             cliente:clienti ( ragione_sociale )`,
          )
          .or(
            [
              `codice_interno.ilike.${pattern}`,
              `nome_cartella.ilike.${pattern}`,
              `cliente_indirizzo_cantiere.ilike.${pattern}`,
              `descrizione_ai_finale.ilike.${pattern}`,
              `descrizione_ai_proposta.ilike.${pattern}`,
            ].join(','),
          )
          .limit(15),
        supabase
          .from('clienti')
          .select('id, ragione_sociale')
          .ilike('ragione_sociale', pattern)
          .limit(10),
        supabase
          .from('tickets')
          .select('id, codice, oggetto, stato')
          .or(
            `codice.ilike.${pattern},oggetto.ilike.${pattern},descrizione.ilike.${pattern}`,
          )
          .limit(10),
        supabase
          .from('file_refs')
          .select(
            'id, filename, mime, commessa_id, uploaded_at, thumbnail_url, ocr_text',
          )
          .or(`filename.ilike.${pattern},ocr_text.ilike.${pattern}`)
          .limit(30),
        supabase
          .from('commessa_todo' as never)
          .select(
            `id, titolo, stato, commessa_id,
             commessa:commesse!commessa_todo_commessa_id_fkey ( codice_interno )`,
          )
          .or(`titolo.ilike.${pattern},descrizione.ilike.${pattern}`)
          .limit(15),
        supabase
          .from('commessa_riunione' as never)
          .select(
            `id, titolo, data_riunione, reportino, corpo_libero, commessa_id,
             commessa:commesse!commessa_riunione_commessa_id_fkey ( codice_interno )`,
          )
          .or(
            [
              `titolo.ilike.${pattern}`,
              `reportino.ilike.${pattern}`,
              `corpo_libero.ilike.${pattern}`,
              `trascrizione.ilike.${pattern}`,
            ].join(','),
          )
          .limit(10),
        supabase
          .from('commesse')
          .select(
            `id, codice_interno, nome_cartella, stato, cliente_indirizzo_cantiere, data_apertura,
             cliente:clienti!inner ( ragione_sociale )`,
          )
          .ilike('cliente.ragione_sociale', pattern)
          .limit(10),
      ]);

    const commesseRaw = ((comRes.data ?? []) as Array<any>).map((c) => {
      const cl = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      return {
        id: c.id as string,
        codice_interno: (c.codice_interno as string | null) ?? null,
        nome_cartella: (c.nome_cartella as string | null) ?? null,
        stato: (c.stato as string | null) ?? null,
        cliente_indirizzo_cantiere:
          (c.cliente_indirizzo_cantiere as string | null) ?? null,
        data_apertura: (c.data_apertura as string | null) ?? null,
        cliente_ragione_sociale:
          (cl?.ragione_sociale as string | undefined) ?? null,
        tags: [] as string[],
      };
    });
    const byCliMapped = ((byCliRes.data ?? []) as Array<any>).map((c) => {
      const cl = Array.isArray(c.cliente) ? c.cliente[0] : c.cliente;
      return {
        id: c.id as string,
        codice_interno: (c.codice_interno as string | null) ?? null,
        nome_cartella: (c.nome_cartella as string | null) ?? null,
        stato: (c.stato as string | null) ?? null,
        cliente_indirizzo_cantiere:
          (c.cliente_indirizzo_cantiere as string | null) ?? null,
        data_apertura: (c.data_apertura as string | null) ?? null,
        cliente_ragione_sociale:
          (cl?.ragione_sociale as string | undefined) ?? null,
        tags: [] as string[],
      };
    });
    // Dedup
    const seen = new Set<string>();
    commesseRows = [...commesseRaw, ...byCliMapped].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Tag delle commesse trovate
    if (commesseRows.length > 0) {
      const ids = commesseRows.map((c) => c.id);
      const { data: tagsRaw } = await supabase
        .from('commessa_tags')
        .select('commessa_id, tag')
        .in('commessa_id', ids);
      const byComm = new Map<string, string[]>();
      for (const r of (tagsRaw ?? []) as Array<{
        commessa_id: string;
        tag: string;
      }>) {
        const list = byComm.get(r.commessa_id) ?? [];
        list.push(r.tag);
        byComm.set(r.commessa_id, list);
      }
      commesseRows = commesseRows.map((c) => ({
        ...c,
        tags: byComm.get(c.id) ?? [],
      }));
    }

    const lq = q.toLowerCase();
    commesseRows.sort((a, b) => scoreCommessa(b, lq) - scoreCommessa(a, lq));

    clientiRows = ((cliRes.data ?? []) as Array<{
      id: string;
      ragione_sociale: string;
    }>).slice(0, 10);
    ticketsRows = ((ticRes.data ?? []) as Array<any>).map((t) => ({
      id: t.id as string,
      codice: t.codice as string,
      oggetto: t.oggetto as string,
      stato: t.stato as string,
    }));
    const filesAll = ((fileRes.data ?? []) as Array<{
      id: string;
      filename: string;
      mime: string;
      commessa_id: string | null;
      uploaded_at: string;
      thumbnail_url: string | null;
    }>);
    documentiRows = filesAll
      .filter((f) => !f.mime.startsWith('image/'))
      .slice(0, 20);
    fotoRows = filesAll.filter((f) => f.mime.startsWith('image/')).slice(0, 18);

    todoRows = ((todoRes.data ?? []) as Array<any>).map((t) => {
      const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
      return {
        id: t.id as string,
        titolo: t.titolo as string,
        stato: t.stato as string,
        commessa_id: t.commessa_id as string,
        codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      };
    });

    riunioniRows = ((riuRes.data ?? []) as Array<any>).map((r) => {
      const comm = Array.isArray(r.commessa) ? r.commessa[0] : r.commessa;
      const text =
        (r.reportino as string | null) ??
        (r.corpo_libero as string | null) ??
        '';
      const snippet = makeSnippet(text, q);
      return {
        id: r.id as string,
        titolo: (r.titolo as string | null) ?? null,
        data_riunione: r.data_riunione as string,
        commessa_id: r.commessa_id as string,
        codice_interno: (comm?.codice_interno as string | undefined) ?? null,
        snippet,
      };
    });
  }

  const hasResults =
    commesseRows.length +
      clientiRows.length +
      ticketsRows.length +
      documentiRows.length +
      fotoRows.length +
      todoRows.length +
      riunioniRows.length >
    0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <SectionHeader
        eyebrow="Ricerca"
        title="Ricerca globale"
        description="Trova commesse, clienti, ticket, file, TODO, riunioni — anche per tag."
        icon={<Search />}
      />

      <form method="GET" action="/office/cerca">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cerca cliente, codice, indirizzo, descrizione, TODO, riunione…"
            className="pl-9"
            autoFocus
          />
          {tagFilter ? <input type="hidden" name="tag" value={tagFilter} /> : null}
        </div>
      </form>

      {tagFilter ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtro tag:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-primary">
            <TagIcon className="h-3 w-3" /> {tagFilter}
          </span>
          <Link
            href={q ? `/office/cerca?q=${encodeURIComponent(q)}` : '/office/cerca'}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Rimuovi filtro
          </Link>
        </div>
      ) : null}

      {!q && !tagFilter && tenantTags.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <TagIcon className="mr-1 inline h-3 w-3" /> Tag più usati
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tenantTags.slice(0, 20).map((t) => (
                <TagChip
                  key={t.tag}
                  tag={`${t.tag} · ${t.usage_count}`}
                  href={`/office/cerca?tag=${encodeURIComponent(t.tag)}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!q && !tagFilter ? (
        tenantTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inserisci un termine di ricerca per iniziare.
          </p>
        ) : null
      ) : !hasResults ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nessun risultato per <strong>{tagFilter || q}</strong>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {commesseRows.length > 0 ? (
            <Section
              title={`Commesse (${commesseRows.length})`}
              icon={<Briefcase className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {commesseRows.map((c) => (
                  <Link
                    key={c.id}
                    href={`/office/commesse/${c.id}`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono font-semibold">{c.codice_interno}</span>
                      <span>—</span>
                      <span>{c.cliente_ragione_sociale ?? '—'}</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{c.nome_cartella}</span>
                      <span>· {c.stato}</span>
                      {c.cliente_indirizzo_cantiere ? (
                        <span>
                          <MapPin className="mr-0.5 inline h-3 w-3" />
                          {c.cliente_indirizzo_cantiere}
                        </span>
                      ) : null}
                      {c.data_apertura ? (
                        <span>· {fmtData(c.data_apertura)}</span>
                      ) : null}
                    </p>
                    {c.tags.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <TagChip key={t} tag={t} />
                        ))}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {todoRows.length > 0 ? (
            <Section
              title={`TODO (${todoRows.length})`}
              icon={<CircleDot className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {todoRows.map((t) => (
                  <Link
                    key={t.id}
                    href={`/office/commesse/${t.commessa_id}/lavori`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <p>
                      {t.titolo}
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t.stato}
                      </span>
                    </p>
                    {t.codice_interno ? (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {t.codice_interno}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {riunioniRows.length > 0 ? (
            <Section
              title={`Riunioni (${riunioniRows.length})`}
              icon={<Sparkles className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {riunioniRows.map((r) => (
                  <Link
                    key={r.id}
                    href={`/office/commesse/${r.commessa_id}/lavori`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">
                        {r.titolo?.trim() || 'Riunione'}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {fmtData(r.data_riunione)}
                      </span>
                      {r.codice_interno ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          · {r.codice_interno}
                        </span>
                      ) : null}
                    </div>
                    {r.snippet ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        …{r.snippet}…
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {clientiRows.length > 0 ? (
            <Section
              title={`Clienti (${clientiRows.length})`}
              icon={<Building2 className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {clientiRows.map((cl) => (
                  <Link
                    key={cl.id}
                    href={`/office/clienti/${cl.id}`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    {cl.ragione_sociale}
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {ticketsRows.length > 0 ? (
            <Section
              title={`Ticket (${ticketsRows.length})`}
              icon={<TicketCheck className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {ticketsRows.map((t) => (
                  <Link
                    key={t.id}
                    href={`/office/tickets/${t.id}`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <p>
                      <span className="font-mono font-semibold">{t.codice}</span> — {t.oggetto}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.stato}</p>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {documentiRows.length > 0 ? (
            <Section
              title={`Documenti (${documentiRows.length})`}
              icon={<FileText className="h-4 w-4" />}
            >
              <div className="space-y-2">
                {documentiRows.map((f) => (
                  <Link
                    key={f.id}
                    href={
                      f.commessa_id
                        ? `/office/commesse/${f.commessa_id}/documenti`
                        : '#'
                    }
                    className="flex items-center gap-3 rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.filename}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtData(f.uploaded_at)}
                    </span>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          {fotoRows.length > 0 ? (
            <Section
              title={`Foto (${fotoRows.length})`}
              icon={<ImgIcon className="h-4 w-4" />}
            >
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {fotoRows.map((f) => (
                  <Link
                    key={f.id}
                    href={
                      f.commessa_id
                        ? `/office/commesse/${f.commessa_id}/foto`
                        : '#'
                    }
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
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
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

function scoreCommessa(
  c: {
    codice_interno: string | null;
    nome_cartella: string | null;
    cliente_ragione_sociale: string | null;
    cliente_indirizzo_cantiere: string | null;
  },
  q: string,
): number {
  const fields = [
    c.codice_interno,
    c.nome_cartella,
    c.cliente_ragione_sociale,
    c.cliente_indirizzo_cantiere,
  ].map((s) => (s ?? '').toLowerCase());
  let score = 0;
  for (const f of fields) {
    if (!f) continue;
    if (f === q) score += 100;
    else if (f.startsWith(q)) score += 50;
    else if (f.includes(q)) score += 10;
  }
  return score;
}

function makeSnippet(text: string, q: string, radius = 70): string | null {
  if (!text || !q) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + q.length + radius);
  return text.slice(start, end);
}
