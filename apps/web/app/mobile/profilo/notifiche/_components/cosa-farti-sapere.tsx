'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import type { MetaAvviso } from '@kommessa/api/avvisi';

import { salvaAvvisoSulTelefono } from '../_actions';

/**
 * Un interruttore per tipo di avviso.
 *
 * ## Perché un interruttore e non tre
 *
 * Il pannello di prima aveva sette eventi per tre canali — in app, telefono,
 * posta — cioè ventuno caselle. Di quei tre canali **uno non esiste** (nessuna
 * riga di codice manda una email di avviso) e un altro non è una scelta:
 * l'avviso in app è il registro di cosa è successo, e poterlo spegnere
 * vorrebbe dire poter cancellare la traccia. Resta una decisione vera:
 * **questo mi interrompe sul telefono, o lo leggo quando apro l'app.**
 *
 * ## Aggiornamento ottimistico, con il ritorno indietro
 *
 * L'interruttore si muove subito e si rimette a posto se il salvataggio
 * fallisce. Su una rete di cantiere un interruttore che aspetta la risposta
 * sembra rotto; uno che si muove e non torna indietro mente.
 */
export function CosaFartiSapere({
  avvisi,
  sceltiAttivi,
}: {
  avvisi: MetaAvviso[];
  /** Per ogni codice: se la notifica sul telefono è attiva adesso. */
  sceltiAttivi: Record<string, boolean>;
}) {
  const [stato, setStato] = React.useState(sceltiAttivi);
  const [inCorso, setInCorso] = React.useState<string | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);

  async function cambia(codice: string, attivo: boolean) {
    const prima = stato[codice] ?? false;
    setStato((s) => ({ ...s, [codice]: attivo }));
    setInCorso(codice);
    setErrore(null);
    const esito = await salvaAvvisoSulTelefono({ codice, attivo });
    setInCorso(null);
    if (!esito.ok) {
      setStato((s) => ({ ...s, [codice]: prima }));
      setErrore(esito.error);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {avvisi.map((a) => {
        const attivo = stato[a.codice] ?? false;
        return (
          <div
            key={a.codice}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{a.etichetta}</p>
              {/* Il «quando» non è decorazione: senza, nessuno sa cosa sta
                  spegnendo, e un interruttore di cui non si capisce l'effetto
                  non si tocca. */}
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{a.quando}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {inCorso === a.codice ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={attivo}
                aria-label={`${a.etichetta}: notifica sul telefono`}
                onClick={() => void cambia(a.codice, !attivo)}
                className={
                  'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ' +
                  (attivo ? 'border-primary bg-primary' : 'border-border bg-muted')
                }
              >
                <span
                  className={
                    'inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ' +
                    (attivo ? 'translate-x-6' : 'translate-x-1')
                  }
                />
              </button>
            </div>
          </div>
        );
      })}

      {errore ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          {errore}
        </p>
      ) : null}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Spento, l’avviso non fa squillare il telefono ma resta nell’elenco della campanella: la
        traccia di cosa è successo non si perde.
      </p>
    </div>
  );
}
