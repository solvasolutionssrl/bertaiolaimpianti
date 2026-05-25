'use client';

import * as React from 'react';
import { Calendar, ChevronDown, Sparkles, User } from 'lucide-react';
import { cn } from '@kommessa/ui';

export interface RiunioneMobileRow {
  id: string;
  data_riunione: string;
  titolo: string | null;
  reportino: string | null;
  corpo_libero: string | null;
  trascrizione: string | null;
  created_by_nome: string | null;
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
    <li className="rounded-lg border border-border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-medium leading-snug">
              {r.titolo?.trim() || 'Riunione'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Calendar className="mr-0.5 inline h-2.5 w-2.5" />
              {fmtData(r.data_riunione)}
            </span>
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
        <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-2.5">
          {hasReport ? (
            <>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                Report AI
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                {r.reportino}
              </div>
            </>
          ) : fallbackText ? (
            <>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                Verbale grezzo
              </p>
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
                {fallbackText}
              </div>
            </>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              Riunione senza contenuto.
            </p>
          )}
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
