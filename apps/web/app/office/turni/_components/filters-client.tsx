'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@impiantixplus/ui';

import type { CommessaOpt, UtenteOpt } from '../_lib/queries';

interface Props {
  from: string; // YYYY-MM-DD (lunedì)
  utenti: UtenteOpt[];
  commesse: CommessaOpt[];
  filtroUserId: string | null;
  filtroCommessaId: string | null;
}

/**
 * Filtri reattivi (settimana / utente / commessa) + CTA Esporta CSV.
 *
 * Stato in URL: `?week=YYYY-MM-DD&user=<id>&commessa=<id>`.
 * Il page Server Component legge i `searchParams` e ricarica la tabella.
 */
export function TurniFiltersClient({
  from,
  utenti,
  commesse,
  filtroUserId,
  filtroCommessaId,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp?.toString() ?? '');
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`/office/turni?${next.toString()}`);
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(`${from}T00:00:00`);
    d.setDate(d.getDate() + delta * 7);
    const iso = d.toISOString().slice(0, 10);
    setParam('week', iso);
  };

  const exportHref = (() => {
    const next = new URLSearchParams(sp?.toString() ?? '');
    next.set('week', from);
    return `/api/office/turni/export?${next.toString()}`;
  })();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Settimana precedente"
          onClick={() => shiftWeek(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={from}
          onChange={(e) => setParam('week', e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-mono tabular-nums shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Settimana successiva"
          onClick={() => shiftWeek(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Utente
        </label>
        <select
          value={filtroUserId ?? ''}
          onChange={(e) => setParam('user', e.target.value || null)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tutti</option>
          {utenti.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Commessa
        </label>
        <select
          value={filtroCommessaId ?? ''}
          onChange={(e) => setParam('commessa', e.target.value || null)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Tutte</option>
          {commesse.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codice_interno}
            </option>
          ))}
        </select>
      </div>

      <div className="ml-auto">
        <a href={exportHref} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Esporta CSV
          </Button>
        </a>
      </div>
    </div>
  );
}
