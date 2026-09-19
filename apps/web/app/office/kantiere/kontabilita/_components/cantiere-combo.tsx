'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Loader2, MapPin, Search } from 'lucide-react';
import { Input, cn } from '@kommessa/ui';
import { aggiornaSpesa } from '@/app/_actions/kantiere-spese';
import { cantiereImputabile } from '@kommessa/api/stato-lavoro';
import { useConfirm } from '@/app/_components/confirm-provider';

export type CantiereOption = { id: string; nome: string; stato?: string | null };

interface Props {
  spesaId: string;
  cantiereId: string | null;
  cantiereNome: string | null;
  cantieri: CantiereOption[];
}

const POP_W = 256; // w-64

/**
 * Dropdown inline con ricerca (combobox) per assegnare il cantiere a una spesa.
 * Il popover è renderizzato in un PORTAL con posizione fixed, così non viene
 * tagliato dal contenitore con scroll orizzontale della tabella. Si chiude su
 * selezione, click fuori o Esc. La scrittura chiama `aggiornaSpesa`.
 */
export function CantiereCombo({ spesaId, cantiereId, cantiereNome, cantieri }: Props) {
  const router = useRouter();
  const [aperto, setAperto] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const chiediConferma = useConfirm();
  const [pos, setPos] = React.useState<{ top: number; left: number; sopra: boolean } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const assegnato = !!cantiereId;
  const etichetta = cantiereNome?.trim() || 'Da assegnare';

  const filtrati = React.useMemo(() => {
    // I chiusi restano scegliibili, perche' l'ufficio deve poter assegnare
    // sempre. Vanno pero' in fondo e si riconoscono a vista: la conferma
    // arriva al momento della scelta, non nascondendo la voce.
    const q = query.trim().toLowerCase();
    const base = q ? cantieri.filter((k) => k.nome.toLowerCase().includes(q)) : cantieri;
    return [...base].sort(
      (a, b) => Number(!cantiereImputabile(a.stato)) - Number(!cantiereImputabile(b.stato)),
    );
  }, [cantieri, query]);

  const riposiziona = React.useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.left;
    if (left + POP_W > vw - 8) left = vw - POP_W - 8;
    if (left < 8) left = 8;
    const sottoSpazio = vh - r.bottom;
    const sopra = sottoSpazio < 300 && r.top > sottoSpazio;
    setPos({ top: sopra ? r.top - 4 : r.bottom + 4, left, sopra });
  }, []);

  // Apertura: posiziona + focus input.
  React.useEffect(() => {
    if (!aperto) return;
    setQuery('');
    riposiziona();
    requestAnimationFrame(() => inputRef.current?.focus());
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setAperto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAperto(false);
    }
    function onMove() {
      riposiziona();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [aperto, riposiziona]);

  const seleziona = React.useCallback(
    (nuovoId: string | null) => {
      setAperto(false);
      if (nuovoId === (cantiereId ?? null)) return;
      startTransition(async () => {
        // Assegnare a un cantiere chiuso si puo', ma una volta va detto.
        const scelto = cantieri.find((k) => k.id === nuovoId);
        const forzato = !!scelto && !cantiereImputabile(scelto.stato);
        if (forzato) {
          const procedi = await chiediConferma({
            title: 'Il cantiere è chiuso',
            description: `"${scelto!.nome}" non è più in lavorazione. Assegno comunque la spesa?`,
            confirmLabel: 'Assegna',
          });
          if (!procedi) return;
        }
        const res = await aggiornaSpesa({
          id: spesaId,
          cantiereId: nuovoId,
          ...(forzato ? { forzato: true } : {}),
        });
        if (res.ok) router.refresh();
      });
    },
    [cantiereId, spesaId, router, cantieri, chiediConferma],
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAperto((v) => !v);
        }}
        disabled={pending}
        title="Assegna cantiere"
        className={cn(
          'inline-flex max-w-[12rem] items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition',
          assegnato
            ? 'border-border bg-background text-foreground hover:bg-muted'
            : 'border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted',
        )}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{etichetta}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {aperto && pos
        ? createPortal(
            <div
              ref={popRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: POP_W,
                transform: pos.sopra ? 'translateY(-100%)' : undefined,
              }}
              className="z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            >
              <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca cantiere"
                  className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
              <ul className="max-h-60 overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => seleziona(null)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-muted',
                      !assegnato && 'font-medium',
                    )}
                  >
                    <span className="text-muted-foreground">Da assegnare</span>
                    {!assegnato ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  </button>
                </li>
                {filtrati.map((k) => {
                  const selezionato = k.id === cantiereId;
                  return (
                    <li key={k.id}>
                      <button
                        type="button"
                        onClick={() => seleziona(k.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-muted',
                          selezionato && 'font-medium',
                        )}
                      >
                        <span className="truncate">
                          {k.nome}
                          {cantiereImputabile(k.stato) ? null : (
                            <span className="ml-1.5 text-xs text-muted-foreground">· chiuso</span>
                          )}
                        </span>
                        {selezionato ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                      </button>
                    </li>
                  );
                })}
                {filtrati.length === 0 ? (
                  <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                    Nessun cantiere trovato
                  </li>
                ) : null}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
