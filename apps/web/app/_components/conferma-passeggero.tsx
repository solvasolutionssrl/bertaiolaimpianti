'use client';

import * as React from 'react';
import { Car, UserRound } from 'lucide-react';

/**
 * «Sicuro di non aver guidato tu?»
 *
 * I km di un viaggio si contano **solo all'autista**. Chi conferma un tragitto
 * senza spuntare «sono io l'autista» sta dichiarando di essere passeggero, e
 * quei km non glieli conta nessuno: se la spunta è saltata per distrazione, il
 * rimborso sparisce e se ne accorge a fine mese, quando è tardi.
 *
 * Quindi prima di salvare si chiede. Chi risponde «guidavo io» torna al modulo
 * con la casella **evidenziata**, non su una pagina bianca a chiedersi dov'era.
 *
 * ⚠️ È un pannello **dentro** il foglio, non un dialog annidato: Radix
 * tratterebbe un secondo dialog come un clic "fuori" e chiuderebbe quello sotto,
 * portandosi via quello che l'utente aveva già compilato.
 */
export function useConfermaPasseggero() {
  const [risolvi, setRisolvi] = React.useState<((prosegui: boolean) => void) | null>(null);
  const [evidenzia, setEvidenzia] = React.useState(false);
  const ancora = React.useRef<HTMLDivElement | null>(null);

  /**
   * Da chiamare prima di salvare.
   * `true` = vai avanti; `false` = l'utente vuole correggere, non salvare.
   */
  const conferma = React.useCallback((autista: boolean): Promise<boolean> => {
    if (autista) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setRisolvi(() => resolve));
  }, []);

  const rispondi = React.useCallback(
    (prosegui: boolean) => {
      risolvi?.(prosegui);
      setRisolvi(null);
      if (!prosegui) {
        setEvidenzia(true);
        // Su un foglio lungo la casella può stare fuori schermo: portarcela.
        requestAnimationFrame(() =>
          ancora.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        );
      }
    },
    [risolvi],
  );

  /** Da mettere sul contenitore della spunta, per l'alone. */
  const propsEvidenza = {
    ref: ancora,
    className: evidenzia
      ? 'rounded-lg ring-2 ring-amber-500 ring-offset-2 ring-offset-background transition-shadow'
      : '',
  };

  /** Si spegne appena l'utente tocca la spunta: ha capito. */
  const spegniEvidenza = React.useCallback(() => setEvidenzia(false), []);

  const pannello = risolvi ? (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-snug">Hai viaggiato da passeggero?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Non hai spuntato «sono io l’autista». I chilometri vengono conteggiati solo a chi
              guida: così questo viaggio non te ne conta nessuno.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => rispondi(false)}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground"
          >
            <Car className="h-4 w-4" />
            No, guidavo io
          </button>
          <button
            type="button"
            onClick={() => rispondi(true)}
            className="min-h-[46px] w-full rounded-xl border border-border bg-background px-4 text-base font-medium"
          >
            Sì, ero passeggero
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { conferma, pannello, propsEvidenza, spegniEvidenza, evidenzia };
}
