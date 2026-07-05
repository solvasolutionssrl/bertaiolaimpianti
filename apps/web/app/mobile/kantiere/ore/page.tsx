import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

import { guardMobile } from '../../_lib/guard';
import { tenantHasModule } from '@/app/_lib/modules';
import { precompilaMioRapportino, mioStoricoRapportini } from '@/app/_actions/kantiere-rapportino';
import { OreClient } from './_components/ore-client';
import { StoricoOre } from './_components/storico-ore';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from '../_lib/turno-azioni-contesto';
import { TurnoAzioniCantiere } from '../_components/turno-azioni-cantiere';

export const metadata: Metadata = {
  title: 'Le mie ore di oggi',
};

export const dynamic = 'force-dynamic';

function formatDataOggi(): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default async function MobileOrePage() {
  const ctx = await guardMobile();

  if (!(await tenantHasModule('kantiere'))) {
    redirect('/mobile');
  }

  const res = await precompilaMioRapportino({});

  if (!res.ok) {
    const messaggio =
      res.error === 'NESSUN_DIPENDENTE'
        ? 'Nessun profilo dipendente collegato a questo account.'
        : `Impossibile caricare il rapportino: ${res.error}`;

    return (
      <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
        <header className="pt-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Kantiere
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Le mie ore di oggi</h1>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{formatDataOggi()}</p>
        </header>
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">{messaggio}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Contatta l&apos;ufficio per assistenza.</p>
        </div>
      </div>
    );
  }

  // Carica commesse disponibili per il picker "Aggiungi riga"
  const supabase = createServerSupabase();
  const { data: commesseRaw } = await supabase
    .from('commesse' as never)
    .select(
      'id, codice_interno, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, nome_cartella',
    )
    .eq('tenant_id', ctx.tenantId)
    .in('stato', ['aperta', 'in_corso', 'collaudo'])
    .order('created_at', { ascending: false });

  const commesseDisponibili = ((commesseRaw as Array<{
    id: string;
    codice_interno: string | null;
    descrizione_ai_finale: string | null;
    descrizione_ai_proposta: string | null;
    note_iniziali: string | null;
    nome_cartella: string | null;
  }>) ?? []).map((c) => ({
    id: c.id,
    titolo: risolviTitoloCommessa(c) || c.codice_interno || c.id,
  }));

  // Carica cantieri attivi per il picker "Aggiungi riga" e per il dialog ore a
  // mano (ricerca per codice/cliente/nome/indirizzo → campi arricchiti).
  const { data: cantieriRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria')
    .eq('tenant_id', ctx.tenantId)
    .in('stato', ['attivo', 'sospeso'])
    .order('nome', { ascending: true });

  const cantieriDisponibili = ((cantieriRaw as Array<{
    id: string;
    codice: string | null;
    codice_commessa: string | null;
    nome: string | null;
    cliente_nome: string | null;
    indirizzo: string | null;
    categoria: string | null;
  }>) ?? []).map((c) => ({
    id: c.id,
    codice: c.codice,
    codice_commessa: c.codice_commessa,
    nome: c.nome,
    cliente_nome: c.cliente_nome,
    indirizzo: c.indirizzo,
    categoria: c.categoria,
  }));

  // Sedi + mezzi per il flusso viaggio dell'inserimento manuale
  const { data: sediRaw } = await supabase
    .from('sedi' as never)
    .select('id, nome, tipo')
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .order('nome', { ascending: true });
  const sediDisponibili = ((sediRaw as Array<{ id: string; nome: string; tipo: string }>) ?? []).map(
    (s) => ({ id: s.id, nome: s.nome, tipo: s.tipo }),
  );

  const { data: mezziRaw } = await supabase
    .from('mezzi' as never)
    .select('id, targa, modello')
    .eq('tenant_id', ctx.tenantId)
    .eq('attivo', true)
    .order('targa', { ascending: true });
  const mezziDisponibili = ((mezziRaw as Array<{ id: string; targa: string; modello: string | null }>) ?? []).map(
    (m) => ({ id: m.id, targa: m.targa, modello: m.modello }),
  );

  const [turno, storicoRes] = await Promise.all([
    mioTurnoAttivo(),
    mioStoricoRapportini({}),
  ]);
  const storico = storicoRes.ok ? storicoRes.giorni : [];

  // Se c'è un turno aperto, la stessa card azioni della home/scheda cantiere
  // (pausa pranzo + fine turno), con header tappabile verso il cantiere.
  const azioni = turno
    ? await caricaTurnoAzioniContesto(ctx.tenantId, ctx.userId, turno.cantiereId)
    : null;

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Kantiere
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Le mie ore di oggi</h1>
        <p className="mt-0.5 text-xs capitalize text-muted-foreground">{formatDataOggi()}</p>
      </header>

      {turno && azioni ? (
        <TurnoAzioniCantiere
          cantiereId={turno.cantiereId}
          cantiereNome={turno.cantiereNome}
          cantiereHref={`/mobile/kantiere/cantieri/${turno.cantiereId}`}
          inizioTs={turno.inizioTs}
          inPausa={turno.inPausa}
          inizioPausaTs={turno.inizioPausaTs}
          pausaOggiFatta={azioni.pausaOggiFatta}
          sedi={azioni.sedi}
          mezzi={azioni.mezzi}
          sedeDefaultId={azioni.sedeDefaultId}
          sogliaPausaPranzoOre={azioni.sogliaPausaPranzoOre}
          sogliaAutoSpegnimentoPausaOre={azioni.sogliaAutoSpegnimentoPausaOre}
          giornataPulita={azioni.giornataPulita}
        />
      ) : null}

      <OreClient
        rapportino={res.rapportino}
        commesseDisponibili={commesseDisponibili}
        cantieriDisponibili={cantieriDisponibili}
        sediDisponibili={sediDisponibili}
        mezziDisponibili={mezziDisponibili}
        turnoInCorso={!!turno}
      />

      <StoricoOre giorni={storico} />
    </div>
  );
}
