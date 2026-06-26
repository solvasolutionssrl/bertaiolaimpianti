'use client';

import * as React from 'react';
import { Receipt } from 'lucide-react';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { MediaLightbox, type MediaItem } from '@/app/_components/media-lightbox';

export type SpesaRiga = {
  id: string;
  cantiereId: string | null;
  categoria: CategoriaSpesa;
  ragioneSociale: string | null;
  importoTotale: number | null;
  valuta: string | null;
  dataScontrino: string | null;
  createdAt: string | null;
  hasThumb: boolean;
  hasFile: boolean;
  fotoMime: string | null;
};

function formatImporto(importo: number | null, valuta: string | null): string {
  if (importo == null) return '—';
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: valuta || 'EUR',
    }).format(importo);
  } catch {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(importo);
  }
}

function formatData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function SpeseClient({
  spese,
  cantieriNomi,
}: {
  spese: SpesaRiga[];
  cantieriNomi: Record<string, string>;
}) {
  const [lightbox, setLightbox] = React.useState<MediaItem | null>(null);

  const apri = React.useCallback((s: SpesaRiga) => {
    if (!s.hasFile) return;
    setLightbox({
      id: s.id,
      src: `/api/kantiere/spese/${s.id}/foto`,
      mime: s.fotoMime || 'image/jpeg',
      filename: `ricevuta_${s.id.slice(0, 8)}`,
      downloadUrl: `/api/kantiere/spese/${s.id}/foto?download=1`,
    });
  }, []);

  if (spese.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Receipt className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground">Nessuna spesa ancora.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scatta la prima ricevuta.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {spese.map((s) => {
        const meta = CATEGORIA_META[s.categoria];
        const cantiereNome = s.cantiereId ? cantieriNomi[s.cantiereId] : null;
        const data = formatData(s.dataScontrino ?? s.createdAt);
        return (
          <li
            key={s.id}
            onClick={() => apri(s)}
            className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft ${
              s.hasFile ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''
            }`}
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
              {s.hasThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/kantiere/spese/${s.id}/foto?size=thumb`}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Receipt className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {s.ragioneSociale || 'Spesa'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {meta ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
                  >
                    {meta.label}
                  </span>
                ) : null}
                <span className="truncate text-xs text-muted-foreground">
                  {cantiereNome || 'Da assegnare'}
                </span>
              </div>
              {data ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{data}</p>
              ) : null}
            </div>

            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatImporto(s.importoTotale, s.valuta)}
              </p>
            </div>
          </li>
        );
      })}

      <MediaLightbox
        items={lightbox ? [lightbox] : []}
        initialIndex={lightbox ? 0 : null}
        open={!!lightbox}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      />
    </ul>
  );
}
