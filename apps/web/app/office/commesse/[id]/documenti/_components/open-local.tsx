'use client';

import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

/**
 * Pulsante "Apri in cartella locale".
 *
 * Tenta di aprire il path tramite `file://` deep link (richiede che il client
 * desktop di Nextcloud abbia sincronizzato la cartella). Il browser blocca
 * `file://` da pagine HTTPS quasi sempre, quindi mostriamo un fallback con
 * il path da copiare e un hint UX.
 */
export function OpenLocalFolderButton({ fullPath }: { fullPath: string }) {
  const [openHint, setOpenHint] = useState(false);

  const handle = () => {
    try {
      const url = `file:///C:/Users/Public/impiantiXplus/${fullPath.replace(/^\/+/, '')}`;
      window.open(url, '_blank');
    } catch {
      // Ignored, fallthrough to hint.
    }
    setOpenHint(true);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handle}>
        <FolderOpen className="h-4 w-4" />
        Apri in cartella locale
      </Button>
      {openHint ? (
        <p className="max-w-xs text-right text-[11px] text-muted-foreground">
          Se il browser blocca <code>file://</code>, copia il percorso e aprilo
          manualmente in Esplora risorse:
          <br />
          <span className="font-mono">{fullPath}</span>
        </p>
      ) : null}
    </div>
  );
}
