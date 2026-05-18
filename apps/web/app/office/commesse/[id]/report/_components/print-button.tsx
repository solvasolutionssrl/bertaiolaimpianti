'use client';

import { Printer } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

/**
 * Bottone "Stampa / Salva PDF" — usa il dialog di stampa nativo del browser.
 * Niente librerie extra: il CSS @media print del report fa il resto.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => window.print()}
      className="no-print gap-2"
    >
      <Printer className="h-4 w-4" />
      Stampa / Salva PDF
    </Button>
  );
}
