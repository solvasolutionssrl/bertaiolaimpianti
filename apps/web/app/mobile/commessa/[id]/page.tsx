import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Camera,
  Phone,
  FileText,
  ImageIcon,
  FileIcon,
  PencilLine,
  ChevronRight,
} from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { Button, StatoLed, Tabs, TabsContent, TabsList, TabsTrigger } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import { guardMobile } from '../../_lib/guard';
import { fmtData, fmtDataOra } from '../../../office/_lib/format';
import {
  SectionNumber,
  MetaLine,
  Divider,
  Stagger,
  CornerTicks,
} from '../../_components/blueprint';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Commessa ${params.id.slice(0, 8)}` };
}

/**
 * Pagina commessa — "casa del lavoro" mobile.
 *
 * Layout a blueprint con sezioni numerate:
 *   01 / Identità (codice, stato LED, cliente, indirizzo, contatti, meta)
 *   02 / Briefing (nota del capo / descrizione AI finale)
 *   03 / Documentazione (tab: Foto · File · Aggiornamenti)
 *
 * FAB camera in basso a destra per scatto rapido. Tutte le azioni
 * principali sono raggiungibili con il pollice in modalità one-handed.
 */
export default async function CommessaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  // 1) Commessa + cliente + responsabile
  const { data: rawCommessa, error } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato,
        cliente_indirizzo_cantiere, cloud_folder_path,
        descrizione_ai_finale, data_apertura,
        cliente:clienti ( ragione_sociale, email, telefoni ),
        responsabile:users!commesse_responsabile_id_fkey ( display_name )
      `,
    )
    .eq('id', params.id)
    .single();

  if (error || !rawCommessa) notFound();

  // 2) Foto: separate per momento
  const fotoQuery = supabase
    .from('file_refs')
    .select('id, filename, thumbnail_url, momento, uploaded_at')
    .eq('commessa_id', params.id)
    .like('mime', 'image/%')
    .order('uploaded_at', { ascending: false })
    .limit(60);

  // 3) File documenti (PDF, DOC, ecc — non immagini)
  const fileQuery = supabase
    .from('file_refs')
    .select('id, filename, mime, size_bytes, uploaded_at, path')
    .eq('commessa_id', params.id)
    .not('mime', 'like', 'image/%')
    .order('uploaded_at', { ascending: false })
    .limit(30);

  // 4) Aggiornamenti — interventi con note
  const updatesQuery = supabase
    .from('interventi')
    .select(`
      id, start_at, note,
      autore:users!interventi_user_id_fkey ( display_name )
    `)
    .eq('commessa_id', params.id)
    .not('note', 'is', null)
    .order('start_at', { ascending: false })
    .limit(10);

  const [fotoRes, fileRes, updatesRes] = await Promise.all([fotoQuery, fileQuery, updatesQuery]);

  const commessa = rawCommessa as any;
  const cliente = Array.isArray(commessa.cliente) ? commessa.cliente[0] : commessa.cliente;
  const responsabile = Array.isArray(commessa.responsabile)
    ? commessa.responsabile[0]
    : commessa.responsabile;
  const stato = commessa.stato as StatoCommessa;

  const tutteFoto = (fotoRes.data ?? []) as Array<{
    id: string;
    filename: string;
    thumbnail_url: string | null;
    momento: 'sopralluogo' | 'in_corso' | 'finale' | null;
    uploaded_at: string;
  }>;
  const fotoSopralluogo = tutteFoto.filter((f) => f.momento === 'sopralluogo').reverse();
  const fotoInCorso = tutteFoto.filter((f) => f.momento === 'in_corso');
  const fotoFinali = tutteFoto.filter((f) => f.momento === 'finale');
  const fotoTot = tutteFoto.length;

  const documenti = (fileRes.data ?? []) as Array<{
    id: string;
    filename: string;
    mime: string;
    size_bytes: number;
    uploaded_at: string;
    path: string;
  }>;

  const updates = ((updatesRes.data ?? []) as any[]).map((i) => ({
    id: i.id as string,
    start_at: i.start_at as string,
    note: i.note as string,
    autore: (Array.isArray(i.autore) ? i.autore[0] : i.autore)?.display_name as string | null,
  }));

  const telefono = (cliente?.telefoni as string[] | undefined)?.[0];

  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-28">
      {/* Topbar minima */}
      <div className="flex items-center justify-between pt-1">
        <Link
          href="/mobile"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Indietro</span>
        </Link>
        <StatoLed stato={stato} showLabel />
      </div>

      {/* ── 01 / IDENTITÀ ───────────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up">
        <SectionNumber n={1} title="Commessa" />
        <div>
          <p className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
            {commessa.codice_interno}
          </p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {cliente?.ragione_sociale ?? '—'}
          </h1>
          {commessa.cliente_indirizzo_cantiere && (
            <p className="mt-1 text-sm text-muted-foreground">
              {commessa.cliente_indirizzo_cantiere}
            </p>
          )}
          <MetaLine className="mt-2">
            {fmtData(commessa.data_apertura)}
            {responsabile?.display_name && ` · resp. ${responsabile.display_name}`}
          </MetaLine>
        </div>

        {/* Azioni rapide */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {telefono ? (
            <a
              href={`tel:${telefono}`}
              className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-all active:scale-[0.98] active:bg-muted"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Phone className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Chiama
                </span>
                <span className="block truncate font-mono text-xs tabular-nums">{telefono}</span>
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 opacity-50">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                <Phone className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Telefono
                </span>
                <span className="block truncate font-mono text-xs">—</span>
              </div>
            </div>
          )}
          <Link
            href={`/mobile/commessa/${params.id}/scatto`}
            className="group flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 transition-all active:scale-[0.98] active:bg-primary/10"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Camera className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                Scatta
              </span>
              <span className="block truncate text-xs font-semibold text-foreground">
                Nuova foto
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ── 02 / BRIEFING ──────────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:60ms]">
        <SectionNumber
          n={2}
          title="Briefing"
          trailing={
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
              dal capo
            </span>
          }
        />
        <article className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-soft">
          <CornerTicks />
          {/* Linea brand verticale a sinistra */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-4 bottom-4 w-[2px] bg-gradient-to-b from-primary via-primary to-accent"
          />
          {commessa.descrizione_ai_finale ? (
            <p className="whitespace-pre-wrap pl-3 text-[15px] leading-relaxed text-foreground">
              {commessa.descrizione_ai_finale}
            </p>
          ) : (
            <p className="pl-3 text-sm italic text-muted-foreground">
              Nessun briefing ancora. Il capo registrerà la nota vocale durante il sopralluogo.
            </p>
          )}
        </article>
      </section>

      {/* ── 03 / DOCUMENTAZIONE ────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:120ms]">
        <SectionNumber
          n={3}
          title="Documentazione"
          trailing={
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {fotoTot + documenti.length + updates.length}
            </span>
          }
        />
        <Tabs defaultValue="foto" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-lg border border-border bg-muted/40 p-1">
            <TabsTrigger
              value="foto"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              Foto
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{fotoTot}</span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              File
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{documenti.length}</span>
            </TabsTrigger>
            <TabsTrigger
              value="updates"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              Note
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{updates.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* ───────────── FOTO ───────────── */}
          <TabsContent value="foto" className="mt-5 space-y-6">
            {fotoTot === 0 ? (
              <EmptyBlock
                icon={<ImageIcon className="h-5 w-5" />}
                title="Nessuna foto"
                hint="Scatta la prima foto del cantiere"
              />
            ) : (
              <>
                {fotoSopralluogo.length > 0 && (
                  <FotoBlock
                    momentoLabel="Sopralluogo"
                    count={fotoSopralluogo.length}
                    commessaId={params.id}
                    foto={fotoSopralluogo}
                  />
                )}
                {fotoInCorso.length > 0 && (
                  <FotoBlock
                    momentoLabel="In corso"
                    count={fotoInCorso.length}
                    commessaId={params.id}
                    foto={fotoInCorso}
                  />
                )}
                {fotoFinali.length > 0 && (
                  <FotoBlock
                    momentoLabel="Finali"
                    count={fotoFinali.length}
                    commessaId={params.id}
                    foto={fotoFinali}
                  />
                )}
              </>
            )}

            <Link href={`/mobile/commessa/${params.id}/scatto`} className="block">
              <Button size="lg" className="min-h-[48px] w-full font-mono text-xs uppercase tracking-[0.14em]">
                <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Aggiungi foto
              </Button>
            </Link>
          </TabsContent>

          {/* ───────────── FILE ───────────── */}
          <TabsContent value="file" className="mt-5 space-y-3">
            {documenti.length === 0 ? (
              <EmptyBlock
                icon={<FileText className="h-5 w-5" />}
                title="Nessun file"
                hint="POS, DICO, schemi e altri documenti compaiono qui"
              />
            ) : (
              <Stagger className="flex flex-col gap-2">
                {documenti.map((f) => (
                  <FileTile key={f.id} file={f} commessaId={params.id} />
                ))}
              </Stagger>
            )}

            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <MetaLine className="mb-1">Cartella cloud</MetaLine>
              <p className="font-mono text-xs leading-snug text-foreground break-all">
                {commessa.nome_cartella ?? '—'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tutti i file vivono nella cartella condivisa del tenant.
              </p>
            </div>
          </TabsContent>

          {/* ───────────── AGGIORNAMENTI ───────────── */}
          <TabsContent value="updates" className="mt-5 space-y-2">
            {updates.length === 0 ? (
              <EmptyBlock
                icon={<PencilLine className="h-5 w-5" />}
                title="Nessuna nota"
                hint="Le note dei tecnici durante gli interventi compaiono qui"
              />
            ) : (
              <Stagger className="flex flex-col gap-2">
                {updates.map((u, i) => (
                  <article
                    key={u.id}
                    className="rounded-lg border border-border bg-card p-3 shadow-soft"
                  >
                    <header className="mb-1.5 flex items-baseline justify-between gap-3">
                      <p className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                          {String(updates.length - i).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {u.autore ?? 'Tecnico'}
                        </span>
                      </p>
                      <MetaLine>{fmtDataOra(u.start_at)}</MetaLine>
                    </header>
                    <p className="text-sm leading-relaxed text-foreground/90">{u.note}</p>
                  </article>
                ))}
              </Stagger>
            )}
          </TabsContent>
        </Tabs>
      </section>

      {/* FAB camera fisso */}
      <Link
        href={`/mobile/commessa/${params.id}/scatto`}
        aria-label="Scatta foto"
        className="fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-glow-brand transition-transform active:scale-[0.92]"
      >
        <Camera className="h-6 w-6" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function FotoBlock({
  momentoLabel,
  count,
  commessaId,
  foto,
}: {
  momentoLabel: string;
  count: number;
  commessaId: string;
  foto: Array<{ id: string; filename: string; thumbnail_url: string | null }>;
}) {
  return (
    <div className="space-y-2">
      <Divider label={`${momentoLabel} · ${String(count).padStart(2, '0')}`} />
      <div className="grid grid-cols-3 gap-1.5">
        {foto.map((f) => (
          <Link
            key={f.id}
            href={`/mobile/commessa/${commessaId}/scatto`}
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-transform active:scale-[0.96]"
            title={f.filename}
          >
            {f.thumbnail_url ? (
              <Image
                src={f.thumbnail_url}
                alt={f.filename}
                width={160}
                height={160}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function FileTile({
  file,
  commessaId,
}: {
  file: { id: string; filename: string; mime: string; size_bytes: number; uploaded_at: string };
  commessaId: string;
}) {
  const ext = file.filename.split('.').pop()?.toUpperCase() ?? '?';
  const isPdf = ext === 'PDF';
  const sizeKb = Math.round(file.size_bytes / 1024);
  const sizeLabel = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

  return (
    <Link
      href={`/office/commesse/${commessaId}/documenti/${file.id}/annota`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft transition-all active:scale-[0.99] active:bg-muted"
    >
      <span
        className={
          'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md font-mono text-[9px] font-bold leading-none ' +
          (isPdf
            ? 'border border-accent/40 bg-accent/10 text-accent-soft-foreground'
            : 'border border-border bg-muted text-muted-foreground')
        }
      >
        <FileIcon className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
        <span className="tracking-tight">{ext.slice(0, 4)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{file.filename}</p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {sizeLabel} · {fmtData(file.uploaded_at)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function EmptyBlock({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
      <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

