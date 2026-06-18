'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@kommessa/ui';
import { fmtData } from '@/app/office/_lib/format';
import { approvaRapportino, respingiRapportino, riapriRapportino } from '../../../_actions/kantiere-rapportini';
import { RapportinoBadge } from './rapportino-badge';

export type RapportiniRiga = {
  id: string;
  dipendenteNome: string;
  data: string;
  stato: string;
  inviatoAt: string | null;
  totale: { ord: number; straord: number; viaggio: number };
  righe: { commessaTitolo: string; ore_ordinarie: number; ore_straordinarie: number; ore_viaggio: number }[];
};

export type FiltriRapportini = {
  from: string;
  to: string;
  stato: string;
  dipendente: string;
};

export type DipendenteItem = { id: string; nome: string };

interface Props {
  righe: RapportiniRiga[];
  filtri: FiltriRapportini;
  dipendenti: DipendenteItem[];
}

const STATI_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'bozza', label: 'Bozza' },
  { value: 'inviato', label: 'Inviato' },
  { value: 'verificato', label: 'Verificato' },
  { value: 'approvato', label: 'Approvato' },
  { value: 'respinto', label: 'Respinto' },
  { value: 'esportato', label: 'Esportato' },
];

function fmtOre(n: number): string {
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

export function RapportiniClient({ righe, filtri, dipendenti }: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  // Filtri locali controllati
  const [from, setFrom] = React.useState(filtri.from);
  const [to, setTo] = React.useState(filtri.to);
  const [stato, setStato] = React.useState(filtri.stato);
  const [dipendente, setDipendente] = React.useState(filtri.dipendente);

  // Espansione righe
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  // Errori per riga
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [isPending, startAction] = React.useTransition();

  // Dialog respingi
  const [respingiDialog, setRespingiDialog] = React.useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const [motivoError, setMotivoError] = React.useState('');

  function applyFiltri(overrides: Partial<{ from: string; to: string; stato: string; dipendente: string }>) {
    const f = { from, to, stato, dipendente, ...overrides };
    const qs = new URLSearchParams();
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);
    if (f.stato) qs.set('stato', f.stato);
    if (f.dipendente) qs.set('dipendente', f.dipendente);
    startTransition(() => {
      router.push('/office/kantiere/rapportini?' + qs.toString());
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearError(id: string) {
    setErrors((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  function handleApprova(id: string) {
    clearError(id);
    setPendingId(id);
    startAction(async () => {
      const res = await approvaRapportino({ rapportinoId: id });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  function handleRiapri(id: string) {
    clearError(id);
    setPendingId(id);
    startAction(async () => {
      const res = await riapriRapportino({ rapportinoId: id });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  function openRespingi(id: string, nome: string) {
    setMotivoError('');
    setMotivo('');
    setRespingiDialog({ id, nome });
  }

  function handleRespingi() {
    if (!respingiDialog) return;
    const m = motivo.trim();
    if (!m) {
      setMotivoError('Inserisci un motivo.');
      return;
    }
    if (m.length > 500) {
      setMotivoError('Massimo 500 caratteri.');
      return;
    }
    const id = respingiDialog.id;
    setRespingiDialog(null);
    clearError(id);
    setPendingId(id);
    startAction(async () => {
      const res = await respingiRapportino({ rapportinoId: id, motivo: m });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  const exportQs = new URLSearchParams();
  if (filtri.from) exportQs.set('from', filtri.from);
  if (filtri.to) exportQs.set('to', filtri.to);
  if (filtri.stato) exportQs.set('stato', filtri.stato);
  if (filtri.dipendente) exportQs.set('dipendente', filtri.dipendente);
  const exportHref = '/api/office/kantiere/rapportini/export?' + exportQs.toString();

  return (
    <div className="space-y-4">
      {/* Barra filtri */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Dal</label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  applyFiltri({ from: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Al</label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  applyFiltri({ to: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Stato</label>
              <select
                value={stato}
                onChange={(e) => {
                  setStato(e.target.value);
                  applyFiltri({ stato: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {STATI_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
              <select
                value={dipendente}
                onChange={(e) => {
                  setDipendente(e.target.value);
                  applyFiltri({ dipendente: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Tutti i dipendenti</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-auto">
              <a
                href={exportHref}
                className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Esporta CSV
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella */}
      {righe.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun rapportino nel periodo selezionato.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-3" />
                    <th className="px-4 py-3 font-medium">Dipendente</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="px-4 py-3 font-medium">Ord.</th>
                    <th className="px-4 py-3 font-medium">Straord.</th>
                    <th className="px-4 py-3 font-medium">Viaggio</th>
                    <th className="w-56 px-4 py-3" aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga, i) => {
                    const isOpen = expanded.has(riga.id);
                    const isRowPending = isPending && pendingId === riga.id;
                    const rowErr = errors[riga.id];
                    return (
                      <React.Fragment key={riga.id}>
                        <tr
                          className={[
                            'border-b border-border transition-colors hover:bg-primary-soft/50 cursor-pointer',
                            i % 2 !== 0 ? 'bg-muted/20' : '',
                          ].join(' ')}
                          onClick={() => toggleExpand(riga.id)}
                        >
                          <td className="px-2 py-3 text-muted-foreground">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium">{riga.dipendenteNome}</td>
                          <td className="px-4 py-3 tabular-nums">{fmtData(riga.data)}</td>
                          <td className="px-4 py-3">
                            <RapportinoBadge stato={riga.stato} />
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {fmtOre(riga.totale.ord)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {fmtOre(riga.totale.straord)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">
                            {fmtOre(riga.totale.viaggio)}
                          </td>
                          <td
                            className="px-2 py-2 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              {riga.stato === 'inviato' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isRowPending || isPending}
                                    onClick={() => handleApprova(riga.id)}
                                  >
                                    {isRowPending ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    ) : null}
                                    Approva
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isRowPending || isPending}
                                    onClick={() => openRespingi(riga.id, riga.dipendenteNome)}
                                  >
                                    Respingi
                                  </Button>
                                </>
                              )}
                              {(riga.stato === 'approvato' || riga.stato === 'respinto') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRowPending || isPending}
                                  onClick={() => handleRiapri(riga.id)}
                                >
                                  {isRowPending ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : null}
                                  Riapri
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {rowErr ? (
                          <tr className="border-b border-border bg-destructive/5">
                            <td colSpan={8} className="px-4 py-2 text-xs text-destructive">
                              Errore: {rowErr}
                            </td>
                          </tr>
                        ) : null}
                        {isOpen && (
                          <tr className="border-b border-border bg-muted/30">
                            <td colSpan={8} className="px-6 py-3">
                              {riga.righe.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nessuna riga commessa.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-muted-foreground">
                                      <th className="pb-1 pr-4 font-medium">Commessa</th>
                                      <th className="pb-1 pr-4 font-medium">Ord.</th>
                                      <th className="pb-1 pr-4 font-medium">Straord.</th>
                                      <th className="pb-1 font-medium">Viaggio</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {riga.righe.map((r, j) => (
                                      <tr key={j} className="border-t border-border/50">
                                        <td className="py-1 pr-4 font-medium text-foreground">
                                          {r.commessaTitolo}
                                        </td>
                                        <td className="py-1 pr-4 tabular-nums">{fmtOre(r.ore_ordinarie)}</td>
                                        <td className="py-1 pr-4 tabular-nums">{fmtOre(r.ore_straordinarie)}</td>
                                        <td className="py-1 tabular-nums">{fmtOre(r.ore_viaggio)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog Respingi */}
      <Dialog open={!!respingiDialog} onOpenChange={(open) => { if (!open) setRespingiDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Respingi rapportino</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Stai per respingere il rapportino di{' '}
              <span className="font-medium text-foreground">{respingiDialog?.nome}</span>.
              Indica il motivo del rifiuto.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Motivo</label>
              <textarea
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setMotivoError('');
                }}
                rows={3}
                maxLength={500}
                placeholder="Descrivi il problema..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {motivoError ? (
                <p className="text-xs text-destructive">{motivoError}</p>
              ) : (
                <p className="text-xs text-muted-foreground text-right">{motivo.length}/500</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespingiDialog(null)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleRespingi} disabled={isPending}>
              {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Respingi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
