'use client';

import * as React from 'react';

import {
  MediaAttachSection,
  type MediaFile,
} from '../../office/commesse/nuova/_components/media-attach-section';

/**
 * La selezione com'è nella creazione commessa: i file restano in anteprima
 * finché l'utente non conferma, e ognuno ha la sua X per toglierlo.
 * Serve al banco per misurare quel bersaglio (dev-only).
 */
export function ProvaSelezione() {
  const [files, setFiles] = React.useState<MediaFile[]>([]);
  return <MediaAttachSection files={files} onChange={setFiles} />;
}
