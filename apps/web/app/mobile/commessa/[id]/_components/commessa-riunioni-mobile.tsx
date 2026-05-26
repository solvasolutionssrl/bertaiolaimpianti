'use client';

import * as React from 'react';
import {
  ChevronDown,
  FileText,
  Paperclip,
  Sparkles,
  User,
} from 'lucide-react';
import { cn } from '@kommessa/ui';

export interface RiunioneAllegatoMobile {
  id: string;
  /** file_refs.id, usato per costruire /api/photo/<id> o /api/cloud/file?path=... */
  file_ref_id: string;
  filename: string;
  mime: string;
  /** Path relativo (cloud_folder_path completo) — usato per il viewer cartella. */
  path: string | null;
  kind: 'foto' | 'pdf_acquisito';
}

export interface RiunioneMobileRow {
  id: string;
  data_riunione: string;
  titolo: string | null;
  reportino: string | null;
  corpo_libero: string | null;
  trascrizione: string | null;
  created_by_nome: string | null;
  /** Allegati linkati (foto + PDF), caricati lato server. */
  allegati: RiunioneAllegatoMobile[];
}

interface Props {
  riunioni: RiunioneMobileRow[];
}

export function CommessaRiunioniMobile({ riunioni }: Props) {
  if (riunioni.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nessuna riunione registrata su questa commessa.
      </div>
    );
  }

  return (
    <div className="relative pl-5">
      {/* Rail verticale */}
      <div className="absolute bottom-1 left-2 top-1 w-px bg-border" aria-hidden="true" />
      {riunioni.map((r) => (
        <div key={r.id} className="relative mb-2 last:mb-0">
          {/* Dot sul rail — primary se ha report AI, altrimenti muted */}
          <span
            className={cn(
              'absolute -left-4 top-5 z-10 h-2 w-2 rounded-full ring-2 ring-card',
              r.reportino?.trim() ? 'bg-primary' : 'bg-muted-foreground/40',
            )}
            aria-hidden="true"
          />
          <RiunioneCard r={r} />
        </div>
      ))}
    </div>
  );
}

function RiunioneCard({ r }: { r: RiunioneMobileRow }) {
  const [open, setOpen] = React.useState(false);
  const hasReport = !!(r.reportino && r.reportino.trim());
  const fallbackText = (r.corpo_libero || r.trascrizione || '').trim();

  return (
    <li
      className={cn(
        'list-none overflow-hidden rounded-lg border bg-card shadow-soft transition-colors',
        hasReport ? 'border-primary/30' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 p-3 text-left active:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          {/* Data sopra il titolo */}
          <p className="mb-0.5 font-mono text-[10px] text-muted-foreground">
            {fmtData(r.data_riunione)}
            {r.created_by_nome ? ` · ${r.created_by_nome}` : ''}
          </p>
          <div className="flex items-start gap-1.5">
            <p className="flex-1 text-[13px] font-medium leading-snug">
              {r.titolo?.trim() || 'Riunione'}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {hasReport ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                  <Sparkles className="h-2 w-2" />
                  AI
                </span>
              ) : null}
              {r.allegati.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                  <Paperclip className="h-2 w-2" />
                  {r.allegati.length}
                </span>
              ) : null}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </div>
          </div>
          {!open && (hasReport || fallbackText) ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {hasReport ? r.reportino : fallbackText}
            </p>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
          {hasReport ? (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                Report AI
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {r.reportino}
              </div>
            </div>
          ) : fallbackText ? (
            <div>
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Verbale grezzo
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                {fallbackText}
              </div>
            </div>
          ) : null}

          {/* Allegati: foto thumb (proxy /api/photo) + PDF chip clickable */}
          {r.allegati.length > 0 ? (
            <div>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Allegati ({r.allegati.length})
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {r.allegati.map((a) => {
                  const isFoto = a.kind === 'foto' || (a.mime ?? '').startsWith('image/');
                  if (isFoto) {
                    return (
                      <a
                        key={a.id}
                        href={`/api/photo/${a.file_ref_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square overflow-hidden rounded-md border border-border bg-card"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/photo/${a.file_ref_id}`}
                          alt={a.filename}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    );
                  }
                  return (
                    <a
                      key={a.id}
                      href={a.path ? `/api/cloud/file?path=${encodeURIComponent(a.path)}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-border bg-card p-1 text-center"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="line-clamp-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {a.filename.replace(/\.pdf$/i, '')}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!hasReport && !fallbackText && r.allegati.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Riunione senza contenuto.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: sameYear ? undefined : '2-digit',
    });
  } catch {
    return iso;
  }
}
