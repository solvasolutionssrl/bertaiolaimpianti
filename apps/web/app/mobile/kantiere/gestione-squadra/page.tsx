import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';

import { guardMobile } from '../../_lib/guard';
import { sonoCapoSquadra, squadraDelCapo } from '../_lib/capo';
import { GestioneSquadraClient } from './_components/gestione-squadra-client';

export const metadata: Metadata = {
  title: 'Gestione squadra',
};

export const dynamic = 'force-dynamic';

export default async function GestioneSquadraPage() {
  const ctx = await guardMobile();

  // Solo i capi accedono a questa pagina; gli altri tornano ai cantieri.
  const capo = await sonoCapoSquadra(ctx.tenantId, ctx.userId);
  if (!capo) redirect('/mobile/kantiere/cantieri');

  const gruppi = await squadraDelCapo(ctx.tenantId, ctx.userId);

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Gestione squadra
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Stato dei tuoi ragazzi e timbrature per conto loro (ingresso, pausa pranzo, fine turno).
          Possono comunque timbrare anche da soli con il QR.
        </p>
      </header>

      <GestioneSquadraClient gruppi={gruppi} />
    </div>
  );
}
