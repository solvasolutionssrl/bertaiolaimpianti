'use client';

import * as React from 'react';

import {
  LIMITI_UPLOAD_FALLBACK,
  type LimitiUpload,
} from '@kommessa/api/limiti-upload';

/**
 * Porta i limiti di invio media (decisi dal pannello super admin, globali o
 * per tenant) fino al componente di selezione file.
 *
 * **Perché un context e non delle prop**: lo stesso componente di selezione è
 * usato da cinque posti diversi — creazione commessa office, wizard
 * sopralluogo, dettatura, tab Scatto e tab Media della PWA — alcuni annidati in
 * profondità. Passare il valore a mano vorrebbe dire cambiare la firma di
 * cinque alberi di componenti e ricordarsi di farlo al sesto. Qui si aggancia
 * una volta per guscio (office e mobile), che il tenant lo risolvono già.
 *
 * Se il provider manca si usano i valori di sicurezza: il banco di prova
 * `/prova-upload` sta fuori dai gusci e deve continuare a funzionare.
 */
const LimitiUploadContext = React.createContext<LimitiUpload | null>(null);

export function LimitiUploadProvider({
  limiti,
  children,
}: {
  limiti: LimitiUpload;
  children: React.ReactNode;
}) {
  // Stabilizza il riferimento: il valore arriva da un Server Component, quindi
  // è un oggetto nuovo a ogni render del guscio.
  const { maxFile, maxFotoMb, maxVideoMb, maxDocMb } = limiti;
  const value = React.useMemo(
    () => ({ maxFile, maxFotoMb, maxVideoMb, maxDocMb }),
    [maxFile, maxFotoMb, maxVideoMb, maxDocMb],
  );
  return (
    <LimitiUploadContext.Provider value={value}>{children}</LimitiUploadContext.Provider>
  );
}

/** I limiti correnti. Senza provider, i valori di sicurezza. */
export function useLimitiUpload(): LimitiUpload {
  return React.useContext(LimitiUploadContext) ?? LIMITI_UPLOAD_FALLBACK;
}
