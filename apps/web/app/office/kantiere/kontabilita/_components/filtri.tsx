'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@kommessa/ui';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import type { SpesaRiga, CantiereOption } from './spese-table';

export type FiltriValori = {
  cantiere: string;
  dipendente: string;
  categoria: string;
  da: string;
  a: string;
};

type DipendenteOption = { id: string; nome: string };

interface Props {
  valori: FiltriValori;
  cantieri: CantiereOption[];
  dipendenti: DipendenteOption[];
  /** Righe attualmente mostrate, per l'export CSV. */
  righe: SpesaRiga[];
}

/** Formatta un numero con la virgola decimale italiana, senza simbolo valuta. */
function numIt(n: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return n.toFixed(2).replace('.', ',');
}

function dataIt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Escape di un campo CSV (separatore ;). */
function csvCell(v: string): string {
  const s = v ?? '';
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function Filtri({ valori, cantieri, dipendenti, righe }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const applica = React.useCallback(
    (patch: Partial<FiltriValori>) => {
      const next = { ...valori, ...patch };
      const params = new URLSearchParams();
      if (next.cantiere) params.set('cantiere', next.cantiere);
      if (next.dipendente) params.set('dipendente', next.dipendente);
      if (next.categoria) params.set('categoria', next.categoria);
      if (next.da) params.set('da', next.da);
      if (next.a) params.set('a', next.a);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [valori, router, pathname],
  );

  const haFiltri = !!(valori.cantiere || valori.dipendente || valori.categoria || valori.da || valori.a);

  function esportaCsv() {
    const intestazioni = [
      'Data scontrino',
      'Esercente',
      'Dipendente',
      'Cantiere',
      'Categoria',
      'Totale',
      'IVA',
      'Imponibile',
      'Valuta',
    ];
    const righeTesto = righe.map((s) => {
      const cat = s.categoria && CATEGORIA_META[s.categoria as keyof typeof CATEGORIA_META]
        ? CATEGORIA_META[s.categoria as keyof typeof CATEGORIA_META].label
        : '';
      return [
        dataIt(s.dataScontrino),
        s.ragioneSociale?.trim() || 'Senza nome',
        s.dipendenteNome,
        s.cantiereNome ?? 'Da assegnare',
        cat,
        numIt(s.importoTotale),
        numIt(s.importoIva),
        numIt(s.imponibile),
        s.valuta || 'EUR',
      ]
        .map(csvCell)
        .join(';');
    });
    const csv = [intestazioni.join(';'), ...righeTesto].join('\r\n');
    // BOM per far riconoscere l'UTF-8 a Excel.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kontabilita-spese-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const selectCls =
    'h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const dateCls =
    'h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <select
        aria-label="Cantiere"
        value={valori.cantiere}
        onChange={(e) => applica({ cantiere: e.target.value })}
        className={selectCls}
      >
        <option value="">Tutti i cantieri</option>
        {cantieri.map((k) => (
          <option key={k.id} value={k.id}>
            {k.nome}
          </option>
        ))}
      </select>

      <select
        aria-label="Dipendente"
        value={valori.dipendente}
        onChange={(e) => applica({ dipendente: e.target.value })}
        className={selectCls}
      >
        <option value="">Tutti i dipendenti</option>
        {dipendenti.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nome}
          </option>
        ))}
      </select>

      <select
        aria-label="Categoria"
        value={valori.categoria}
        onChange={(e) => applica({ categoria: e.target.value })}
        className={selectCls}
      >
        <option value="">Tutte le categorie</option>
        {CATEGORIE_ORDINATE.map((c) => (
          <option key={c} value={c}>
            {CATEGORIA_META[c].label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Dal</span>
        <input
          type="date"
          aria-label="Data dal"
          value={valori.da}
          onChange={(e) => applica({ da: e.target.value })}
          className={dateCls}
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Al</span>
        <input
          type="date"
          aria-label="Data al"
          value={valori.a}
          onChange={(e) => applica({ a: e.target.value })}
          className={dateCls}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {haFiltri ? (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
            Pulisci
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={esportaCsv} disabled={righe.length === 0}>
          Esporta CSV
        </Button>
      </div>
    </div>
  );
}
