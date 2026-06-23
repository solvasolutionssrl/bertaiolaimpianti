import { History } from 'lucide-react';
import type { GiornoStorico } from '@/app/_actions/kantiere-rapportino';

function fmtGiorno(data: string): string {
  // data = 'YYYY-MM-DD'; ancoriamo a mezzogiorno UTC per evitare slittamenti di fuso.
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${data}T12:00:00Z`));
}

function fmtOre(n: number): string {
  return `${parseFloat(n.toFixed(2))}h`;
}

const STATO: Record<string, { label: string; cls: string }> = {
  bozza: { label: 'Bozza', cls: 'bg-muted text-muted-foreground' },
  inviato: { label: 'Inviato', cls: 'bg-emerald-500/15 text-emerald-700' },
  verificato: { label: 'Verificato', cls: 'bg-blue-500/15 text-blue-700' },
  approvato: { label: 'Approvato', cls: 'bg-blue-500/15 text-blue-700' },
  respinto: { label: 'Respinto', cls: 'bg-destructive/15 text-destructive' },
  esportato: { label: 'Esportato', cls: 'bg-muted text-muted-foreground' },
};

/**
 * Storico ultimi 30 giorni del tecnico: per ogni giornata, ore di lavoro
 * (ordinarie + straordinarie), ore di viaggio e stato del rapportino.
 * Componente presentazionale (server): nessuna interazione.
 */
export function StoricoOre({ giorni }: { giorni: GiornoStorico[] }) {
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Storico · ultimi 30 giorni
      </h2>

      {giorni.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground shadow-soft">
          Ancora nessuna giornata registrata.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <ul className="divide-y divide-border">
            {giorni.map((g) => {
              const lavoro = g.ord + g.straord;
              const meta = STATO[g.stato] ?? { label: g.stato, cls: 'bg-muted text-muted-foreground' };
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize text-foreground">{fmtGiorno(g.data)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">Lavoro {fmtOre(lavoro)}</span>
                      {g.straord > 0 && (
                        <span className="tabular-nums text-amber-600">straord. {fmtOre(g.straord)}</span>
                      )}
                      {g.viaggio > 0 && (
                        <span className="tabular-nums text-sky-600">viaggio {fmtOre(g.viaggio)}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
