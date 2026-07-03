'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, MapPin, User, AlertTriangle } from 'lucide-react';

import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  codiceCantiereMostrato,
  categoriaLabel,
  categoriaTono,
} from '@/app/_lib/cantiere-categoria';
import { TurnoAzioniCantiere } from '../../_components/turno-azioni-cantiere';
import type { TurnoAttivoMio } from '../../_lib/turno-attivo';
import type { TurnoAzioniContesto } from '../../_lib/turno-azioni-contesto';
import { CategoriaDropdown } from './categoria-dropdown';

export interface CantiereItem {
  id: string;
  codice: string | null;
  codice_commessa: string | null;
  nome: string | null;
  cliente_nome: string | null;
  indirizzo: string | null;
  categoria: string | null;
  indirizzo_da_verificare: boolean | null;
  stato: string;
}

const STATO_LABEL: Record<string, string> = {
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  chiuso: 'Chiuso',
};

export function CantieriBrowser({
  cantieri,
  turno,
  azioni,
}: {
  cantieri: CantiereItem[];
  turno: TurnoAttivoMio | null;
  azioni: TurnoAzioniContesto | null;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  const categorie = useMemo(
    () =>
      [...new Set(cantieri.map((c) => c.categoria).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [cantieri],
  );

  const filtrati = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cantieri.filter((c) => {
      if (cat && c.categoria !== cat) return false;
      if (!needle) return true;
      return [c.nome, c.codice_commessa, c.codice, c.cliente_nome, c.indirizzo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(needle));
    });
  }, [q, cat, cantieri]);

  return (
    <div className="flex flex-col gap-3">
      {/* Turno in corso — card azioni completa (pausa pranzo + fine turno) in
          alto, sopra la ricerca, con header tappabile verso la scheda cantiere. */}
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
        />
      ) : null}

      {/* Ricerca (75%) + filtro tipologia (25%), inline, stessa altezza */}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-[3]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca cantiere..."
            aria-label="Cerca cantiere"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 shadow-soft focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {categorie.length > 0 ? (
          <div className="flex-1">
            <CategoriaDropdown categorie={categorie} selected={cat} onSelect={setCat} />
          </div>
        ) : null}
      </div>

      {/* Lista */}
      {filtrati.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {q.trim() || cat ? 'Nessun cantiere trovato.' : 'Nessun cantiere disponibile.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrati.map((c) => {
            const codice = codiceCantiereMostrato(c);
            return (
              <Link
                key={c.id}
                href={`/mobile/kantiere/cantieri/${c.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft active:scale-[0.99] transition-transform"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {titoloCase(c.nome ?? '') || codice || 'Cantiere'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {c.cliente_nome ? (
                      <span className="inline-flex min-w-0 items-center gap-0.5">
                        <User className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{titoloCase(c.cliente_nome)}</span>
                      </span>
                    ) : null}
                    {c.categoria ? (
                      <span
                        className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${categoriaTono(c.categoria)}`}
                      >
                        {categoriaLabel(c.categoria)}
                      </span>
                    ) : null}
                    {c.indirizzo ? (
                      <span className="inline-flex min-w-0 items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{c.indirizzo}</span>
                      </span>
                    ) : null}
                    {c.indirizzo_da_verificare ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        da verificare
                      </span>
                    ) : null}
                    <span>{STATO_LABEL[c.stato] ?? c.stato}</span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  {codice ? (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                      {codice}
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
