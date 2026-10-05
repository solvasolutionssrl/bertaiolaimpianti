'use client';

import * as React from 'react';
import { Building2, Check, Loader2, User, X } from 'lucide-react';
import { Input, Label, cn } from '@kommessa/ui';

import {
  cercaClientiPerNome,
  type ClienteSimile,
} from '../office/_actions/clienti';

/**
 * Ricerca cliente in anagrafica: **un componente per tutta l'app.**
 *
 * Prima ce n'erano tre comportamenti diversi per la stessa domanda «chi è il
 * cliente?»: il form di creazione commessa interrogava Supabase direttamente
 * dal browser (debounce 200 ms, 8 risultati), il dettato vocale passava
 * dall'azione server (400 ms, 5 risultati, minimo 3 caratteri), e chi risponde
 * al telefono non aveva niente. Tre tendine disegnate a mano, tre soglie
 * diverse, e un cliente che compariva o no a seconda della schermata.
 *
 * Si scrive il nome. Se è in anagrafica lo si sceglie dall'elenco e resta
 * **collegato** (si porta dietro città e contatti, per chi li vuole
 * precompilare). Se non c'è, il testo scritto resta lì: a volte è tutto quello
 * che si ha, e va bene.
 *
 * ⚠️ L'elenco è un **overlay assoluto in-flow**, non un Portal: dentro un
 * dialog Radix un Portal verrebbe trattato come un clic «fuori» e chiuderebbe
 * il dialog sotto (vedi la regola in CLAUDE.md sui dropdown nei dialog).
 */

export interface ValoreCliente {
  /** Id in anagrafica, se il cliente è stato scelto dall'elenco. */
  id: string | null;
  /** Il nome come sta a schermo: scelto dall'elenco o scritto a mano. */
  nome: string;
}

const ATTESA_MS = 300;

/**
 * La meccanica della ricerca, separata dalla sua resa: debounce, soglia
 * minima, annullamento se il termine cambia o il componente sparisce, errore
 * che diventa «nessun risultato» invece di un'eccezione.
 */
export function useRicercaClienti(termine: string, attivo = true) {
  const [risultati, setRisultati] = React.useState<ClienteSimile[]>([]);
  const [cercando, setCercando] = React.useState(false);

  React.useEffect(() => {
    const term = termine.trim();
    if (!attivo || term.length < 2) {
      setRisultati([]);
      setCercando(false);
      return;
    }
    let vivo = true;
    setCercando(true);
    const handle = setTimeout(() => {
      void cercaClientiPerNome({ nome: term })
        .then((res) => {
          if (vivo) setRisultati(res);
        })
        .catch(() => {
          if (vivo) setRisultati([]);
        })
        .finally(() => {
          if (vivo) setCercando(false);
        });
    }, ATTESA_MS);
    return () => {
      vivo = false;
      clearTimeout(handle);
    };
  }, [termine, attivo]);

  return { risultati, cercando };
}

export function ClientePicker({
  valore,
  onChange,
  id = 'cliente-picker',
  label = 'Cliente',
  placeholder = 'Nome o ragione sociale…',
  autoFocus = false,
  /** Riga sotto il campo quando il nome non è in anagrafica. */
  notaSenzaMatch,
  obbligatorio = false,
}: {
  valore: ValoreCliente;
  /** `cliente` è valorizzato solo quando lo si sceglie dall'elenco. */
  onChange: (v: ValoreCliente, cliente: ClienteSimile | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  notaSenzaMatch?: string;
  obbligatorio?: boolean;
}) {
  const [aperto, setAperto] = React.useState(false);
  // Chi ha già scelto dall'elenco non va ri-interrogato a ogni render.
  const { risultati, cercando } = useRicercaClienti(valore.nome, valore.id === null);

  const scegli = (c: ClienteSimile) => {
    setAperto(false);
    onChange({ id: c.id, nome: c.ragione_sociale }, c);
  };

  const scollega = () => {
    onChange({ id: null, nome: valore.nome }, null);
    setAperto(true);
  };

  const mostraElenco = aperto && valore.id === null && risultati.length > 0;
  const nienteTrovato =
    aperto &&
    valore.id === null &&
    !cercando &&
    valore.nome.trim().length >= 2 &&
    risultati.length === 0;

  return (
    <div className="relative">
      <Label htmlFor={id}>
        {label}
        {obbligatorio ? ' *' : null}
      </Label>

      <div className="relative mt-1.5">
        <Input
          id={id}
          value={valore.nome}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            setAperto(true);
            // Cambiare il nome scollega: non è più quel cliente.
            onChange({ id: null, nome: e.target.value }, null);
          }}
          onFocus={() => setAperto(true)}
          // Il blur deve arrivare DOPO il clic su una riga dell'elenco.
          onBlur={() => setTimeout(() => setAperto(false), 120)}
          className={cn('h-10 pr-24', valore.id ? 'border-success/60' : undefined)}
        />

        {valore.id ? (
          <button
            type="button"
            onClick={scollega}
            className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-[11px] font-medium text-success transition hover:bg-success/20"
            title="Scollega dall'anagrafica"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            In anagrafica
            <X className="h-3 w-3 opacity-60" aria-hidden="true" />
          </button>
        ) : cercando ? (
          <Loader2
            className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* Overlay IN-FLOW: vedi la nota in testa al file. */}
      {mostraElenco ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="max-h-56 overflow-y-auto">
            {risultati.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => scegli(c)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-accent"
                >
                  {c.tipo === 'azienda' ? (
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{c.ragione_sociale}</span>
                  {c.citta ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{c.citta}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {nienteTrovato && notaSenzaMatch ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{notaSenzaMatch}</p>
      ) : null}
    </div>
  );
}
