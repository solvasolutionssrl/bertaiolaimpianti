import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Timer, UserCheck, Utensils, Users, MapPin, Clock } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { appaiaTimbrature } from '@kommessa/api/kantiere-ore';
import { romeDay, romeDayBoundsUtc } from '@kommessa/api/rome-time';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../../_lib/guard';
import {
  dettaglioPresenza,
  statoDaEventi,
  type EventoOggi,
} from '../_lib/presenze';
import { UltimeTimbrature, type RigaUltima } from './_components/ultime-timbrature';

export const metadata: Metadata = { title: 'Cruscotto Kantiere' };
export const dynamic = 'force-dynamic';

function formatOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

type TimbRow = {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  pausa: boolean | null;
  dipendente_id: string | null;
  cantiere_id: string | null;
};

const KPI_TONE = {
  default: 'border-border bg-card',
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
  pausa: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
} as const;

export default async function CruscottoKantierePage() {
  const ctx = await guardMobile();
  // Solo gestione (admin/office). I tecnici non hanno il cruscotto.
  if (ctx.role !== 'admin' && ctx.role !== 'office') redirect('/mobile/kantiere');

  const supabase = createServerSupabase();

  // Confini giornata odierna (Europe/Rome), robusti al DST.
  const { fromIso, toIso } = romeDayBoundsUtc(romeDay(new Date()));

  const [dipRes, cantRes, oggiRes, ultimeRes] = await Promise.all([
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome')
      .eq('tenant_id', ctx.tenantId),
    supabase
      .from('cantieri' as never)
      .select('id, nome, codice')
      .eq('tenant_id', ctx.tenantId),
    // Timbrature di oggi (tutte): base per i conteggi live + dettaglio per persona.
    supabase
      .from('timbrature' as never)
      .select('id, tipo, ts, pausa, dipendente_id, cantiere_id')
      .eq('tenant_id', ctx.tenantId)
      .gte('ts', fromIso)
      .lt('ts', toIso)
      .order('ts', { ascending: true }),
    // Ultime timbrature (anche di ieri sera): elenco recente.
    supabase
      .from('timbrature' as never)
      .select('id, tipo, ts, pausa, dipendente_id, cantiere_id')
      .eq('tenant_id', ctx.tenantId)
      .order('ts', { ascending: false })
      .limit(8),
  ]);

  const dipendenti =
    (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [];
  const cantieri =
    (cantRes.data as { id: string; nome: string | null; codice: string | null }[] | null) ?? [];
  const oggiRows = (oggiRes.data as TimbRow[] | null) ?? [];
  const ultime = (ultimeRes.data as TimbRow[] | null) ?? [];

  const dipMap = new Map(dipendenti.map((d) => [d.id, titoloCase(`${d.nome} ${d.cognome}`)]));
  const cantMap = new Map(cantieri.map((c) => [c.id, titoloCase(c.nome || c.codice || '')]));

  // Eventi di oggi per dipendente (per stato + dettaglio).
  const eventiPerDip = new Map<string, EventoOggi[]>();
  for (const r of oggiRows) {
    if (!r.dipendente_id) continue;
    const arr = eventiPerDip.get(r.dipendente_id) ?? [];
    arr.push({ tipo: r.tipo, ts: r.ts, pausa: r.pausa, cantiere_id: r.cantiere_id });
    eventiPerDip.set(r.dipendente_id, arr);
  }

  // Conteggi live pausa-aware.
  let inCantiere = 0;
  let inPausa = 0;
  let oreOggiMin = 0;
  for (const [, eventi] of eventiPerDip) {
    const stato = statoDaEventi(eventi);
    if (stato === 'lavoro') inCantiere += 1;
    else if (stato === 'pausa') inPausa += 1;
    oreOggiMin += appaiaTimbrature(eventi).minutiTotali;
  }
  const personeOggi = eventiPerDip.size;
  const cantieriAttivi = new Set(
    oggiRows.filter((r) => r.tipo === 'ingresso' && r.cantiere_id).map((r) => r.cantiere_id),
  ).size;
  const oreOggiLabel =
    oreOggiMin > 0
      ? `${(oreOggiMin / 60).toLocaleString('it-IT', { maximumFractionDigits: 1 })}h`
      : '0h';

  const kpis: {
    label: string;
    value: React.ReactNode;
    icon: typeof Timer;
    tone: keyof typeof KPI_TONE;
    href: string;
  }[] = [
    { label: 'Timbrature oggi', value: oggiRows.length, icon: Timer, tone: 'default', href: '#ultime' },
    {
      label: 'In cantiere',
      value: inCantiere,
      icon: UserCheck,
      tone: inCantiere > 0 ? 'success' : 'default',
      href: '/mobile/kantiere/cantieri',
    },
    {
      label: 'In pausa pranzo',
      value: inPausa,
      icon: Utensils,
      tone: inPausa > 0 ? 'pausa' : 'default',
      href: '/mobile/kantiere/cantieri',
    },
    { label: 'Persone oggi', value: personeOggi, icon: Users, tone: 'default', href: '#ultime' },
    { label: 'Cantieri attivi', value: cantieriAttivi, icon: MapPin, tone: 'default', href: '/mobile/kantiere/cantieri' },
    { label: 'Ore oggi', value: oreOggiLabel, icon: Clock, tone: 'default', href: '/mobile/kantiere/ore' },
  ];

  // Righe "ultime timbrature" con dettaglio presenza di oggi del dipendente.
  const righeUltime: RigaUltima[] = ultime.map((t) => {
    const eventi = t.dipendente_id ? eventiPerDip.get(t.dipendente_id) ?? [] : [];
    return {
      id: t.id,
      tipo: t.tipo,
      oraLabel: formatOra(t.ts),
      dipNome: dipMap.get(t.dipendente_id ?? '') ?? 'Dipendente',
      cantNome: t.cantiere_id ? cantMap.get(t.cantiere_id) ?? null : null,
      dettaglio: dettaglioPresenza(eventi),
    };
  });

  return (
    <div className="flex min-h-[100dvh] flex-col gap-6 p-4">
      <header className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cruscotto</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Panoramica cantieri</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Presenze e attività di oggi, in tempo reale.</p>
      </header>

      {/* KPI — 2 righe da 3, cliccabili verso l'area dedicata */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={
              'flex flex-col gap-1 rounded-xl border p-3 shadow-soft transition-transform active:scale-[0.97] ' +
              KPI_TONE[k.tone]
            }
          >
            <k.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xl font-semibold leading-none tabular-nums">{k.value}</span>
            <span className="text-[10px] leading-tight text-muted-foreground">{k.label}</span>
          </Link>
        ))}
      </div>

      {/* Ultime timbrature (espandibili → stato di oggi del dipendente) */}
      <section id="ultime" className="scroll-mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ultime timbrature
        </p>
        <UltimeTimbrature righe={righeUltime} />
        <p className="pt-1 text-[11px] text-muted-foreground">
          Tocca una riga per vedere lo stato e le timbrature di oggi della persona.
        </p>
      </section>

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
