'use client';

import * as React from 'react';

/**
 * Contro la sfocatura che iOS 26/27 disegna in cima all'app installata.
 *
 * Non e' nostra e non si spegne: Apple la mette sopra la barra di stato e per
 * ~40 punti sotto, sopra campanella e «+ Spesa». Lo stile della barra
 * (`apple-mobile-web-app-status-bar-style`) e' memorizzato quando l'app viene
 * aggiunta alla Home, quindi cambiarlo non serve a chi l'ha gia'.
 *
 * Due cose la fanno saltare, documentate e provate su iOS 27 da altri
 * (FreshRSS #9382, simple-liturgy #14, ottobre 2026):
 *  1. una striscia FISSA di 11px che tocca il bordo alto: WebKit la trova e
 *     usa il suo colore al posto dell'effetto; con `background-clip: text`
 *     non dipinge niente (CSS in `globals.css`, solo iOS + app installata);
 *  2. all'avvio, un pannello fisso fuori schermo che scorre dentro e fuori
 *     una volta (450 ms, invisibile: alfa 0.01, `pointer-events: none`):
 *     cambia lo stato di composizione del livello in cima e la sfocatura
 *     non torna. ⚠️ Il pannello RESTA nel DOM di proposito: toglierlo
 *     riporta lo stato di prima.
 *
 * Fuori dall'app installata su iOS il componente e' una `div` vuota senza
 * stile (le regole stanno sotto `@supports` + `display-mode`), e l'effetto
 * non parte. Ipotesi, non certezza: si verifica sul telefono.
 */
export function AntiSfocaturaIos() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const installata =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none');
    if (!installata || !ios) return;
    if (document.querySelector('.ios-sfocatura-pannello')) return;

    const cover = document.createElement('div');
    cover.className = 'ios-sfocatura-cover';
    cover.setAttribute('aria-hidden', 'true');
    const pannello = document.createElement('div');
    pannello.className = 'ios-sfocatura-pannello';
    pannello.setAttribute('aria-hidden', 'true');
    document.body.append(cover, pannello);

    let timer = 0;
    const raf = window.requestAnimationFrame(() => {
      cover.classList.add('acceso');
      pannello.classList.add('dentro');
      timer = window.setTimeout(() => {
        cover.classList.remove('acceso');
        pannello.classList.remove('dentro');
      }, 450);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  return <div className="ios-sfocatura-striscia" aria-hidden="true" />;
}
