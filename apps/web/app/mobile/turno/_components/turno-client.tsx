'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Play, Square, Timer } from 'lucide-react';

import { Button, Card, CardContent } from '@impiantixplus/ui';

import { iniziaTurno, terminaTurno } from '../../_actions/turno';

export interface ApertoCommessa {
  id: string;
  codice_interno: string;
  cliente_ragione_sociale: string | null;
}

export interface IntervAperto {
  id: string;
  start_at: string;
  commessa: ApertoCommessa | null;
}

export interface CommessaOpzione {
  id: string;
  codice_interno: string;
  cliente_ragione_sociale: string | null;
}

interface Props {
  aperto: IntervAperto | null;
  commesse: CommessaOpzione[];
}

export function TurnoClient({ aperto, commesse }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [commessaSel, setCommessaSel] = useState<string>(commesse[0]?.id ?? '');

  if (aperto) {
    return (
      <TurnoApertoCard
        aperto={aperto}
        pending={pending}
        errore={errore}
        onTermina={() => {
          setErrore(null);
          startTransition(async () => {
            const res = await terminaTurno({});
            if (!res.ok) {
              setErrore(res.error ?? 'Errore durante la chiusura del turno.');
              return;
            }
            router.refresh();
          });
        }}
      />
    );
  }

  return (
    <Card className="border-border/80">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Stato turno
          </p>
          <h2 className="text-lg font-semibold tracking-tight">
            Nessun turno in corso
          </h2>
          <p className="text-sm text-muted-foreground">
            Seleziona la commessa e avvia il cronometro.
          </p>
        </div>

        {commesse.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Nessuna commessa attiva assegnata. Chiedi al capo di assegnartene
            una.
          </p>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="commessa-select"
              className="text-xs font-medium text-foreground"
            >
              Commessa
            </label>
            <select
              id="commessa-select"
              value={commessaSel}
              onChange={(e) => setCommessaSel(e.target.value)}
              className="block w-full min-h-[44px] rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {commesse.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice_interno}
                  {c.cliente_ragione_sociale
                    ? ` · ${c.cliente_ragione_sociale}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {errore ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {errore}
          </p>
        ) : null}

        <Button
          size="lg"
          className="min-h-[52px] w-full"
          disabled={pending || !commessaSel}
          onClick={() => {
            setErrore(null);
            const geo = (): Promise<{
              lat: number | null;
              lng: number | null;
            }> =>
              new Promise((resolve) => {
                if (!('geolocation' in navigator)) {
                  return resolve({ lat: null, lng: null });
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) =>
                    resolve({
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                    }),
                  () => resolve({ lat: null, lng: null }),
                  { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 },
                );
              });

            startTransition(async () => {
              const { lat, lng } = await geo();
              const res = await iniziaTurno({
                commessaId: commessaSel,
                geoLat: lat,
                geoLng: lng,
              });
              if (!res.ok) {
                setErrore(res.error ?? 'Errore durante l\'avvio del turno.');
                return;
              }
              router.refresh();
            });
          }}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
          Inizia turno
        </Button>
      </CardContent>
    </Card>
  );
}

function TurnoApertoCard({
  aperto,
  pending,
  errore,
  onTermina,
}: {
  aperto: IntervAperto;
  pending: boolean;
  errore: string | null;
  onTermina: () => void;
}) {
  // Cronometro live: aggiorna ogni secondo.
  const startMs = useMemo(
    () => new Date(aperto.start_at).getTime(),
    [aperto.start_at],
  );
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, now - startMs);
  const hh = Math.floor(elapsedMs / 3_600_000);
  const mm = Math.floor((elapsedMs % 3_600_000) / 60_000);
  const ss = Math.floor((elapsedMs % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <Card className="overflow-hidden border-accent/50 bg-accent/5">
      <span
        aria-hidden="true"
        className="block h-1 w-full bg-accent"
      />
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              Turno in corso
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {aperto.commessa?.codice_interno ?? '—'}
            </p>
            <p className="truncate text-sm text-foreground">
              {aperto.commessa?.cliente_ragione_sociale ?? '—'}
            </p>
          </div>
        </div>

        <div
          className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-foreground"
          aria-live="polite"
        >
          {pad(hh)}:{pad(mm)}:{pad(ss)}
        </div>

        <p className="text-xs text-muted-foreground">
          Avviato alle{' '}
          <span className="font-mono tabular-nums">
            {new Date(aperto.start_at).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </p>

        {errore ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {errore}
          </p>
        ) : null}

        <Button
          size="lg"
          variant="default"
          className="min-h-[52px] w-full bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={pending}
          onClick={onTermina}
        >
          <Square className="h-5 w-5" aria-hidden="true" />
          Termina turno
        </Button>
      </CardContent>
    </Card>
  );
}

export interface InterventoRecente {
  id: string;
  commessa_codice: string;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
  geo_lat: number | null;
  geo_lng: number | null;
}

export function InterventiOggiList({ items }: { items: InterventoRecente[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        Nessun intervento registrato oggi.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li
          key={it.id}
          className="rounded-lg border border-border bg-card p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold tabular-nums">
              {it.commessa_codice}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatHM(it.start_at)} – {it.end_at ? formatHM(it.end_at) : '…'}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {it.duration_minutes != null
                ? formatDurataMin(it.duration_minutes)
                : 'In corso'}
            </span>
            {it.geo_lat != null && it.geo_lng != null ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  {it.geo_lat.toFixed(3)}, {it.geo_lng.toFixed(3)}
                </span>
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatHM(iso: string) {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDurataMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  return `${h}h ${mm.toString().padStart(2, '0')}m`;
}
