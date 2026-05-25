'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Hammer,
  Plus,
  X,
  Loader2,
  Search,
  Check,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

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
  /** Tecnici già assegnati (caricati server-side). */
  assigned: TecnicoAssegnato[];
  /** Tutti i tecnici attivi del tenant (caricati server-side). */
  available: TecnicoTenant[];
  /** Solo admin/office possono modificare. */
  canManage: boolean;
}

/**
 * Pannello office "Tecnici assegnati" — list + picker inline.
 *
 * Senza modal: chip-list per i selezionati + ricerca + lista risultati con
 * +/- inline. Tutti i tecnici attivi del tenant sono già caricati dal
 * server (max ~50 tecnici per tenant). Le mutation sono via server actions.
 */
export function TecniciPanel({
  commessaId,
  assigned,
  available,
  canManage,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

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
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Hammer className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight">
            Tecnici assegnati
          </h3>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {assigned.length}
          </span>
        </div>
        {canManage && (
          <Button
            type="button"
            size="sm"
            variant={pickerOpen ? 'default' : 'outline'}
            onClick={() => setPickerOpen((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            {pickerOpen ? 'Chiudi' : 'Aggiungi'}
          </Button>
        )}
      </div>

      {/* Chip list selezionati */}
      {assigned.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Nessun tecnico assegnato — il personale di campo non vede ancora
          questa commessa.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map((t) => (
            <span
              key={t.user_id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{t.display_name ?? '—'}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onRemove(t.user_id)}
                  disabled={pendingId === t.user_id}
                  className="ml-0.5 rounded-full p-0.5 text-primary/70 transition hover:bg-primary/20 hover:text-primary"
                  aria-label={`Rimuovi ${t.display_name ?? 'tecnico'}`}
                  title="Rimuovi"
                >
                  {pendingId === t.user_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Picker (visibile on demand) */}
      {canManage && pickerOpen && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca tecnico…"
              className="block w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm"
            />
          </div>

          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <li className="py-4 text-center text-xs text-muted-foreground">
                Nessun tecnico trovato.
              </li>
            ) : (
              filtered.map((u) => {
                const already = assignedIds.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => !already && onAssign(u.id)}
                      disabled={already || pendingId === u.id}
                      className={
                        'flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition ' +
                        (already
                          ? 'border-success/30 bg-success/5 text-muted-foreground'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-primary/5')
                      }
                    >
                      <span className="truncate">{u.display_name ?? '—'}</span>
                      {already ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                          <Check className="h-3 w-3" /> assegnato
                        </span>
                      ) : pendingId === u.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <Plus className="h-3 w-3 text-primary/60" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
