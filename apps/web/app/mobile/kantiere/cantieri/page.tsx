import type { Metadata } from 'next';
import { MapPin } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';

import { guardMobile } from '../../_lib/guard';
import { leggiImpostazioniTurno } from '@/app/_lib/kantiere-config';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from '../_lib/turno-azioni-contesto';
import {
  vedeTuttiICantieri,
  cantieriVisibiliTecnicoIds,
} from '../_lib/visibilita-tecnico';
import { CantieriBrowser, type CantiereItem } from './_components/cantieri-browser';
import { LiveRefresh } from '@/app/_components/live-refresh';

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
  // Visibilità cantieri per i tecnici: se "avvio libero" è ATTIVO (default) i
  // tecnici vedono tutti i cantieri; se disattivato, solo quelli timbrabili
  // (QR attivo). Admin/office vedono sempre tutto. (Sostituisce il gate weekend
  // con un'impostazione ufficio.)
  const { avvioLibero } = await leggiImpostazioniTurno(supabase, ctx.tenantId);
  let cantieri = cantieriTutti;
  if (!vedeTuttiICantieri(ctx.role) && !avvioLibero) {
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
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Cantieri</h1>
          {/* Chi è dentro e chi è fuori cambia durante la giornata: la pagina
              si tiene aggiornata da sola, senza tirarla giù. */}
          <LiveRefresh className="shrink-0 text-[11px]" />
        </div>
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
