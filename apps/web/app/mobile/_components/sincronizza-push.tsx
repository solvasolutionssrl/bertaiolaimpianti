'use client';

import { useEffect } from 'react';

import { sincronizzaSottoscrizionePush } from '../_lib/push-sync';

const CHIAVE = 'kommessa.push.sync';

/**
 * All'apertura dell'app, una volta per sessione del browser: la sottoscrizione
 * push di questo telefono viene assegnata all'utente che e' dentro adesso.
 * Vedi `push-sync.ts`. Non disegna niente.
 */
export function SincronizzaPush() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHIAVE)) return;
    } catch {
      // senza storage si sincronizza a ogni apertura: costa una chiamata.
    }
    void sincronizzaSottoscrizionePush().then((esito) => {
      if (esito === 'ok' || esito === 'nessuna' || esito === 'nonsupportato') {
        try {
          sessionStorage.setItem(CHIAVE, '1');
        } catch {
          // ignorato
        }
      }
    });
  }, []);
  return null;
}
