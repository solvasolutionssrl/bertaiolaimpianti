import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Camera, FileText, ImageIcon, Folder, Clock } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { Button, StatoBadge } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';

import { guardMobile } from '../../_lib/guard';
import { fmtData, fmtDataOra } from '../../../office/_lib/format';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return { title: `Commessa ${params.id.slice(0, 8)}` };
}

export default async function CommessaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await guardMobile();
  const supabase = createServerSupabase();

  // Commessa + cliente + responsabile
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

  // Ultime note / interventi (max 5)
  const { data: rawInterventi } = await supabase
    .from('interventi')
    .select(`
      id, start_at, note,
      autore:users!interventi_user_id_fkey ( display_name )
    `)
    .eq('commessa_id', params.id)
    .not('note', 'is', null)
    .order('start_at', { ascending: false })
    .limit(5);

  // Foto sopralluogo (max 9)
  const { data: rawFotoSopralluogo } = await supabase
    .from('file_refs')
    .select('id, filename, thumbnail_url, uploaded_at')
    .eq('commessa_id', params.id)
    .like('mime', 'image/%')
    .eq('momento', 'sopralluogo')
    .order('uploaded_at', { ascending: true })
    .limit(9);

  // Foto lavori: in_corso + finale (max 9)
  const { data: rawFotoLavori } = await supabase
    .from('file_refs')
    .select('id, filename, thumbnail_url, uploaded_at')
    .eq('commessa_id', params.id)
    .like('mime', 'image/%')
    .in('momento', ['in_corso', 'finale'])
    .order('uploaded_at', { ascending: false })
    .limit(9);

  // Normalizzazioni
  const commessa = rawCommessa as any;
  const cliente = Array.isArray(commessa.cliente) ? commessa.cliente[0] : commessa.cliente;
  const responsabile = Array.isArray(commessa.responsabile) ? commessa.responsabile[0] : commessa.responsabile;
  const stato = commessa.stato as StatoCommessa;

  const interventi = (rawInterventi ?? []).map((i: any) => ({
    id: i.id,
    start_at: i.start_at as string,
    note: i.note as string | null,
    autore: (Array.isArray(i.autore) ? i.autore[0] : i.autore)?.display_name as string | null,
  }));

  const fotoSopralluogo = rawFotoSopralluogo ?? [];
  const fotoLavori = rawFotoLavori ?? [];

  return (
    <div className="flex min-h-[100dvh] flex-col gap-6 p-4 pb-28">
      {/* Back */}
      <Link
        href="/mobile"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Commesse
      </Link>

      {/* Header */}
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
            {commessa.codice_interno}
          </span>
          <StatoBadge stato={stato} hideEmoji />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {cliente?.ragione_sociale ?? '—'}
        </h1>
        {commessa.cliente_indirizzo_cantiere && (
          <p className="text-sm text-muted-foreground">{commessa.cliente_indirizzo_cantiere}</p>
        )}
        {(cliente?.telefoni ?? []).length > 0 && (
          <p className="text-sm">
            📞{' '}
            <a
              href={`tel:${(cliente.telefoni as string[])[0]}`}
              className="text-primary hover:underline"
            >
              {(cliente.telefoni as string[])[0]}
            </a>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Aperta il {fmtData(commessa.data_apertura)}
          {responsabile?.display_name ? ` · ${responsabile.display_name}` : ''}
        </p>
      </header>

      {/* Descrizione */}
      <Section icon={<FileText className="h-4 w-4" />} title="Descrizione">
        {commessa.descrizione_ai_finale ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {commessa.descrizione_ai_finale}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Nessuna descrizione ancora. Usa la nota vocale per aggiungerne una.
          </p>
        )}
      </Section>

      {/* Aggiornamenti */}
      {interventi.length > 0 && (
        <Section icon={<Clock className="h-4 w-4" />} title="Aggiornamenti">
          <ul className="space-y-3">
            {interventi.map((i) => (
              <li key={i.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">{i.autore ?? 'Tecnico'}</span>
                  <span>{fmtDataOra(i.start_at)}</span>
                </div>
                <p className="leading-relaxed">{i.note}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Foto sopralluogo */}
      <Section icon={<ImageIcon className="h-4 w-4" />} title="Foto sopralluogo">
        {fotoSopralluogo.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nessuna foto di sopralluogo.</p>
        ) : (
          <FotoGrid foto={fotoSopralluogo} commessaId={params.id} />
        )}
      </Section>

      {/* Foto lavori */}
      {(fotoLavori.length > 0) && (
        <Section icon={<Camera className="h-4 w-4" />} title="Foto lavori">
          <FotoGrid foto={fotoLavori} commessaId={params.id} />
        </Section>
      )}

      {/* Cartella cloud */}
      <Section icon={<Folder className="h-4 w-4" />} title="Cartella documenti">
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <p className="font-mono text-xs text-muted-foreground break-all">
            {commessa.nome_cartella ?? '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Visibile nel cloud del tenant (Nextcloud / Drive / Supabase Storage).
          </p>
        </div>
      </Section>

      {/* FAB scatto foto */}
      <div className="fixed bottom-20 right-4 z-10">
        <Link href={`/mobile/commessa/${params.id}/scatto`}>
          <Button
            size="lg"
            className="h-14 w-14 rounded-full p-0 shadow-lg"
            aria-label="Scatta foto"
          >
            <Camera className="h-6 w-6" aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componenti helper
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

type FotoItem = {
  id: string;
  filename: string;
  thumbnail_url: string | null;
  uploaded_at: string;
};

function FotoGrid({
  foto,
  commessaId,
}: {
  foto: FotoItem[];
  commessaId: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {foto.map((f) => (
        <Link
          key={f.id}
          href={`/mobile/commessa/${commessaId}/scatto`}
          className="aspect-square overflow-hidden rounded-md border border-border bg-muted"
          title={f.filename}
        >
          {f.thumbnail_url ? (
            <Image
              src={f.thumbnail_url}
              alt={f.filename}
              width={120}
              height={120}
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
  );
}
