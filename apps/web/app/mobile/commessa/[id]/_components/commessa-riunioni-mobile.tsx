'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  ChevronDown,
  FileText,
  Image as ImageIcon,
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

/**
 * Vista riunioni mobile per il tecnico: lettura del verbale + reportino AI.
 * Tap su una card → si espande il reportino (o il testo grezzo se non
 * c'è ancora un reportino AI).
 *
 * Il tecnico NON può creare/modificare/eliminare riunioni — quelle sono
 * azioni admin/office (lo enforcement è server-side via RLS).
 */
export function CommessaRiunioniMobile({ riunioni }: Props) {
  if (riunioni.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nessuna riunione registrata su questa commessa.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {riunioni.map((r) => (
        <RiunioneCard key={r.id} r={r} />
      ))}
    </ul>
  );
}

function RiunioneCard({ r }: { r: RiunioneMobileRow }) {
  const [open, setOpen] = React.useState(false);
  const hasReport = !!(r.reportino && r.reportino.trim());
  const fallbackText = (r.corpo_libero || r.trascrizione || '').trim();

  return (
    <li
      className={cn(
        'overflow-hidden rounded-lg border bg-card shadow-soft transition-colors',
        hasReport ? 'border-primary/30' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3 text-left active:bg-muted/40"
      >
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            hasReport
              ? 'border border-primary/30 bg-primary/10 text-primary'
              : 'border border-border bg-muted text-muted-foreground',
          )}
          aria-hidden="true"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-semibold leading-snug">
              {r.titolo?.trim() || 'Riunione'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Calendar className="mr-0.5 inline h-2.5 w-2.5" />
              {fmtData(r.data_riunione)}
            </span>
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
          </p>
          {r.created_by_nome ? (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              <User className="mr-0.5 inline h-2.5 w-2.5" />
              {r.created_by_nome}
            </p>
          ) : null}
          {!open && (hasReport || fallbackText) ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {hasReport ? r.reportino : fallbackText}
            </p>
          ) : null}
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
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
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
