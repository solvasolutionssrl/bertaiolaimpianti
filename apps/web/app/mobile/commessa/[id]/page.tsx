import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Camera, ImageIcon, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import {
  Button,
  StatoBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@impiantixplus/ui';
import type { StatoCommessa, StatoFase } from '@impiantixplus/api/types';

import { guardMobile } from '../../_lib/guard';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Commessa ${params.id.slice(0, 8)}` };
}

interface CommessaDetail {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  cliente_indirizzo_cantiere: string | null;
  cliente: { ragione_sociale: string } | null;
  voci: Array<{
    voce_id: number;
    stato: StatoFase;
    min_foto_richieste: number;
    foto_caricate_count: number;
    voce: { nome: string; categoria: string } | null;
  }>;
  ultime_foto: Array<{ id: string; path: string; filename: string; uploaded_at: string }>;
}

/**
 * Dettaglio commessa mobile (tab Fasi + Foto).
 * Mockup_UI §3 (versione desktop) → adattato mobile-first.
 */
export default async function CommessaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  const { data: commessa, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente_indirizzo_cantiere,
        cliente:clienti ( ragione_sociale ),
        voci:commessa_voci (
          voce_id, stato, min_foto_richieste, foto_caricate_count,
          voce:voci_catalogo ( nome, categoria )
        )
      `,
    )
    .eq('id', params.id)
    .single();

  if (error || !commessa) notFound();

  const { data: ultimeFoto } = await supabase
    .from('file_refs')
    .select('id, path, filename, uploaded_at')
    .eq('commessa_id', params.id)
    .like('mime', 'image/%')
    .order('uploaded_at', { ascending: false })
    .limit(8);

  const detail: CommessaDetail = {
    id: commessa.id,
    codice_interno: commessa.codice_interno,
    nome_cartella: commessa.nome_cartella,
    stato: commessa.stato as StatoCommessa,
    cliente_indirizzo_cantiere: commessa.cliente_indirizzo_cantiere,
    cliente: Array.isArray(commessa.cliente)
      ? (commessa.cliente[0] ?? null)
      : commessa.cliente,
    voci: (commessa.voci ?? []).map((v) => ({
      voce_id: v.voce_id,
      stato: v.stato as StatoFase,
      min_foto_richieste: v.min_foto_richieste ?? 0,
      foto_caricate_count: v.foto_caricate_count ?? 0,
      voce: Array.isArray(v.voce) ? (v.voce[0] ?? null) : v.voce,
    })),
    ultime_foto: ultimeFoto ?? [],
  };

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <Link
        href="/mobile"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Indietro
      </Link>

      <header>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {detail.codice_interno}
          </span>
          <StatoBadge stato={detail.stato} hideEmoji />
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {detail.cliente?.ragione_sociale ?? '—'}
        </h1>
        {detail.cliente_indirizzo_cantiere ? (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {detail.cliente_indirizzo_cantiere}
          </p>
        ) : null}
      </header>

      <Tabs defaultValue="fasi" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fasi">Fasi</TabsTrigger>
          <TabsTrigger value="foto">Foto</TabsTrigger>
        </TabsList>

        <TabsContent value="fasi" className="mt-4 space-y-2">
          {detail.voci.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nessuna fase configurata. Apri la commessa dal Web Ufficio per
              aggiungere fasi.
            </p>
          ) : (
            detail.voci.map((v) => <FaseRow key={v.voce_id} v={v} commessaId={detail.id} />)
          )}
        </TabsContent>

        <TabsContent value="foto" className="mt-4">
          {detail.ultime_foto.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessuna foto caricata su questa commessa.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {detail.ultime_foto.map((f) => (
                <div
                  key={f.id}
                  className="aspect-square overflow-hidden rounded-md border bg-muted"
                  title={f.filename}
                >
                  {/* Senza URL firmato mostriamo un placeholder; in fase 2
                      generiamo signed URL lato server e qui usiamo <Image>. */}
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          )}

          <Link
            href={`/mobile/commessa/${detail.id}/scatto`}
            className="mt-4 block"
            passHref
          >
            <Button size="lg" className="min-h-[48px] w-full">
              <Camera className="h-4 w-4" aria-hidden="true" />
              Aggiungi foto
            </Button>
          </Link>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FaseRow({
  v,
  commessaId,
}: {
  v: CommessaDetail['voci'][number];
  commessaId: string;
}) {
  const under = v.min_foto_richieste > 0 && v.foto_caricate_count < v.min_foto_richieste;
  const completata = v.stato === 'completata';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span aria-hidden="true">
        {completata ? (
          <CheckCircle2 className="h-5 w-5 text-stato-aperta" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {v.voce?.nome ?? `Voce #${v.voce_id}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          📸 {v.foto_caricate_count}/{v.min_foto_richieste || '—'}{' '}
          {under ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-stato-collaudo">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> sotto target
            </span>
          ) : null}
        </p>
      </div>
      <Link
        href={`/mobile/commessa/${commessaId}/scatto?voce=${v.voce_id}`}
        passHref
      >
        <Button
          variant="outline"
          size="sm"
          className="min-h-[40px]"
          aria-label={`Aggiungi foto per ${v.voce?.nome ?? 'voce'}`}
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Foto
        </Button>
      </Link>
    </div>
  );
}
