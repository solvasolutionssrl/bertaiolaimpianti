import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  Camera,
  Phone,
  FileText,
  Folder,
  PencilLine,
  ChevronRight,
  CloudUpload,
} from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { Button, StatoLed, Tabs, TabsContent, TabsList, TabsTrigger } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';
import {
  getStorageProvider,
  type StorageObject,
  type StorageProviderName,
} from '@impiantixplus/integrations/storage';

import { guardMobile } from '../../_lib/guard';
import { fmtData, fmtDataOra } from '../../../office/_lib/format';
import {
  SectionNumber,
  MetaLine,
  Divider,
  Stagger,
  CornerTicks,
  Hero,
  HeroMeta,
} from '../../_components/blueprint';
import { FotoTab, type FotoItem } from './_components/foto-tab';
import { CartellaEntries } from './cartella/_components/cartella-entries';
import { DettagliEdit } from '../../../_components/dettagli-edit';

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
  const ctx = await guardMobile();
  const supabase = createServerSupabase();
  const canEditDettagli = ctx.role === 'admin' || ctx.role === 'owner';

  // 1) Commessa + cliente + responsabile
  const { data: rawCommessa, error } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato, tenant_id,
        cliente_indirizzo_cantiere, cloud_folder_path,
        descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, data_apertura,
        cliente:clienti ( ragione_sociale, email, telefoni ),
        responsabile:users!commesse_responsabile_id_fkey ( display_name )
      `,
    )
    .eq('id', params.id)
    .single();

  if (error || !rawCommessa) notFound();

  // 2) Foto e video: separati per momento
  const fotoQuery = supabase
    .from('file_refs')
    .select('id, filename, thumbnail_url, momento, uploaded_at, mime, r2_key')
    .eq('commessa_id', params.id)
    .or('mime.like.image/%,mime.like.video/%')
    .order('uploaded_at', { ascending: false })
    .limit(60);

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

  const [fotoRes, updatesRes] = await Promise.all([fotoQuery, updatesQuery]);

  const commessa = rawCommessa as any;

  // 5) Cloud entries (root della cartella commessa) per la tab File
  let cloudEntries: StorageObject[] | null = null;
  let cloudError: string | null = null;
  if (commessa.nome_cartella && commessa.tenant_id) {
    try {
      const service = createServiceSupabase();
      const { data: tenantRow } = await service
        .from('tenants')
        .select('storage_provider, storage_config')
        .eq('id', commessa.tenant_id)
        .maybeSingle();

      const providerName = (tenantRow?.storage_provider as StorageProviderName) ?? 'supabase';
      const cfg = (tenantRow?.storage_config as Record<string, string> | null) ?? {};

      if (providerName === 'nextcloud' && cfg.baseUrl && cfg.user && cfg.appPassword) {
        const provider = getStorageProvider({
          provider: 'nextcloud',
          baseUrl: cfg.baseUrl,
          user: cfg.user,
          appPassword: cfg.appPassword,
        });
        cloudEntries = await provider.listFolder(commessa.nome_cartella);
      } else if (providerName === 'supabase') {
        const provider = getStorageProvider({
          provider: 'supabase',
          bucket: (cfg.bucket as string | undefined) ?? 'commesse',
        });
        cloudEntries = await provider.listFolder(commessa.nome_cartella);
      } else {
        cloudError = `Provider ${providerName} non configurato`;
      }
    } catch (e) {
      cloudError = e instanceof Error ? e.message : 'Errore caricamento cartella';
    }
  }

  const sortedCloudEntries = (cloudEntries ?? [])
    .filter((e) => e.name && !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  const cloudFileCount = sortedCloudEntries.filter((e) => !e.isDirectory).length;
  const cliente = Array.isArray(commessa.cliente) ? commessa.cliente[0] : commessa.cliente;
  const responsabile = Array.isArray(commessa.responsabile)
    ? commessa.responsabile[0]
    : commessa.responsabile;
  const stato = commessa.stato as StatoCommessa;

  const tutteFoto = (fotoRes.data ?? []) as FotoItem[];
  const fotoSopralluogo = tutteFoto.filter((f) => f.momento === 'sopralluogo').reverse();
  const fotoInCorso = tutteFoto.filter((f) => f.momento === 'in_corso');
  const fotoFinali = tutteFoto.filter((f) => f.momento === 'finale');
  const fotoTot = tutteFoto.length;

  const updates = ((updatesRes.data ?? []) as any[]).map((i) => ({
    id: i.id as string,
    start_at: i.start_at as string,
    note: i.note as string,
    autore: (Array.isArray(i.autore) ? i.autore[0] : i.autore)?.display_name as string | null,
  }));

  // "Dettagli" = trascrizione integrale del capo (verità sacrosanta).
  // Fallback su descrizione AI per le commesse create prima dell'introduzione
  // del campo note_iniziali.
  const dettagliTesto: string | null =
    commessa.note_iniziali ??
    commessa.descrizione_ai_finale ??
    commessa.descrizione_ai_proposta ??
    null;

  const telefono = (cliente?.telefoni as string[] | undefined)?.[0];

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28">
      {/* Hero dark con codice + cliente + LED */}
      <Hero>
        <div className="flex items-center justify-between">
          <Link
            href="/mobile"
            className="inline-flex items-center gap-1.5 text-primary-foreground/80 transition-colors hover:text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Indietro</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2.5 py-1">
            <StatoLed stato={stato} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/90">
              {{
                aperta: 'Aperta',
                in_corso: 'In corso',
                collaudo: 'Collaudo',
                bozza: 'Bozza',
                completata: 'Completata',
                archiviata: 'Archiviata',
                critica: 'Critica',
              }[stato] ?? stato}
            </span>
          </span>
        </div>

        <div className="mt-5">
          <HeroMeta>Commessa · {fmtData(commessa.data_apertura)}</HeroMeta>
          <p className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums text-primary-foreground">
            {commessa.codice_interno}
          </p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-primary-foreground">
            {cliente?.ragione_sociale ?? '—'}
          </h1>
          {commessa.cliente_indirizzo_cantiere && (
            <p className="mt-1 text-sm text-primary-foreground/70">
              {commessa.cliente_indirizzo_cantiere}
            </p>
          )}
          {responsabile?.display_name && (
            <HeroMeta className="mt-2">Resp · {responsabile.display_name}</HeroMeta>
          )}
        </div>
      </Hero>

      <div className="flex flex-col gap-7 px-4 pt-4">

      {/* Azioni rapide — overlap sull'hero */}
      <section className="-mt-12 animate-fade-up">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-2 shadow-soft-lg">
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

      {/* ── 02 / DETTAGLI ──────────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:60ms]">
        <SectionNumber n={2} title="Dettagli" />
        <article className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-soft">
          <CornerTicks />
          {/* Linea brand verticale a sinistra */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-4 bottom-4 w-[2px] bg-gradient-to-b from-primary via-primary to-accent"
          />
          {dettagliTesto ? (
            <p className="whitespace-pre-wrap pl-3 text-[15px] leading-relaxed text-foreground">
              {dettagliTesto}
            </p>
          ) : (
            <p className="pl-3 text-sm italic text-muted-foreground">
              Nessun dettaglio salvato. Le commesse create via voice intake
              memorizzano qui la nota completa del capo.
            </p>
          )}
          <DettagliEdit
            commessaId={params.id}
            initial={commessa.note_iniziali ?? dettagliTesto ?? null}
            canEdit={canEditDettagli}
          />
        </article>
      </section>

      {/* ── 03 / DOCUMENTAZIONE ────────────────────────────────────────────── */}
      <section className="space-y-3 animate-fade-up [animation-delay:120ms]">
        <SectionNumber
          n={3}
          title="Documentazione"
          trailing={
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {fotoTot + cloudFileCount + updates.length}
            </span>
          }
        />
        <Tabs defaultValue="foto" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-lg border border-border bg-muted/40 p-1">
            <TabsTrigger
              value="foto"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              Foto/video
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{fotoTot}</span>
            </TabsTrigger>
            <TabsTrigger
              value="file"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              File
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{cloudFileCount}</span>
            </TabsTrigger>
            <TabsTrigger
              value="updates"
              className="font-mono text-[11px] uppercase tracking-[0.14em] data-[state=active]:bg-background data-[state=active]:shadow-soft"
            >
              Note
              <span className="ml-1.5 font-sans tabular-nums opacity-60">{updates.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* ───────────── FOTO/VIDEO ───────────── */}
          <TabsContent value="foto">
            <FotoTab
              commessaId={params.id}
              sopralluogo={fotoSopralluogo}
              inCorso={fotoInCorso}
              finali={fotoFinali}
            />
          </TabsContent>

          {/* ───────────── FILE (cloud diretto) ───────────── */}
          <TabsContent value="file" className="mt-5 space-y-3">
            {cloudError ? (
              <EmptyBlock
                icon={<FileText className="h-5 w-5" />}
                title="Cloud non disponibile"
                hint={cloudError}
              />
            ) : sortedCloudEntries.length === 0 ? (
              <EmptyBlock
                icon={<Folder className="h-5 w-5" />}
                title="Cartella vuota"
                hint="Carica foto/video dal mobile o documenti dall'ufficio"
              />
            ) : (
              <CartellaEntries
                entries={sortedCloudEntries}
                commessaId={params.id}
                subPath=""
                rootName={commessa.nome_cartella}
              />
            )}

            {/* Report: visibile solo quando la commessa è in fase avanzata */}
            {(['collaudo', 'completata', 'archiviata'] as const).includes(stato as any) && (
              <>
                <Divider label="Documenti generati" />
                <Link
                  href={`/mobile/commessa/${params.id}/report`}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-br from-accent/8 via-card to-primary/5 p-3.5 shadow-soft transition-all active:scale-[0.995]"
                >
                  <CornerTicks />
                  <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border border-accent/40 bg-accent text-accent-foreground font-mono text-[9px] font-black leading-none">
                    <FileText className="h-3.5 w-3.5 mb-0.5" aria-hidden="true" />
                    <span>PDF</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-soft-foreground">
                      Report chiusura
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      Riepilogo completo commessa
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Cliente · foto · fasi · DICO
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-accent-soft-foreground" aria-hidden="true" />
                </Link>
              </>
            )}

            {/* Banner sync: i file caricati ora possono richiedere fino a 10 min */}
            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
              <CloudUpload className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
              <p>
                I file appena caricati possono richiedere fino a <strong>10 minuti</strong> per
                comparire qui (sync automatico verso Nextcloud).
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
      </div>

      {/* FAB camera fisso — bottom calcolato per non sovrapporsi
          al bottom-nav nemmeno con safe-area home indicator iPhone */}
      <Link
        href={`/mobile/commessa/${params.id}/scatto`}
        aria-label="Scatta foto"
        className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary text-primary-foreground shadow-glow-brand transition-transform active:scale-[0.92]"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        }}
      >
        <Camera className="h-6 w-6" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

