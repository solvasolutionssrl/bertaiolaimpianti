'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { Card, CardContent, cn } from '@kommessa/ui';
import { categoriaLabel, codiceCantiereMostrato } from '@/app/_lib/cantiere-categoria';

export interface CantiereMioRiga {
  id: string;
  codice: string;
  codice_commessa: string | null;
  nome: string;
  cliente_nome: string | null;
  categoria: string | null;
  indirizzo: string | null;
  stato: string;
  nFasi: number;
  inSquadra: boolean;
}

/** La stessa ricerca a token dell'app: ogni parola deve comparire da qualche parte. */
function corrisponde(c: CantiereMioRiga, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const testo = [c.nome, c.codice_commessa, c.codice, c.cliente_nome, c.indirizzo, c.categoria].filter(Boolean).join(' ').toLowerCase();
  return t.split(/\s+/).every((tok) => testo.includes(tok));
}

export function CantieriMioClient({ cantieri }: { cantieri: CantiereMioRiga[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [soloMiei, setSoloMiei] = React.useState(false);
  const visibili = cantieri.filter((c) => corrisponde(c, q) && (!soloMiei || c.inSquadra));
  const nMiei = cantieri.filter((c) => c.inSquadra).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, codice, cliente, indirizzo"
            aria-label="Cerca cantiere"
            className="h-10 w-80 rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
        </label>
        {nMiei > 0 ? (
          <button
            type="button"
            onClick={() => setSoloMiei((v) => !v)}
            aria-pressed={soloMiei}
            className={cn(
              'inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm',
              soloMiei ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background text-foreground',
            )}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Nella mia squadra · {nMiei}
          </button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          {visibili.length === cantieri.length ? `${cantieri.length} cantieri` : `${visibili.length} su ${cantieri.length}`}
        </p>
      </div>
      <Card>
        <CardContent className="p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-28 px-3 py-2 font-medium">Codice</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Tipologia</th>
                  <th className="px-3 py-2 font-medium">Indirizzo</th>
                  <th className="w-24 px-3 py-2 font-medium">Squadra</th>
                </tr>
              </thead>
              <tbody>
                {visibili.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                      Nessun cantiere trovato.
                    </td>
                  </tr>
                ) : (
                  visibili.map((c) => (
                    <tr
                      key={c.id}
                      data-cantiere={c.id}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
                      onClick={() => router.push(`/office/mio/cantieri/${c.id}`)}
                    >
                      <td className="px-3 py-2 font-mono text-xs font-medium">{codiceCantiereMostrato(c)}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{c.nome}</span>
                        {c.nFasi > 0 ? (
                          <span className="ml-2 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" data-fasi={c.nFasi}>
                            {c.nFasi} {c.nFasi === 1 ? 'fase' : 'fasi'}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.cliente_nome ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.categoria ? categoriaLabel(c.categoria) : '—'}</td>
                      <td className="max-w-[18rem] truncate px-3 py-2 text-muted-foreground">{c.indirizzo ?? '—'}</td>
                      <td className="px-3 py-2">
                        {c.inSquadra ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">Sì</span> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
