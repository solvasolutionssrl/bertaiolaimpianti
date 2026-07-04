import type { Metadata } from 'next';
import { MapPin } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../../_lib/guard';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from '../_lib/turno-azioni-contesto';
import {
  vedeTuttiICantieri,
  cantieriVisibiliTecnicoIds,
} from '../_lib/visibilita-tecnico';
import { CantieriBrowser, type CantiereItem } from './_components/cantieri-browser';

export const metadata: Metadata = {
  title: 'Cantieri',
};

export const dynamic = 'force-dynamic';

export default async function CantieriMobilePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const [cantieriRes, turno, meRes] = await Promise.all([
    supabase
      .from('cantieri' as never)
      .select(
        'id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria, indirizzo_da_verificare, stato',
      )
      .eq('tenant_id', ctx.tenantId)
      .order('stato', { ascending: true })
      .order('nome', { ascending: true }),
    mioTurnoAttivo(),
    supabase
      .from('dipendenti' as never)
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle(),
  ]);

  // "Inizia turno" (avvio manuale senza QR) solo se l'utente ha un profilo
  // dipendente: vale per tecnici e per admin/office che lavorano in cantiere.
  const puoAvviareTurno = !!(meRes.data as { id: string } | null);

  const cantieriTutti = (cantieriRes.data as CantiereItem[] | null) ?? [];
  // Gate temporaneo (weekend): i tecnici vedono solo i cantieri timbrabili
  // (QR attivo → oggi solo Monfalcone). Admin/office vedono tutto.
  let cantieri = cantieriTutti;
  if (!vedeTuttiICantieri(ctx.role)) {
    const visibili = await cantieriVisibiliTecnicoIds(ctx.tenantId);
    cantieri = cantieriTutti.filter((c) => visibili.has(c.id));
  }

  // Se c'è un turno aperto, la card in cima diventa la card azioni completa
  // (pausa pranzo + fine turno), come nella home e nella tab Ore.
  const azioni = turno
    ? await caricaTurnoAzioniContesto(ctx.tenantId, ctx.userId, turno.cantiereId)
    : null;

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Kantiere
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Cantieri</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {cantieri.length === 0
            ? 'Nessun cantiere'
            : `${cantieri.length} ${cantieri.length === 1 ? 'cantiere' : 'cantieri'}`}
        </p>
      </header>

      <CantieriBrowser
        cantieri={cantieri}
        turno={turno}
        azioni={azioni}
        puoAvviareTurno={puoAvviareTurno}
      />
    </div>
  );
}
