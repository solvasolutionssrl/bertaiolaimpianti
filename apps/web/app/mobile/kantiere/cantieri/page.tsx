import type { Metadata } from 'next';
import { MapPin } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { STATI_CANTIERE_VIVI } from '@kommessa/api/stato-lavoro';

import { guardMobile } from '../../_lib/guard';
import { leggiImpostazioniTurno } from '@/app/_lib/kantiere-config';
import { modalitaLavoroDi } from '@/app/_lib/dipendenti-modalita';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from '../_lib/turno-azioni-contesto';
import { HomeUfficio } from '../_components/home-ufficio';
import {
  vedeTuttiICantieri,
  cantieriVisibiliTecnicoIds,
} from '../_lib/visibilita-tecnico';
import { CantieriBrowser, type CantiereItem } from './_components/cantieri-browser';
import type { PickerCantiere } from '../_components/cantiere-picker';
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
      // I cantieri chiusi non compaiono in app: questo e' l'elenco di chi sta
      // lavorando adesso. Restano consultabili dall'ufficio, nella sua lista.
      .in('stato', STATI_CANTIERE_VIVI as unknown as string[])
      .order('stato', { ascending: true })
      .order('nome', { ascending: true }),
    mioTurnoAttivo(),
    supabase
      .from('dipendenti' as never)
      .select('id, nome')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle(),
  ]);

  // "Inizia turno" (avvio manuale senza QR) solo se l'utente ha un profilo
  // dipendente: vale per tecnici e per admin/office che lavorano in cantiere.
  const me = meRes.data as { id: string; nome: string } | null;
  const puoAvviareTurno = !!me;

  // Chi lavora in sede atterra qui (è la landing dei non-manager): la sua
  // giornata si apre e si chiude da questa stessa pagina, senza le domande
  // del cantiere. L'elenco resta sotto, perché capita di andarci.
  const inUfficio = me
    ? (await modalitaLavoroDi(supabase, ctx.tenantId, me.id)) === 'ufficio'
    : false;

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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Cantieri</h1>
        {/* Chi è dentro e chi è fuori cambia durante la giornata: la pagina si
            tiene aggiornata da sola. «Aggiornato alle» sta sulla riga sotto il
            titolo: in alto a destra c'è la campanella. */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {cantieri.length === 0
              ? 'Nessun cantiere'
              : `${cantieri.length} ${cantieri.length === 1 ? 'cantiere' : 'cantieri'}`}
          </p>
          <LiveRefresh className="-my-1 -mr-1.5 shrink-0" />
        </div>
      </header>

      {inUfficio ? (
        <HomeUfficio
          nome={me?.nome}
          turno={turno}
          azioni={azioni}
          cantieri={cantieri as unknown as PickerCantiere[]}
        />
      ) : null}

      <CantieriBrowser
        cantieri={cantieri}
        turno={turno}
        azioni={azioni}
        // In modalità ufficio il tasto di avvio è quello della card sopra: due
        // tasti che iniziano la giornata in due modi diversi confonderebbero.
        puoAvviareTurno={puoAvviareTurno && !inUfficio}
      />
    </div>
  );
}
