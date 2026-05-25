'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Hammer,
  Plus,
  X,
  Loader2,
  Check,
  Search,
} from 'lucide-react';
import { Button } from '@impiantixplus/ui';

import {
  assegnaTecnico,
  rimuoviTecnico,
} from '../../../../_actions/commessa-tecnici';

export interface TecnicoTenant {
  id: string;
  display_name: string | null;
}

export interface TecnicoAssegnato {
  user_id: string;
  display_name: string | null;
}

interface Props {
  commessaId: string;
  assigned: TecnicoAssegnato[];
  available: TecnicoTenant[];
  canManage: boolean;
}

/**
 * Versione mobile-first del TecniciPanel (PWA).
 *
 * Stile a card compatto + bottom-sheet per il picker (più adatto al
 * touch dell'iPad/iPhone in giro per ufficio/cantiere). I tecnici sono
 * pre-caricati server-side.
 */
export function TecniciMobile({
  commessaId,
  assigned,
  available,
  canManage,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const assignedIds = React.useMemo(
    () => new Set(assigned.map((a) => a.user_id)),
    [assigned],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((u) =>
      (u.display_name ?? '').toLowerCase().includes(q),
    );
  }, [available, query]);

  const onAssign = async (userId: string) => {
    setPendingId(userId);
    setError(null);
    const r = await assegnaTecnico({ commessaId, userId });
    setPendingId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  };

  const onRemove = async (userId: string) => {
    setPendingId(userId);
    setError(null);
    const r = await rimuoviTecnico({ commessaId, userId });
    setPendingId(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  };

  return (
    <>
      <article className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Hammer className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="text-sm font-semibold tracking-tight">Tecnici</h3>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {assigned.length}
            </span>
          </div>
          {canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              className="h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              Gestisci
            </Button>
          )}
        </div>

        {assigned.length === 0 ? (
          <p className="mt-2 text-xs italic text-muted-foreground">
            {canManage
              ? "Tap su 'Gestisci' per assegnare i tecnici."
              : 'Nessun tecnico assegnato a questa commessa.'}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assigned.map((t) => (
              <span
                key={t.user_id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs"
              >
                {t.display_name ?? '—'}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* Bottom-sheet mobile (solo se canManage) */}
      {canManage && open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gestisci tecnici"
          className="fixed inset-0 z-50 flex flex-col bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mt-auto flex max-h-[85dvh] flex-col rounded-t-2xl bg-background shadow-2xl">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold tracking-tight">
                Gestisci tecnici
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca tecnico…"
                className="flex-1 border-0 bg-transparent py-1 text-sm outline-none"
                autoFocus
              />
            </div>

            <ul className="flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted-foreground">
                  Nessun tecnico trovato.
                </li>
              ) : (
                filtered.map((u) => {
                  const already = assignedIds.has(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() =>
                          already ? onRemove(u.id) : onAssign(u.id)
                        }
                        disabled={pendingId === u.id}
                        className={
                          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left transition active:scale-[0.99] ' +
                          (already
                            ? 'border-success/30 bg-success/10'
                            : 'border-border bg-card hover:border-primary/40')
                        }
                      >
                        <span className="text-sm font-medium">
                          {u.display_name ?? '—'}
                        </span>
                        {pendingId === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : already ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                            <Check className="h-3.5 w-3.5" /> assegnato
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Plus className="h-3.5 w-3.5" /> aggiungi
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {error && (
              <p role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                size="lg"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                Fatto
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
