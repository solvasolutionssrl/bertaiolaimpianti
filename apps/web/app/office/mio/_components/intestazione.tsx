import type { ReactNode } from 'react';

/** Titolo di pagina dell'area del tecnico, nella stessa forma delle pagine dell'ufficio. */
export function Intestazione({ titolo, sotto, destra }: { titolo: string; sotto?: ReactNode; destra?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titolo}</h1>
        {sotto ? <p className="mt-0.5 text-sm text-muted-foreground">{sotto}</p> : null}
      </div>
      {destra ? <div className="flex items-center gap-2">{destra}</div> : null}
    </div>
  );
}
