'use client';

import * as React from 'react';
import {
  Radio,
  MapPin,
  LogIn,
  Coffee,
  Car,
  Receipt,
  Users,
  HardHat,
  Building2,
  Clock,
} from 'lucide-react';

/**
 * Vetrina "presenze live" del modulo Cantiere.
 *
 * Analogo alla waveform del dettato in home: un pannello che si MUOVE da solo
 * per far percepire il tempo reale — orologio che scorre, feed di timbrature
 * che entrano una alla volta, ore-uomo che salgono, battito "presente".
 *
 * Regola anti-hydration: il primo paint è deterministico (tick=0 → stessi
 * valori su server e client). Il tempo reale parte solo in useEffect, e si
 * ferma sotto prefers-reduced-motion (snapshot statico).
 */

type Stato = 'cantiere' | 'viaggio' | 'pausa';

const SQUADRA: {
  nome: string;
  ruolo: string;
  cantiere: string;
  stato: Stato;
  dalle: string;
}[] = [
  { nome: 'Marco R.', ruolo: 'Capo squadra', cantiere: 'Cantiere Belvedere', stato: 'cantiere', dalle: '07:32' },
  { nome: 'Luca F.', ruolo: 'Elettricista', cantiere: 'Polo Logistico Est', stato: 'cantiere', dalle: '07:58' },
  { nome: 'Andrea P.', ruolo: 'Idraulico', cantiere: 'Residenza Aurora', stato: 'cantiere', dalle: '08:05' },
  { nome: 'Giulia B.', ruolo: 'Apprendista', cantiere: 'Polo Logistico Est', stato: 'cantiere', dalle: '08:12' },
  { nome: 'Simone T.', ruolo: 'Termotecnico', cantiere: 'Scuola Manzoni', stato: 'viaggio', dalle: '08:40' },
  { nome: 'Davide M.', ruolo: 'Elettricista', cantiere: 'Cantiere Belvedere', stato: 'pausa', dalle: '10:15' },
];

const FEED: {
  nome: string;
  azione: string;
  cantiere: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}[] = [
  { nome: 'Andrea P.', azione: 'ha timbrato l’ingresso', cantiere: 'Residenza Aurora', icon: LogIn, tone: 'text-success' },
  { nome: 'Simone T.', azione: 'in viaggio verso', cantiere: 'Scuola Manzoni', icon: Car, tone: 'text-primary' },
  { nome: 'Marco R.', azione: 'ha caricato una nota spesa ·', cantiere: 'Cantiere Belvedere', icon: Receipt, tone: 'text-accent' },
  { nome: 'Davide M.', azione: 'in pausa pranzo ·', cantiere: 'Cantiere Belvedere', icon: Coffee, tone: 'text-warning' },
  { nome: 'Giulia B.', azione: 'ha timbrato l’ingresso', cantiere: 'Polo Logistico Est', icon: LogIn, tone: 'text-success' },
];

const STATO_META: Record<Stato, { label: string; badge: string }> = {
  cantiere: { label: 'In cantiere', badge: 'bg-success/10 text-success' },
  viaggio: { label: 'In viaggio', badge: 'bg-primary/10 text-primary' },
  pausa: { label: 'In pausa', badge: 'bg-warning/15 text-warning-foreground' },
};

function iniziali(nome: string) {
  return nome
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function PresenzeLive() {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // snapshot statico
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const inCantiere = SQUADRA.filter((p) => p.stato === 'cantiere').length;
  const cantieriAttivi = new Set(
    SQUADRA.filter((p) => p.stato !== 'viaggio').map((p) => p.cantiere),
  ).size;

  // Orologio che scorre (base 09:12:00 + tick secondi)
  const totSec = 9 * 3600 + 12 * 60 + tick;
  const clock = `${pad(Math.floor(totSec / 3600) % 24)}:${pad(Math.floor(totSec / 60) % 60)}:${pad(totSec % 60)}`;

  // Ore-uomo squadra: salgono di ~1s per ogni tecnico in cantiere
  const oreSec = 41 * 3600 + 20 * 60 + tick * inCantiere;
  const oreUomo = `${Math.floor(oreSec / 3600)}:${pad(Math.floor(oreSec / 60) % 60)}:${pad(oreSec % 60)}`;

  const feedIdx = Math.floor(tick / 4) % FEED.length;
  const ev = FEED[feedIdx]!;
  const EvIcon = ev.icon;

  return (
    <div className="relative animate-float-soft">
      <div
        aria-hidden
        className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-transparent to-accent/15 blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card/90 shadow-soft-lg backdrop-blur">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Kantiere · presenze · oggi
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-destructive">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/60" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
            </span>
            Live
          </span>
        </div>

        {/* feed timbrature (cambia da solo) */}
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-primary-soft/40 px-4 py-2.5">
          <span key={feedIdx} className="flex min-w-0 flex-1 animate-feed-in items-center gap-2 text-[13px]">
            <EvIcon className={`h-4 w-4 shrink-0 ${ev.tone}`} />
            <span className="min-w-0 truncate">
              <span className="font-semibold text-foreground">{ev.nome}</span>{' '}
              <span className="text-muted-foreground">{ev.azione}</span>{' '}
              <span className="font-medium text-foreground">{ev.cantiere}</span>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {clock}
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-px bg-border/60">
          {[
            { icon: HardHat, label: 'In cantiere', value: String(inCantiere), tone: 'text-success' },
            { icon: Building2, label: 'Cantieri attivi', value: String(cantieriAttivi), tone: 'text-primary' },
            { icon: Users, label: 'Ore-uomo oggi', value: oreUomo, tone: 'text-accent', mono: true },
          ].map((k) => (
            <div key={k.label} className="bg-card px-3 py-3 text-center">
              <k.icon className={`mx-auto h-4 w-4 ${k.tone}`} />
              <p className={`mt-1.5 font-semibold tracking-tight ${k.mono ? 'font-mono text-sm tabular-nums' : 'text-lg'}`}>
                {k.value}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {k.label}
              </p>
            </div>
          ))}
        </div>

        {/* elenco squadra */}
        <ul className="divide-y divide-border/60">
          {SQUADRA.map((p, i) => {
            const meta = STATO_META[p.stato];
            return (
              <li key={p.nome} className="flex items-center gap-3 px-4 py-2.5">
                <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-[11px] font-bold text-primary">
                  {iniziali(p.nome)}
                  {p.stato === 'cantiere' && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success animate-heartbeat" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{p.nome}</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {p.ruolo}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{p.cantiere}</span>
                    <span className="hidden font-mono tabular-nums text-muted-foreground/70 xs:inline">· dalle {p.dalle}</span>
                  </span>
                </span>

                {/* micro-attività per chi è in cantiere */}
                {p.stato === 'cantiere' && (
                  <span className="hidden h-5 items-end gap-0.5 sm:flex" aria-hidden>
                    {[0.5, 0.85, 0.4, 0.7, 0.55].map((h, j) => (
                      <span
                        key={j}
                        className="w-0.5 rounded-full bg-success/50 animate-wave"
                        style={{ height: `${Math.round(h * 18)}px`, animationDelay: `${(i * 5 + j) * 70}ms` }}
                      />
                    ))}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* footer */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-primary" />
          Ogni ingresso e uscita dal QR di cantiere
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
            aggiornamento automatico
          </span>
        </div>
      </div>

      {/* badge flottante */}
      <span className="absolute -top-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground shadow-soft-md">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-heartbeat" />
        chi c’è, dove, da che ora
      </span>
    </div>
  );
}
