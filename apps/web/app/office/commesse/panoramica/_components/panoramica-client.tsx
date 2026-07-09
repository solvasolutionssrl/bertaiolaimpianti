'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@kommessa/ui';
import { ArrowLeft, Printer, Search, X } from 'lucide-react';
import { fmtData } from '../../../_lib/format';

export interface PanoramicaRow {
  id: string;
  codice_interno: string;
  stato: 'aperta' | 'in_corso' | 'collaudo';
  cliente_nome: string;
  titolo: string;
  inserita: string | null;
  creatore: string;
}

const STATO_META: Record<
  PanoramicaRow['stato'],
  { label: string; color: string }
> = {
  aperta: { label: 'Non presa', color: '#1a7f52' },
  in_corso: { label: 'In corso', color: '#1340A6' },
  collaudo: { label: 'In collaudo', color: '#F26B23' },
};

const FILTRI: Array<{ value: '' | PanoramicaRow['stato']; label: string }> = [
  { value: '', label: 'Tutte' },
  { value: 'aperta', label: 'Non prese' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'collaudo', label: 'In collaudo' },
];

export function PanoramicaClient({
  rows,
  tenantName,
  logoUrl,
  brandColor,
  aggiornatoAl,
}: {
  rows: PanoramicaRow[];
  tenantName: string;
  logoUrl: string | null;
  brandColor: string;
  aggiornatoAl: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [stato, setStato] = useState<'' | PanoramicaRow['stato']>('');

  const filtered = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (stato && r.stato !== stato) return false;
      if (tokens.length === 0) return true;
      const hay = [r.codice_interno, r.cliente_nome, r.titolo, r.creatore]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, q, stato]);

  const counts = useMemo(() => {
    const c = { aperta: 0, in_corso: 0, collaudo: 0 } as Record<
      PanoramicaRow['stato'],
      number
    >;
    for (const r of filtered) c[r.stato] += 1;
    return c;
  }, [filtered]);

  const statoLabel = stato ? STATO_META[stato].label : 'Tutte le commesse aperte';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-10 pt-2 md:px-6">
      {/* ===== Toolbar (no-print) ===== */}
      <div className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/office/commesse"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Commesse
          </Link>
          <Button type="button" size="sm" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Stampa / Salva PDF
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Ricerca */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              inputMode="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca codice, cliente, oggetto…"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Pulisci ricerca"
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Filtro stato segmentato */}
          <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-sm">
            {FILTRI.map((f) => {
              const active = stato === f.value;
              return (
                <button
                  key={f.value || 'tutte'}
                  type="button"
                  onClick={() => setStato(f.value)}
                  className={
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (active
                      ? 'bg-card text-foreground shadow-soft'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Documento stampabile ===== */}
      <div className="panoramica-page">
        <div className="page-shell">
          {/* Header brandizzato */}
          <div className="doc-header">
            <div className="doc-head-text">
              <p className="doc-eyebrow">Panoramica commesse aperte</p>
              <h1 className="doc-title">{tenantName}</h1>
              <p className="doc-sub">
                Stato: <strong>{statoLabel}</strong> · {filtered.length} commess
                {filtered.length === 1 ? 'a' : 'e'} · Aggiornato al {aggiornatoAl}
              </p>
            </div>
            {logoUrl ? (
              <div className="doc-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={tenantName} />
              </div>
            ) : null}
          </div>
          <div
            className="brand-line"
            style={{
              background: `linear-gradient(90deg, ${brandColor} 0%, ${brandColor} 55%, #F26B23 55%, #F26B23 100%)`,
            }}
          />

          {/* Riepilogo per stato */}
          <div className="doc-chips">
            <StatoChip stato="in_corso" n={counts.in_corso} />
            <StatoChip stato="collaudo" n={counts.collaudo} />
            <StatoChip stato="aperta" n={counts.aperta} />
          </div>

          {/* Tabellone */}
          {filtered.length === 0 ? (
            <p className="doc-empty">
              {rows.length === 0
                ? 'Nessuna commessa aperta al momento.'
                : 'Nessuna commessa corrisponde ai filtri selezionati.'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="w-code">Codice</th>
                  <th className="w-stato">Stato</th>
                  <th className="w-cliente">Cliente</th>
                  <th>Oggetto</th>
                  <th className="w-small">Inserita</th>
                  <th className="w-small">Creato da</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const m = STATO_META[r.stato];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/office/commesse/${r.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/office/commesse/${r.id}`);
                        }
                      }}
                      aria-label={`Apri commessa ${r.codice_interno}`}
                    >
                      <td className="col-codice">{r.codice_interno}</td>
                      <td>
                        <span className="stato" style={{ color: m.color }}>
                          <span
                            className="stato-dot"
                            style={{ background: m.color }}
                          />
                          {m.label}
                        </span>
                      </td>
                      <td className="col-cliente">{r.cliente_nome}</td>
                      <td className="col-oggetto">{r.titolo}</td>
                      <td className="col-small">{fmtData(r.inserita)}</td>
                      <td className="col-small">{r.creatore}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <footer className="doc-footer">
            {tenantName} · Panoramica commesse aperte · Generato da Kommessa ·{' '}
            {aggiornatoAl}
          </footer>
        </div>
      </div>
    </div>
  );
}

function StatoChip({ stato, n }: { stato: PanoramicaRow['stato']; n: number }) {
  const m = STATO_META[stato];
  return (
    <span className="doc-chip">
      <span className="stato-dot" style={{ background: m.color }} />
      <strong style={{ color: m.color }}>{n}</strong>
      {m.label}
    </span>
  );
}
