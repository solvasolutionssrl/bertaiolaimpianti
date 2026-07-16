'use client';

import * as React from 'react';
import {
  Wifi,
  BatteryFull,
  Bell,
  Coffee,
  LogOut,
  QrCode,
  Car,
  Plus,
  CheckCircle2,
  MapPin,
} from 'lucide-react';

/**
 * "Render" (non uno screenshot) dell'app del tecnico a turno aperto.
 * Il cronometro scorre davvero: base = 01:14:00 (ingresso 07:58 → ora 09:12),
 * coerente con la board presenze. Primo paint deterministico (tick=0), il
 * tempo reale parte in useEffect e si ferma sotto prefers-reduced-motion.
 */
function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function AppTimbrature() {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = 74 * 60 + tick; // 01:14:00 + tick
  const crono = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor(elapsed / 60) % 60)}:${pad(elapsed % 60)}`;
  const oraSec = 9 * 3600 + 12 * 60 + tick;
  const ora = `${pad(Math.floor(oraSec / 3600) % 24)}:${pad(Math.floor(oraSec / 60) % 60)}`;

  return (
    <div className="mx-auto w-[17rem] max-w-full animate-float-soft" style={{ animationDelay: '400ms' }}>
      <div className="relative rounded-[2.4rem] border-[7px] border-neutral-900 bg-neutral-900 shadow-soft-lg">
        {/* notch */}
        <div className="absolute left-1/2 top-2 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />
        {/* screen */}
        <div className="overflow-hidden rounded-[1.8rem] bg-canvas-mobile">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-semibold text-neutral-700">
            <span className="font-mono tabular-nums">{ora}</span>
            <span className="flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* app header */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white shadow-glow-brand"
              style={{ background: 'linear-gradient(135deg, hsl(220 80% 32%), hsl(22 92% 54%))' }}
            >
              K
            </span>
            <span className="text-sm font-semibold tracking-tight text-neutral-800">Kantiere</span>
            <Bell className="ml-auto h-4 w-4 text-neutral-500" />
          </div>

          <div className="space-y-2.5 px-3 pb-4">
            {/* card turno in corso */}
            <div className="rounded-2xl bg-success p-4 text-success-foreground shadow-soft-md">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                  <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                Turno in corso
              </div>
              <p className="mt-1 text-[15px] font-semibold leading-tight">Polo Logistico Est</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight">{crono}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/85">
                <QrCode className="h-3 w-3" /> dalle 07:58 · timbrato col QR
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/15 py-2 text-xs font-semibold text-white">
                  <Coffee className="h-3.5 w-3.5" /> Pausa
                </button>
                <button className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900/85 py-2 text-xs font-semibold text-white">
                  <LogOut className="h-3.5 w-3.5" /> Fine turno
                </button>
              </div>
            </div>

            {/* timbrature di oggi */}
            <div className="rounded-2xl bg-white p-3 shadow-soft">
              <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400">
                Oggi
              </p>
              <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <span className="text-xs font-medium text-neutral-700">Ingresso</span>
                <span className="ml-auto font-mono text-xs tabular-nums text-neutral-500">07:58 · QR</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                <Car className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate text-xs font-medium text-neutral-700">
                  Sede → Polo Est
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-neutral-500">12 km · 18’</span>
              </div>
            </div>

            {/* nota spesa */}
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white shadow-soft-md"
              style={{ background: 'hsl(22 92% 54%)' }}
            >
              <Plus className="h-4 w-4" /> Aggiungi nota spesa
            </button>

            {/* tab bar hint */}
            <div className="flex items-center justify-around pt-1 text-[9px] font-medium text-neutral-400">
              {['Cantieri', 'Ore', 'Spese', 'Profilo'].map((t, i) => (
                <span key={t} className={i === 0 ? 'text-primary' : ''}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        L’app del tecnico, in cantiere
      </p>
    </div>
  );
}
