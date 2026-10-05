'use client';

import * as React from 'react';

import {
  LIMITI_UPLOAD_FALLBACK,
  limitiParzialiDaConfig,
} from '@kommessa/api/limiti-upload';

import { LimitiUploadForm } from '../../_components/limiti-upload-form';
import { aggiornaLimitiUploadGlobali } from '../../_actions/limiti-upload';

/**
 * Il default globale dei limiti di invio media: vale per tutti i tenant che non
 * hanno un override nel loro tab Upload.
 *
 * Sta qui perché questa è la pagina dei media di piattaforma. Quello che non si
 * imposta nemmeno qui ricade sui valori di sicurezza del codice, che sono anche
 * quelli con cui l'app ha sempre girato.
 */
export function LimitiGlobaliCard({ valore }: { valore: unknown }) {
  const valori = React.useMemo(() => limitiParzialiDaConfig(valore), [valore]);

  return (
    <LimitiUploadForm
      valori={valori}
      ereditati={LIMITI_UPLOAD_FALLBACK}
      etichettaEreditati="Valori di sicurezza"
      avvisoConferma="Vale per tutti i tenant che non hanno un override nel loro tab Upload."
      onSalva={aggiornaLimitiUploadGlobali}
    />
  );
}
