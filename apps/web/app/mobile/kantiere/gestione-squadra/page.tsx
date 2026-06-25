import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Clock, Users } from 'lucide-react';

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

      {/* Le ore personali del capo non hanno più uno slot dedicato nel
          bottom-nav (sostituito da Spese): le rendiamo raggiungibili da qui. */}
      <Link
        href="/mobile/kantiere/ore"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-soft active:scale-[0.99] transition-transform"
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">Le mie ore</span>
            <span className="block text-xs text-muted-foreground">Il tuo rapportino di oggi</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      <GestioneSquadraClient gruppi={gruppi} />
    </div>
  );
}
