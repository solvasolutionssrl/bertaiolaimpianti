'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Upload, ImageIcon, Video } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

import { Divider, Stagger } from '../../../_components/blueprint';
import { AddMediaSection } from './add-media-section';

export interface FotoItem {
  id: string;
  filename: string;
  thumbnail_url: string | null;
  momento: 'sopralluogo' | 'in_corso' | 'finale' | null;
  mime: string;
}

interface Props {
  commessaId: string;
  sopralluogo: FotoItem[];
  inCorso: FotoItem[];
  finali: FotoItem[];
}

export function FotoTab({ commessaId, sopralluogo, inCorso, finali }: Props) {
  const [showUpload, setShowUpload] = React.useState(false);

  const totalCount = sopralluogo.length + inCorso.length + finali.length;

  return (
    <div className="mt-5 space-y-5">
      {/* Azioni principali affiancate */}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/mobile/commessa/${commessaId}/scatto`} className="block">
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] w-full font-mono text-xs uppercase tracking-[0.14em]"
          >
            <Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Scatta dal vivo
          </Button>
        </Link>
        <Button
          variant={showUpload ? 'default' : 'outline'}
          size="lg"
          className="min-h-[48px] w-full font-mono text-xs uppercase tracking-[0.14em]"
          onClick={() => setShowUpload((v) => !v)}
        >
          <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {showUpload ? 'Chiudi' : 'Dalla galleria'}
        </Button>
      </div>

      {/* Upload section inline */}
      {showUpload && (
        <div className="rounded-xl border border-border bg-card/50 p-3">
          <AddMediaSection commessaId={commessaId} />
        </div>
      )}

      {/* Galleria per momenti */}
      {totalCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">Nessuna foto o video</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scatta dal vivo o carica dalla galleria
          </p>
        </div>
      ) : (
        <Stagger className="space-y-6">
          {sopralluogo.length > 0 && (
            <FotoMomentoBlock
              label="Sopralluogo"
              count={sopralluogo.length}
              commessaId={commessaId}
              items={sopralluogo}
            />
          )}
          {inCorso.length > 0 && (
            <FotoMomentoBlock
              label="In corso"
              count={inCorso.length}
              commessaId={commessaId}
              items={inCorso}
            />
          )}
          {finali.length > 0 && (
            <FotoMomentoBlock
              label="Finali"
              count={finali.length}
              commessaId={commessaId}
              items={finali}
            />
          )}
        </Stagger>
      )}
    </div>
  );
}

function FotoMomentoBlock({
  label,
  count,
  commessaId,
  items,
}: {
  label: string;
  count: number;
  commessaId: string;
  items: FotoItem[];
}) {
  return (
    <div className="space-y-2">
      <Divider label={`${label} · ${String(count).padStart(2, '0')}`} />
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((f) => {
          const isVideo = f.mime.startsWith('video/');
          // Usa proxy /api/photo/[id] per immagini senza thumbnail_url
          const src = f.thumbnail_url ?? (!isVideo ? `/api/photo/${f.id}` : null);
          return (
            <Link
              key={f.id}
              href={`/mobile/commessa/${commessaId}/scatto`}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-transform active:scale-[0.96]"
              title={f.filename}
            >
              {src ? (
                <Image
                  src={src}
                  alt={f.filename}
                  width={160}
                  height={160}
                  className="h-full w-full object-cover"
                  unoptimized={src.startsWith('/api/')}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  {isVideo ? (
                    <Video className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ImageIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
              )}
              {isVideo && (
                <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-px font-mono text-[10px] font-bold text-white">
                  ▶
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
