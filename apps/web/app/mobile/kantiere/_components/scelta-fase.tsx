'use client';

import type { SottocantiereLite } from '@kommessa/api/sottocantieri';
import { cn } from '@kommessa/ui';

/**
 * «Su quale fase lavori?» per le bocche che conoscono gia' il cantiere: il
 * foglio del QR e il wizard del capo squadra (24/10/2026). Sono le fasi di UN
 * cantiere, quindi un elenco secco, non una tendina con ricerca.
 *
 * `obbligatoria` toglie la voce «Cantiere intero»: e' la regola per cliente
 * (`fase_obbligatoria`, FPM). Il server la ricontrolla comunque.
 */
export function SceltaFase({
  fasi,
  valore,
  onChange,
  obbligatoria,
  compatto = false,
  idBase = 'fase',
}: {
  fasi: SottocantiereLite[];
  /** `null` = cantiere intero; `undefined` = nessuna scelta ancora. */
  valore: string | null | undefined;
  onChange: (sottocantiereId: string | null) => void;
  obbligatoria: boolean;
  /** Dentro una riga stretta (membro della squadra): tendina nativa. */
  compatto?: boolean;
  idBase?: string;
}) {
  if (fasi.length === 0) return null;

  if (compatto) {
    return (
      <select
        aria-label="Fase del cantiere"
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={valore === undefined ? '' : (valore ?? '')}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="" disabled={obbligatoria}>
          {obbligatoria ? 'Scegli la fase…' : 'Cantiere intero'}
        </option>
        {fasi.map((f) => (
          <option key={f.id} value={f.id}>
            {f.codice ? `${f.codice} · ${f.nome}` : f.nome}
          </option>
        ))}
      </select>
    );
  }

  const voci: { id: string | null; etichetta: string; dettaglio?: string | null }[] = [
    ...(obbligatoria ? [] : [{ id: null, etichetta: 'Cantiere intero', dettaglio: 'Nessuna fase' }]),
    ...fasi.map((f) => ({ id: f.id, etichetta: f.nome, dettaglio: f.codice })),
  ];
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {obbligatoria ? 'Fase del cantiere' : 'Fase del cantiere (facoltativa)'}
      </p>
      <div role="radiogroup" aria-label="Fase del cantiere" className="space-y-1.5">
        {voci.map((v) => {
          const scelta = valore !== undefined && (valore ?? null) === v.id;
          return (
            <button
              key={v.id ?? '__intero'}
              id={`${idBase}-${v.id ?? 'intero'}`}
              type="button"
              role="radio"
              aria-checked={scelta}
              onClick={() => onChange(v.id)}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                scelta ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/60',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{v.etichetta}</span>
                {v.dettaglio ? <span className="block font-mono text-[11px] text-muted-foreground">{v.dettaglio}</span> : null}
              </span>
              <span
                aria-hidden="true"
                className={cn('h-4 w-4 shrink-0 rounded-full border-2', scelta ? 'border-primary bg-primary' : 'border-muted-foreground/40')}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
