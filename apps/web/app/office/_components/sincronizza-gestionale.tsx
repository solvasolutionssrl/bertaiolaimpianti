'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, cn } from '@kommessa/ui';

import {
  sincronizzaConGestionale,
  type EsitoSincronizzazione,
} from '../../_actions/integrazione-sinc';

/**
 * Pulsante "Sincronizza" nell'intestazione dell'ufficio.
 *
 * Non parla col gestionale: **mette in coda**. A scrivere ci pensa l'agente
 * dentro la rete del cliente, quando passa a ritirare il lavoro. La differenza
 * conta per chi guarda: dopo il clic non c'e' ancora niente sul gestionale, e
 * il messaggio lo dice.
 *
 * In questa fase e' l'UNICO modo di far partire qualcosa: nessun automatismo
 * finche' il cliente non ha verificato che quello che mandiamo e' giusto.
 * Su un gestionale si scrive e non si torna indietro.
 */
export function SincronizzaGestionale() {
  const [pending, start] = React.useTransition();
  const [esito, setEsito] = React.useState<EsitoSincronizzazione | null>(null);

  const lancia = () => {
    setEsito(null);
    start(async () => {
      setEsito(await sincronizzaConGestionale({ giorni: 31 }));
    });
  };

  // Chiude il riquadro da solo quando e' andato tutto liscio: se non c'e'
  // niente da decidere, non deve restare li' a chiedere un clic.
  React.useEffect(() => {
    if (!esito?.ok || esito.bloccate.length > 0) return;
    const t = setTimeout(() => setEsito(null), 6000);
    return () => clearTimeout(t);
  }, [esito]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={lancia}
        disabled={pending}
        title="Metti in coda ore, spese e chilometri per il gestionale"
        className="gap-1.5"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {pending ? 'Preparo…' : 'Sincronizza'}
        </span>
      </Button>

      {esito ? (
        <Card
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] shadow-lg',
            !esito.ok && 'border-destructive/40',
            esito.bloccate.length > 0 && 'border-amber-500/40',
          )}
        >
          <CardContent className="space-y-2.5 p-3.5">
            {!esito.ok ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {esito.error}
              </p>
            ) : (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>
                    {esito.accodate > 0 ? (
                      <>
                        <strong>{esito.accodate}</strong>{' '}
                        {esito.accodate === 1 ? 'voce messa' : 'voci messe'} in coda.
                      </>
                    ) : (
                      'Non c’era niente di nuovo da mandare.'
                    )}
                    {esito.gia > 0 ? (
                      <span className="text-muted-foreground">
                        {' '}
                        {esito.gia} {esito.gia === 1 ? 'era già' : 'erano già'} in coda o
                        già {esito.gia === 1 ? 'inviata' : 'inviate'}.
                      </span>
                    ) : null}
                  </span>
                </p>
                {esito.accodate > 0 ? (
                  // Il punto che evita la telefonata "ho premuto e non vedo niente".
                  <p className="text-xs text-muted-foreground">
                    Sul gestionale non c’è ancora nulla: il collegamento le
                    ritirerà al prossimo giro.
                  </p>
                ) : null}
              </>
            )}

            {esito.bloccate.length > 0 ? (
              <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-50 p-2.5 dark:bg-amber-950/20">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  Non è partito tutto
                </p>
                <ul className="space-y-1">
                  {esito.bloccate.map((b, i) => (
                    <li
                      key={i}
                      className="text-xs text-amber-900/90 dark:text-amber-200/90"
                    >
                      <strong>{b.cosa}</strong>: {b.motivo}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-900/70 dark:text-amber-200/70">
                  Di solito significa che un’anagrafica non è ancora collegata a
                  quella del gestionale.
                </p>
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setEsito(null)}
            >
              Chiudi
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
