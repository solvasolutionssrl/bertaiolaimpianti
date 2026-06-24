import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Navigation, Users } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../../../_lib/guard';
import { mioTurnoAttivo } from '../../_lib/turno-attivo';
import {
  eventiOggiCantiere,
  dettaglioPresenza,
  statoDaEventi,
  type EventoOggi,
} from '../../_lib/presenze';
import { TurnoAzioniCantiere } from './_components/turno-azioni-cantiere';
import { ChiInCantiere, type PersonaDentro } from './_components/chi-in-cantiere';

export const metadata: Metadata = {
  title: 'Cantiere',
};

export const dynamic = 'force-dynamic';

const STATO_LABEL: Record<string, string> = {
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  chiuso: 'Chiuso',
};

export default async function CantiereMobileDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data: cRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, nome, indirizzo, sede_partenza, stato, note')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', params.id)
    .maybeSingle();

  const c =
    (cRaw as
      | {
          id: string;
          codice: string | null;
          nome: string | null;
          indirizzo: string | null;
          sede_partenza: string | null;
          stato: string;
          note: string | null;
        }
      | null) ?? null;

  if (!c) notFound();

  // Squadra (sola lettura)
  const { data: squadraRows } = await supabase
    .from('cantiere_squadra' as never)
    .select('dipendente_id, ruolo')
    .eq('tenant_id', ctx.tenantId)
    .eq('cantiere_id', c.id);

  const squadra =
    (squadraRows as { dipendente_id: string; ruolo: 'capo' | 'membro' }[] | null) ?? [];

  let membri: { id: string; nome: string; ruolo: 'capo' | 'membro' }[] = [];
  if (squadra.length > 0) {
    const { data: dipRows } = await supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .in(
        'id',
        squadra.map((s) => s.dipendente_id),
      );
    const dips = (dipRows as { id: string; nome: string; cognome: string }[] | null) ?? [];
    membri = squadra
      .map((s) => {
        const d = dips.find((x) => x.id === s.dipendente_id);
        return d
          ? { id: d.id, nome: titoloCase(`${d.nome} ${d.cognome}`), ruolo: s.ruolo }
          : null;
      })
      .filter((x): x is { id: string; nome: string; ruolo: 'capo' | 'membro' } => x !== null)
      .sort((a, b) => (a.ruolo === b.ruolo ? 0 : a.ruolo === 'capo' ? -1 : 1));
  }

  // Turno attivo dell'utente: se è aperto su QUESTO cantiere, mostro le azioni
  // (pausa pranzo / termina turno) in cima alla scheda.
  const turno = await mioTurnoAttivo();
  const turnoQui = turno && turno.cantiereId === c.id ? turno : null;

  // Office/admin: chi è in cantiere ORA (live), con dettaglio per persona.
  // Per i tecnici questa sezione non compare (resta la vista squadra).
  const isManager = ctx.role === 'admin' || ctx.role === 'office';
  let personeDentro: PersonaDentro[] = [];
  if (isManager) {
    const eventiCant = await eventiOggiCantiere(supabase, ctx.tenantId, c.id);
    const dentro: { dipId: string; stato: 'lavoro' | 'pausa'; eventi: EventoOggi[] }[] = [];
    for (const [dipId, eventi] of eventiCant) {
      const stato = statoDaEventi(eventi);
      if (stato === 'lavoro' || stato === 'pausa') dentro.push({ dipId, stato, eventi });
    }
    if (dentro.length > 0) {
      const { data: dipRows } = await supabase
        .from('dipendenti' as never)
        .select('id, nome, cognome')
        .in(
          'id',
          dentro.map((x) => x.dipId),
        );
      const nomeMap = new Map(
        ((dipRows as { id: string; nome: string; cognome: string }[] | null) ?? []).map((d) => [
          d.id,
          titoloCase(`${d.nome} ${d.cognome}`),
        ]),
      );
      personeDentro = dentro
        .map((x) => {
          const d = dettaglioPresenza(x.eventi);
          return {
            dipId: x.dipId,
            nome: nomeMap.get(x.dipId) ?? 'Dipendente',
            stato: x.stato,
            sub: d.dalleLabel,
            dettaglio: d,
          };
        })
        .sort((a, b) =>
          a.stato === b.stato ? a.nome.localeCompare(b.nome) : a.stato === 'lavoro' ? -1 : 1,
        );
    }
  }

  const indirizzoMaps = c.indirizzo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.indirizzo)}`
    : null;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <div>
        <Link
          href="/mobile/kantiere/cantieri"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Cantieri
        </Link>
      </div>

      <header className="pt-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {titoloCase(c.nome ?? '') || c.codice || 'Cantiere'}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {c.codice ? <span className="font-mono">{c.codice}</span> : null}
          <span>{STATO_LABEL[c.stato] ?? c.stato}</span>
        </p>
      </header>

      {turnoQui ? (
        <TurnoAzioniCantiere
          cantiereId={c.id}
          inizioTs={turnoQui.inizioTs}
          inPausa={turnoQui.inPausa}
          inizioPausaTs={turnoQui.inizioPausaTs}
        />
      ) : null}

      {/* Office/admin: chi sta lavorando qui ora (tap → timbrature di oggi) */}
      {isManager ? <ChiInCantiere persone={personeDentro} /> : null}

      {/* Indirizzo + apri mappa */}
      {c.indirizzo ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Indirizzo
          </p>
          <p className="mt-1 text-sm">{c.indirizzo}</p>
          {indirizzoMaps ? (
            <a
              href={indirizzoMaps}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary active:scale-[0.98] transition-transform"
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Apri in mappa
            </a>
          ) : null}
        </div>
      ) : null}

      {c.sede_partenza ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sede di partenza
          </p>
          <p className="mt-1 text-sm">{c.sede_partenza}</p>
        </div>
      ) : null}

      {/* Squadra */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Squadra
        </p>
        {membri.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nessun assegnato.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {membri.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{m.nome}</span>
                {m.ruolo === 'capo' ? (
                  <span className="rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Capo
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {c.note ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.note}</p>
        </div>
      ) : null}
    </div>
  );
}
