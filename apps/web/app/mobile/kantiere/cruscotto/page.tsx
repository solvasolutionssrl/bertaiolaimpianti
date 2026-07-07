import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Timer,
  UserCheck,
  Utensils,
  Users,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { appaiaTimbrature } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { leggiTrasferimentiAttivi } from '@/app/_lib/kantiere-config';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import { LiveRefresh } from '@/app/_components/live-refresh';
import type { TimbraturaInput } from '@/app/office/kantiere/_components/timbrature-riepilogo';
import type { ViaggioTratta } from '@/app/office/kantiere/rapportini/_components/rapportini-client';

import { guardMobile } from '../../_lib/guard';
import { statoDaEventi, type EventoOggi } from '../_lib/presenze';
import { mioTurnoAttivo } from '../_lib/turno-attivo';
import { caricaTurnoAzioniContesto } from '../_lib/turno-azioni-contesto';
import { TurnoAzioniCantiere } from '../_components/turno-azioni-cantiere';
import { PresenzeGiorno, type PersonaGiorno } from './_components/ultime-timbrature';
import { NuovaSpesa } from '../spese/_components/nuova-spesa';

export const metadata: Metadata = { title: 'Cruscotto Kantiere' };
export const dynamic = 'force-dynamic';

type TimbRow = {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
  dipendente_id: string | null;
  cantiere_id: string | null;
  origine: string | null;
  created_at: string | null;
  creato_da: string | null;
  auto_chiusa: boolean | null;
};

type ViaggioRow = {
  timbratura_id: string | null;
  dipendente_id: string;
  data: string | null;
  direzione: 'andata' | 'ritorno';
  sede_id: string | null;
  cantiere_id: string | null;
  da_cantiere_id: string | null;
  distanza_km: number | null;
  durata_confermata_min: number | null;
  autista: boolean | null;
};

// Tinte KPI dalla palette dell'app (primary/emerald/amber/sky). Sfondo card
// tenue INVARIATO, ma bordo e testo (valore) più DECISI nel loro colore: sullo
// sfondo chiaro le tinte pallide sbiadivano. Bordo definito + numero a colore
// carico + icona piena → ogni card è chiaramente la sua.
const KPI_TONE = {
  primary: { card: 'border-primary/45 bg-primary/[0.06]', icon: 'text-primary', value: 'text-primary' },
  emerald: {
    card: 'border-emerald-400 bg-emerald-50 dark:border-emerald-700/70 dark:bg-emerald-950/25',
    icon: 'text-emerald-600',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    card: 'border-amber-400 bg-amber-50 dark:border-amber-700/70 dark:bg-amber-950/25',
    icon: 'text-amber-600',
    value: 'text-amber-700 dark:text-amber-300',
  },
  sky: {
    card: 'border-sky-400 bg-sky-50 dark:border-sky-700/70 dark:bg-sky-950/25',
    icon: 'text-sky-600',
    value: 'text-sky-700 dark:text-sky-300',
  },
} as const;

function isGiornoValido(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Giorno adiacente (±delta) in formato YYYY-MM-DD. */
function addGiorni(giorno: string, delta: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fmtGiornoLungo(giorno: string): string {
  try {
    const d = new Date(`${giorno}T12:00:00`);
    const s = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return giorno;
  }
}

function oreLabelMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export default async function CruscottoKantierePage({
  searchParams,
}: {
  searchParams: { giorno?: string };
}) {
  const ctx = await guardMobile();
  // Solo gestione (admin/office). I tecnici non hanno il cruscotto.
  if (ctx.role !== 'admin' && ctx.role !== 'office') redirect('/mobile/kantiere');

  const supabase = createServerSupabase();

  const oggi = romeDay(new Date());
  let giorno = isGiornoValido(searchParams.giorno) ? searchParams.giorno : oggi;
  if (giorno > oggi) giorno = oggi; // niente futuro
  const isOggi = giorno === oggi;
  const { fromIso, toIso } = romeDayBoundsUtc(giorno);

  const [dipRes, cantRes, timbRes] = await Promise.all([
    supabase.from('dipendenti' as never).select('id, nome, cognome, user_id').eq('tenant_id', ctx.tenantId),
    supabase
      .from('cantieri' as never)
      .select('id, nome, codice, codice_commessa')
      .eq('tenant_id', ctx.tenantId),
    supabase
      .from('timbrature' as never)
      .select('id, tipo, ts, pausa, dipendente_id, cantiere_id, origine, created_at, creato_da, auto_chiusa')
      .eq('tenant_id', ctx.tenantId)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true }),
  ]);

  const dipendenti = (dipRes.data as { id: string; nome: string; cognome: string; user_id: string | null }[] | null) ?? [];
  const cantieri =
    (cantRes.data as {
      id: string;
      nome: string | null;
      codice: string | null;
      codice_commessa: string | null;
    }[] | null) ?? [];
  const timbRows = (timbRes.data as TimbRow[] | null) ?? [];

  const dipMap = new Map(dipendenti.map((d) => [d.id, titoloCase(`${d.nome} ${d.cognome}`)]));
  const cantLabel = (c: {
    nome: string | null;
    codice: string | null;
    codice_commessa: string | null;
  }) => {
    const nome = titoloCase(c.nome || '') || c.codice_commessa || c.codice || '';
    return c.codice_commessa && nome && nome !== c.codice_commessa
      ? `${nome} · ${c.codice_commessa}`
      : nome;
  };
  const cantMap = new Map(cantieri.map((c) => [c.id, cantLabel(c)]));

  // Profilo dipendente dell'admin (per registrare spese a proprio nome) +
  // opzioni cantiere per il picker admin.
  const mioDip = dipendenti.find((d) => d.user_id === ctx.userId)?.id ?? null;
  const cantieriOpts = cantieri
    .map((c) => ({ id: c.id, nome: titoloCase(c.nome || c.codice || 'Cantiere') }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Turno attivo dell'admin/office (se timbra anche lui): in cima al cruscotto
  // la stessa card verde "Turno in corso" delle sue Ore — promemoria + accesso
  // rapido a pausa/cambio/fine turno. Null se non ha un turno aperto.
  const mioTurno = await mioTurnoAttivo();
  const mioTurnoAzioni = mioTurno
    ? await caricaTurnoAzioniContesto(ctx.tenantId, ctx.userId, mioTurno.cantiereId)
    : null;

  // Nomi di chi ha inserito le timbrature (per "Inserita a mano · da …").
  const creatoNomeMap = new Map<string, string>();
  const creatoDaIds = [...new Set(timbRows.map((t) => t.creato_da).filter((id): id is string => id != null))];
  if (creatoDaIds.length > 0) {
    const { data } = (await supabase.from('users' as never).select('id, display_name').in('id', creatoDaIds)) as {
      data: { id: string; display_name: string | null }[] | null;
    };
    for (const u of data ?? []) if (u.display_name) creatoNomeMap.set(u.id, u.display_name);
  }

  // ── Viaggio del giorno per dipendente (tratte sede↔cantiere) ───────────────
  const timbIdToDip = new Map<string, string>();
  for (const t of timbRows) if (t.dipendente_id) timbIdToDip.set(t.id, t.dipendente_id);
  const VIAGGIO_COLS =
    'timbratura_id, dipendente_id, data, direzione, sede_id, cantiere_id, da_cantiere_id, distanza_km, durata_confermata_min, autista';
  const dipIds = dipendenti.map((d) => d.id);
  const viaggioRows: ViaggioRow[] = [];
  if (timbRows.length > 0) {
    const { data } = (await supabase
      .from('timbratura_viaggio' as never)
      .select(VIAGGIO_COLS)
      .in('timbratura_id', timbRows.map((t) => t.id))) as { data: ViaggioRow[] | null };
    viaggioRows.push(...(data ?? []));
  }
  // Righe viaggio senza timbratura = trasferimenti cantiere→cantiere: mostrati
  // solo se il tenant conteggia i trasferimenti (altrimenti restano registrati e
  // visibili al solo super admin).
  const trasferimentiConteggiati = await leggiTrasferimentiAttivi(supabase, ctx.tenantId);
  if (trasferimentiConteggiati && dipIds.length > 0) {
    const { data } = (await supabase
      .from('timbratura_viaggio' as never)
      .select(VIAGGIO_COLS)
      .in('dipendente_id', dipIds)
      .is('timbratura_id', null)
      .eq('data', giorno)) as { data: ViaggioRow[] | null };
    viaggioRows.push(...(data ?? []));
  }
  const sediNomeMap = new Map<string, string>();
  const sedeIds = [...new Set(viaggioRows.map((v) => v.sede_id).filter((id): id is string => id != null))];
  if (sedeIds.length > 0) {
    const { data } = (await supabase.from('sedi' as never).select('id, nome').in('id', sedeIds)) as {
      data: { id: string; nome: string | null }[] | null;
    };
    for (const s of data ?? []) sediNomeMap.set(s.id, titoloCase(s.nome || 'Sede'));
  }
  const viaggiPerDip = new Map<string, ViaggioTratta[]>();
  for (const v of viaggioRows) {
    const dip = v.timbratura_id ? timbIdToDip.get(v.timbratura_id) : v.dipendente_id;
    if (!dip) continue;
    const arr = viaggiPerDip.get(dip) ?? [];
    arr.push({
      direzione: v.direzione === 'ritorno' ? 'ritorno' : 'andata',
      sede: v.sede_id ? sediNomeMap.get(v.sede_id) ?? 'Sede' : 'Sede',
      cantiere: v.cantiere_id ? cantMap.get(v.cantiere_id) ?? '' : '',
      daCantiere: v.da_cantiere_id ? cantMap.get(v.da_cantiere_id) ?? null : null,
      km: Number(v.distanza_km) || 0,
      minuti: Number(v.durata_confermata_min) || 0,
      autista: !!v.autista,
    });
    viaggiPerDip.set(dip, arr);
  }

  // Eventi del giorno per dipendente (stato + dettaglio).
  const eventiPerDip = new Map<string, EventoOggi[]>();
  const timbPerDip = new Map<string, TimbraturaInput[]>();
  for (const r of timbRows) {
    if (!r.dipendente_id) continue;
    const ev = eventiPerDip.get(r.dipendente_id) ?? [];
    ev.push({ tipo: r.tipo, ts: r.ts, pausa: r.pausa, cantiere_id: r.cantiere_id });
    eventiPerDip.set(r.dipendente_id, ev);

    const ti = timbPerDip.get(r.dipendente_id) ?? [];
    ti.push({
      tipo: r.tipo,
      ts: r.ts,
      pausa: r.pausa,
      commessaTitolo: r.cantiere_id ? cantMap.get(r.cantiere_id) ?? null : null,
      origine: r.origine,
      createdAt: r.created_at,
      creatoNome: r.creato_da ? creatoNomeMap.get(r.creato_da) ?? null : null,
      autoChiusa: r.auto_chiusa ?? false,
    });
    timbPerDip.set(r.dipendente_id, ti);
  }

  // Conteggi pausa-aware (per OGGI sono "live"; per i giorni passati sono lo
  // stato finale del giorno).
  let inCantiere = 0;
  let inPausa = 0;
  let oreTotMin = 0;
  for (const [, eventi] of eventiPerDip) {
    const stato = statoDaEventi(eventi);
    if (stato === 'lavoro') inCantiere += 1;
    else if (stato === 'pausa') inPausa += 1;
    oreTotMin += appaiaTimbrature(eventi).minutiTotali;
  }
  const personeGiorno = eventiPerDip.size;
  const cantieriAttivi = new Set(
    timbRows.filter((r) => r.tipo === 'ingresso' && r.cantiere_id).map((r) => r.cantiere_id),
  ).size;

  const kpis: {
    label: string;
    value: React.ReactNode;
    icon: typeof Timer;
    tone: keyof typeof KPI_TONE;
    href: string;
  }[] = [
    { label: 'Timbrature', value: timbRows.length, icon: Timer, tone: 'primary', href: '#persone' },
    {
      label: isOggi ? 'In cantiere' : 'In cantiere (fine)',
      value: inCantiere,
      icon: UserCheck,
      tone: 'emerald',
      href: '#persone',
    },
    {
      label: 'In pausa',
      value: inPausa,
      icon: Utensils,
      tone: 'amber',
      href: '#persone',
    },
    { label: 'Persone', value: personeGiorno, icon: Users, tone: 'sky', href: '#persone' },
    { label: 'Cantieri', value: cantieriAttivi, icon: MapPin, tone: 'primary', href: '/mobile/kantiere/cantieri' },
    { label: 'Ore', value: oreLabelMin(oreTotMin), icon: Clock, tone: 'sky', href: '#persone' },
  ];

  // Una riga per persona che ha timbrato quel giorno, espandibile al dettaglio.
  const persone: PersonaGiorno[] = [...eventiPerDip.keys()]
    .map((dipId) => {
      const eventi = eventiPerDip.get(dipId) ?? [];
      const stato = statoDaEventi(eventi);
      const cantId =
        [...eventi].reverse().find((e) => e.cantiere_id)?.cantiere_id ?? null;
      return {
        dipId,
        nome: dipMap.get(dipId) ?? 'Dipendente',
        stato,
        oreLabel: oreLabelMin(appaiaTimbrature(eventi).minutiTotali),
        cantNome: cantId ? cantMap.get(cantId) ?? null : null,
        timbrature: timbPerDip.get(dipId) ?? [],
        viaggi: viaggiPerDip.get(dipId) ?? [],
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const prevGiorno = addGiorni(giorno, -1);
  const nextGiorno = addGiorni(giorno, 1);

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cruscotto</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Panoramica cantieri</h1>
        {isOggi ? <LiveRefresh className="mt-2" /> : null}
      </header>

      {/* Turno attivo dell'admin/office: stessa card delle sue Ore (pausa,
          cambio cantiere, fine turno), come promemoria in cima al cruscotto. */}
      {mioTurno && mioTurnoAzioni ? (
        <TurnoAzioniCantiere
          compatto
          cantiereId={mioTurno.cantiereId}
          cantiereNome={mioTurno.cantiereNome}
          cantiereHref={`/mobile/kantiere/cantieri/${mioTurno.cantiereId}`}
          inizioTs={mioTurno.inizioTs}
          inPausa={mioTurno.inPausa}
          inizioPausaTs={mioTurno.inizioPausaTs}
          pausaOggiFatta={mioTurnoAzioni.pausaOggiFatta}
          sedi={mioTurnoAzioni.sedi}
          mezzi={mioTurnoAzioni.mezzi}
          sedeDefaultId={mioTurnoAzioni.sedeDefaultId}
          sogliaPausaPranzoOre={mioTurnoAzioni.sogliaPausaPranzoOre}
          sogliaAutoSpegnimentoPausaOre={mioTurnoAzioni.sogliaAutoSpegnimentoPausaOre}
          giornataPulita={mioTurnoAzioni.giornataPulita}
          splitAttivo={mioTurnoAzioni.splitAttivo}
          tolleranzaChiusuraMin={mioTurnoAzioni.tolleranzaChiusuraMin}
          passoMinuti={mioTurnoAzioni.passoMinuti}
        />
      ) : null}

      {/* Navigatore giorno */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-soft">
        <Link
          href={`/mobile/kantiere/cruscotto?giorno=${prevGiorno}`}
          aria-label="Giorno precedente"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-col items-center text-center">
          <span className="truncate text-sm font-semibold capitalize">{fmtGiornoLungo(giorno)}</span>
          {isOggi ? (
            <span className="text-[11px] text-emerald-600">Oggi · in tempo reale</span>
          ) : (
            <Link href="/mobile/kantiere/cruscotto" className="text-[11px] font-medium text-primary">
              Torna a oggi
            </Link>
          )}
        </div>
        <Link
          href={isOggi ? '/mobile/kantiere/cruscotto' : `/mobile/kantiere/cruscotto?giorno=${nextGiorno}`}
          aria-label="Giorno successivo"
          aria-disabled={isOggi}
          className={
            'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:scale-95 ' +
            (isOggi ? 'pointer-events-none opacity-30' : '')
          }
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>

      {/* KPI — 2 righe da 3 */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={
              'flex flex-col gap-1 rounded-xl border p-3 shadow-soft transition-transform active:scale-[0.97] ' +
              KPI_TONE[k.tone].card
            }
          >
            <k.icon className={'h-4 w-4 ' + KPI_TONE[k.tone].icon} aria-hidden="true" />
            <span className={'text-xl font-semibold leading-none tabular-nums ' + KPI_TONE[k.tone].value}>{k.value}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">{k.label}</span>
          </Link>
        ))}
      </div>

      {/* Persone del giorno (espandibili → timeline con origine + viaggio) */}
      <section id="persone" className="scroll-mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Presenze del giorno
        </p>
        <PresenzeGiorno persone={persone} />
        <p className="pt-1 text-[11px] text-muted-foreground">
          Tocca una persona per vedere timbrature, origine (timbrata / inserita a mano) e viaggio.
        </p>
      </section>

      {/* Spese: registra una ricevuta a tuo nome (l'admin non timbra → sceglie il
          cantiere) + scorciatoia a "Le mie spese". Solo se hai un profilo dipendente. */}
      {mioDip ? (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <NuovaSpesa
            adminMode
            cantieri={cantieriOpts}
            dipendenteId={mioDip}
            triggerVariant="quick"
          />
          <Link
            href="/mobile/kantiere/spese"
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold shadow-soft transition-transform active:scale-[0.99]"
          >
            <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Le mie spese
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link
          href="/mobile/kantiere/cantieri"
          className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold shadow-soft transition-transform active:scale-[0.99]"
        >
          Cantieri
        </Link>
        <Link
          href="/mobile/kantiere/ore"
          className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold shadow-soft transition-transform active:scale-[0.99]"
        >
          Ore
        </Link>
      </div>
    </div>
  );
}
