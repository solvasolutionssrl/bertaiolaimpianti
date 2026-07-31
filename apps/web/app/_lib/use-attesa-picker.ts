'use client';

import * as React from 'react';

/**
 * Segnala l'attesa del picker di sistema.
 *
 * ─── Perché serve (31/07/2026) ─────────────────────────────────────────────
 * Fra il tocco su "Aggiungi" nel picker e l'arrivo dei file, iOS esporta gli
 * originali dalla libreria: li scarica da iCloud se il telefono ha "Ottimizza
 * spazio" attivo e **ricodifica** i video HEVC in H.264 (misurato in campo:
 * sorgente 300 MB → consegnati 110 MB). Su un video lungo sono decine di
 * secondi in cui il JS della pagina non è ancora in gioco: a schermo non
 * succede niente e il cliente lo legge come "l'app si è piantata".
 *
 * Non possiamo né accelerare né osservare quel lavoro — ma sappiamo *quando*
 * sta accadendo: fra il click sull'input e l'evento `change`. Questo hook tiene
 * quella finestra e dice al chiamante se mostrarla.
 *
 * Uso:
 * ```tsx
 * const { apri, arrivati, mostra } = useAttesaPicker([galleryRef, cameraRef]);
 * <button onClick={() => apri(galleryRef)}>Foto e video</button>
 * <input ref={galleryRef} onChange={(e) => { arrivati(); ... }} />
 * {mostra ? <Avviso /> : null}
 * ```
 */

/** Sia `useRef<HTMLInputElement>(null)` sia `useRef<HTMLInputElement | null>(null)`. */
type RefInput = { readonly current: HTMLInputElement | null };

interface AttesaPicker {
  /** Apre il picker e arma l'attesa. */
  apri: (ref: RefInput) => void;
  /** Da chiamare quando i file arrivano (o non arrivano): disarma. */
  arrivati: () => void;
  /** true quando l'attesa è abbastanza lunga da meritare una spiegazione. */
  mostra: boolean;
}

/** Sotto questa soglia l'attesa non si commenta: sarebbe solo rumore. */
const RITARDO_MS = 1200;
/** Se il browser non emette `cancel`, l'avviso non deve restare appeso. */
const RESA_MS = 180_000;

export function useAttesaPicker(refs: RefInput[]): AttesaPicker {
  const [armato, setArmato] = React.useState(false);
  const [mostra, setMostra] = React.useState(false);

  // Snapshot stabile: l'array arriva nuovo a ogni render, l'effect non deve
  // riagganciarsi ogni volta.
  const refsRef = React.useRef(refs);
  refsRef.current = refs;

  React.useEffect(() => {
    if (!armato) {
      setMostra(false);
      return;
    }
    const t1 = window.setTimeout(() => setMostra(true), RITARDO_MS);
    const t2 = window.setTimeout(() => setArmato(false), RESA_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [armato]);

  // `cancel`: l'utente ha chiuso il picker senza scegliere niente.
  React.useEffect(() => {
    const nodi = refsRef.current
      .map((r) => r.current)
      .filter((n): n is HTMLInputElement => n != null);
    const annulla = () => setArmato(false);
    nodi.forEach((n) => n.addEventListener('cancel', annulla));
    return () => nodi.forEach((n) => n.removeEventListener('cancel', annulla));
  }, []);

  const apri = React.useCallback((ref: RefInput) => {
    setArmato(true);
    ref.current?.click();
  }, []);

  const arrivati = React.useCallback(() => setArmato(false), []);

  return { apri, arrivati, mostra };
}
