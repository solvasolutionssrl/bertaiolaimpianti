'use client';

import { luogoDaValore, type SottocantiereLite } from '@kommessa/api/sottocantieri';
import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, Check, X, MapPin, ChevronDown } from 'lucide-react';

import { Portal } from '@/app/mobile/_components/portal';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  codiceCantiereMostrato,
  categoriaLabel,
  categoriaTono,
} from '@/app/_lib/cantiere-categoria';

/**
 * Pacchetto ricerca cantiere riusabile ovunque serva SCEGLIERE un cantiere
 * (avvio turno, cambio cantiere, Registra giornata). Due esportazioni:
 *
 *  - `CantiereSearchList` — casella di ricerca + lista filtrata (codice cliente,
 *    codice interno, nome, cliente, indirizzo). Card COMPATTE (2 righe, font
 *    piccolo) così ne stanno di più del solito. Presentazionale:
 *    `onPick(id, sottocantiereId)`. Un cantiere con FASI (sottocantieri) ha a
 *    destra un pallino con il numero e una freccia: la freccia apre le fasi
 *    sotto, rientrate, e si puo' scegliere il cantiere intero o una fase.
 *  - `CantiereSearchSheet` — foglio full-screen in Portal (flussi standalone).
 *
 * REGOLE ANTI-OVERFLOW (il bug del "form gigante"): la lista scrolla SOLO in
 * verticale (`overflow-y-auto overflow-x-hidden`); tutta la catena ha `min-w-0`
 * e i testi troncano → nessuna card più larga del contenitore. L'altezza del
 * pannello è DEFINITA (`h-...`, non `max-h`) perché a `flex-1 overflow` serve un
 * antenato con altezza definita.
 */

export interface PickerCantiere {
  id: string;
  codice: string | null;
  codice_commessa: string | null;
  nome: string | null;
  cliente_nome: string | null;
  indirizzo: string | null;
  categoria: string | null;
  /** Le fasi scegibili del cantiere (23/10/2026); assente o vuoto = nessuna. */
  sottocantieri?: SottocantiereLite[];
}

/**
 * Ricerca a TOKEN cross-campo: la query si spezza in parole e OGNI parola deve
 * comparire nel "pagliaio" (tutti i campi uniti). Così "fincantieri mon" trova
 * "Fincantieri Monfalcone" anche se le due parole stanno in campi diversi
 * (es. cliente + nome/indirizzo). `needle` è già trim+lowercase.
 * Dal 23/10/2026 il pagliaio comprende anche nome e codice delle FASI
 * (sottocantieri): cercando una fase si trova il suo cantiere.
 */
function matchCantiere(c: PickerCantiere, needle: string): boolean {
  if (!needle) return true;
  const hay = [c.nome, c.codice_commessa, c.codice, c.cliente_nome, c.indirizzo, c.categoria, ...(c.sottocantieri ?? []).flatMap((f) => [f.nome, f.codice])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

/** Una fase corrisponde da sola alla ricerca: il cantiere si apre da se'. */
function matchFase(f: SottocantiereLite, needle: string): boolean {
  if (!needle) return false;
  const hay = [f.nome, f.codice].filter(Boolean).join(' ').toLowerCase();
  return needle.split(/\s+/).filter(Boolean).some((t) => hay.includes(t));
}

/** Che cosa viene scelto: un cantiere intero (`sottocantiereId` null) o una sua fase. */
export type OnPickCantiere = (id: string, sottocantiereId?: string | null) => void;

// ── lista di ricerca (condivisa) — card COMPATTE ─────────────────────────────

export function CantiereSearchList({
  cantieri,
  selectedId,
  onPick,
  autoFocus = true,
  emptyLabel = 'Nessun cantiere disponibile.',
}: {
  cantieri: PickerCantiere[];
  /** Il cantiere scelto, oppure `valoreLuogo(cantiereId, faseId)` se e' scelta una fase. */
  selectedId?: string | null;
  onPick: OnPickCantiere;
  autoFocus?: boolean;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [aperti, setAperti] = useState<Set<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const scelto = luogoDaValore(selectedId ?? null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const needle = q.trim().toLowerCase();
  const filtrati = useMemo(() => cantieri.filter((c) => matchCantiere(c, needle)), [needle, cantieri]);
  // Il cantiere della fase scelta parte aperto, cosi' si vede la spunta.
  useEffect(() => {
    if (scelto?.sottocantiereId) setAperti((prev) => (prev.has(scelto.cantiereId) ? prev : new Set(prev).add(scelto.cantiereId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scelto?.cantiereId, scelto?.sottocantiereId]);

  const toggle = (id: string) =>
    setAperti((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* Ricerca (font 16px = niente auto-zoom iOS) */}
      <div className="shrink-0 px-3 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca codice, cliente, nome..."
            aria-label="Cerca cantiere"
            className="h-11 w-full min-w-0 rounded-lg border border-border bg-background pl-8 pr-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Lista: scroll SOLO verticale (x bloccato) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {filtrati.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {q.trim() ? 'Nessun cantiere trovato.' : emptyLabel}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtrati.map((c) => {
              const codice = codiceCantiereMostrato(c);
              const fasi = c.sottocantieri ?? [];
              const haFasi = fasi.length > 0;
              const attivoIntero = scelto?.cantiereId === c.id && !scelto.sottocantiereId;
              const faseScelta = scelto?.cantiereId === c.id ? scelto.sottocantiereId : null;
              // Aperto a mano, oppure dalla ricerca quando una fase corrisponde.
              const aperto = haFasi && (aperti.has(c.id) || fasi.some((f) => matchFase(f, needle)));
              return (
                <li key={c.id} className="min-w-0">
                  <div
                    className={[
                      'flex w-full min-w-0 items-stretch rounded-lg border transition-colors',
                      attivoIntero || faseScelta
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => onPick(c.id, null)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-l-lg px-3 py-2.5 text-left active:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate text-[13px] font-medium leading-tight text-foreground">
                          {titoloCase(c.nome ?? '') || codice || 'Cantiere'}
                        </span>
                        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                          {codice ? (
                            <span className="shrink-0 font-mono font-semibold text-primary">{codice}</span>
                          ) : null}
                          {c.cliente_nome ? (
                            <span className="min-w-0 truncate">
                              {codice ? '· ' : ''}
                              {titoloCase(c.cliente_nome)}
                            </span>
                          ) : null}
                          {c.categoria ? (
                            <span
                              className={`shrink-0 rounded-full border px-1 py-px text-[9px] font-medium ${categoriaTono(c.categoria)}`}
                            >
                              {categoriaLabel(c.categoria)}
                            </span>
                          ) : null}
                        </span>
                        {c.indirizzo ? (
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-tight text-muted-foreground/90">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate">{c.indirizzo}</span>
                          </span>
                        ) : null}
                      </span>
                      {attivoIntero ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                    </button>
                    {haFasi ? (
                      // Il pallino con il numero di fasi e la freccia: un tasto a parte,
                      // largo 44px, cosi' aprire le fasi non sceglie il cantiere.
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-expanded={aperto}
                        aria-label={`${fasi.length} ${fasi.length === 1 ? 'fase' : 'fasi'}, ${aperto ? 'nascondi' : 'mostra'}`}
                        data-fasi-toggle={c.id}
                        className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-r-lg border-l border-border/70 text-primary active:bg-muted/50"
                      >
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1 font-mono text-[10px] font-bold leading-none tabular-nums text-primary">
                          {fasi.length}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${aperto ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                  </div>
                  {aperto ? (
                    <ul className="ml-4 mt-1 space-y-1 border-l-2 border-primary/20 pl-2" data-fasi-di={c.id}>
                      {fasi.map((f) => {
                        const attiva = faseScelta === f.id;
                        return (
                          <li key={f.id} className="min-w-0">
                            <button
                              type="button"
                              onClick={() => onPick(c.id, f.id)}
                              className={[
                                'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                                attiva ? 'border-primary bg-primary/5' : 'border-border bg-card active:bg-muted/50',
                              ].join(' ')}
                            >
                              <span className="min-w-0 flex-1 overflow-hidden">
                                <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight text-foreground">
                                  {f.codice ? (
                                    <span className="shrink-0 font-mono text-[11px] font-semibold text-primary">{f.codice}</span>
                                  ) : null}
                                  <span className="min-w-0 truncate font-medium">{f.nome}</span>
                                </span>
                                {f.descrizione ? (
                                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
                                    {f.descrizione}
                                  </span>
                                ) : null}
                              </span>
                              {attiva ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── foglio full-screen (Portal) ──────────────────────────────────────────────

export function CantiereSearchSheet({
  open,
  title = 'Scegli cantiere',
  cantieri,
  selectedId,
  onPick,
  onClose,
  footer,
}: {
  open: boolean;
  title?: string;
  cantieri: PickerCantiere[];
  selectedId?: string | null;
  onPick: OnPickCantiere;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [kbH, setKbH] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Tastiera: misura la sua altezza dalla visualViewport e la riempie con uno
  // SPAZIATORE bianco in fondo al foglio. Così il footer (tastone "Avvia turno")
  // resta sopra la tastiera E l'area tra tasto e tastiera (e dietro le tastiere
  // semi-trasparenti) è BIANCA — non mostra più la lista.
  useEffect(() => {
    if (!open) {
      setKbH(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () =>
      setKbH(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h2>
        </header>

        <div className="min-h-0 flex-1">
          <CantiereSearchList
            cantieri={cantieri}
            selectedId={selectedId}
            onPick={onPick}
            autoFocus={false}
          />
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
        {/* Spaziatore = altezza tastiera: bianco sotto il footer, così tra tasto
            e tastiera (e dietro le tastiere trasparenti) non compare la lista. */}
        <div aria-hidden className="shrink-0 bg-background" style={{ height: kbH }} />
      </div>
    </Portal>
  );
}
