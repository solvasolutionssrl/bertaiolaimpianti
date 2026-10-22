'use client';

import * as React from 'react';

/**
 * «⌘K» su un Mac, «Ctrl K» altrove.
 *
 * Il glifo ⌘ su Windows non vuol dire niente (e in qualche font non esiste:
 * esce un quadratino). Il sistema si legge nel browser, quindi dopo il primo
 * render: prima si mostra la forma piu' comune fra i clienti, Ctrl.
 */
export function useModificatoreComando(): 'Ctrl' | '⌘' {
  const [mod, setMod] = React.useState<'Ctrl' | '⌘'>('Ctrl');
  React.useEffect(() => {
    const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) setMod('⌘');
  }, []);
  return mod;
}

export function TastoComando({ tasto = 'K' }: { tasto?: string }) {
  const mod = useModificatoreComando();
  return (
    <>
      {mod}
      {mod === 'Ctrl' ? ' ' : ''}
      {tasto}
    </>
  );
}
