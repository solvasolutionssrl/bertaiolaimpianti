import type { Metadata } from 'next';
import { QrCode } from 'lucide-react';

import { guardMobile } from '../../_lib/guard';
import { ScansionaClient } from './_components/scansiona-client';

export const metadata: Metadata = {
  title: 'Scansiona QR',
};

export const dynamic = 'force-dynamic';

export default async function ScansionaPage() {
  await guardMobile();

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
      {/* ⚠️ Spazio a destra per i due tasti fissi del guscio (campanella e
          «+ Spesa»): il titolo di questa pagina e' lungo e senza questo
          margine ci finiva sotto. Regola di sempre: la fascia in alto a
          destra resta libera. */}
      <header className="pt-2 pr-32">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
          Kantiere
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Scansiona il QR del cantiere</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Inquadra il cartello del cantiere per timbrare ingresso o uscita.
        </p>
      </header>

      <ScansionaClient />
    </div>
  );
}
