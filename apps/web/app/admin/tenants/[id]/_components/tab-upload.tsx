'use client';

import * as React from 'react';

import {
  limitiParzialiDaConfig,
  risolviLimitiUpload,
} from '@kommessa/api/limiti-upload';

import { LimitiUploadForm } from '../../../_components/limiti-upload-form';
import { aggiornaLimitiUploadTenant } from '../../../_actions/limiti-upload';

/**
 * Tab "Upload" del pannello tenant: l'override dei limiti di invio media per
 * questo cliente. Quello che non si imposta qui lo decide il default globale,
 * che si cambia in `/admin/media`.
 */
export function TabUpload({
  tenantId,
  tenantNome,
  uploadConfig,
  globale,
}: {
  tenantId: string;
  tenantNome: string;
  /** `tenants.upload_config` grezzo. */
  uploadConfig: unknown;
  /** `platform_settings.limiti_upload` grezzo. */
  globale: unknown;
}) {
  const valori = React.useMemo(() => limitiParzialiDaConfig(uploadConfig), [uploadConfig]);
  // Il livello sopra, già risolto e tagliato: è ciò che vale se qui si tace.
  const ereditati = React.useMemo(() => risolviLimitiUpload(globale, null), [globale]);

  return (
    <LimitiUploadForm
      valori={valori}
      ereditati={ereditati}
      etichettaEreditati="Default globale"
      avvisoConferma={`Vale solo per ${tenantNome}. I caricamenti già in corso non vengono toccati.`}
      onSalva={(campi) => aggiornaLimitiUploadTenant({ tenantId, ...campi })}
    />
  );
}
