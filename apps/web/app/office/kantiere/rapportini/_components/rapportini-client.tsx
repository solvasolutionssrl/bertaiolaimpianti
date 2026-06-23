'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronDown, ChevronRight, PlusCircle, CheckCheck } from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@kommessa/ui';
import { fmtData, fmtDataOra } from '@/app/office/_lib/format';
import { approvaRapportino, approvaRapportiniBulk, respingiRapportino, riapriRapportino, registraOrePerDipendente } from '../../../_actions/kantiere-rapportini';
import { RapportinoBadge } from './rapportino-badge';
import { VersioniDialog } from './versioni-dialog';
import { TimbratureRiepilogo, TimbratureSommario } from '../../_components/timbrature-riepilogo';
import { GiornateApertePanel } from './giornate-aperte-panel';
import type { GiornataAperta } from '@/app/office/_actions/kantiere-rapportini';

export type TimbraturaItem = {
  tipo: string;
  ts: string;
  origine: string | null;
  commessaTitolo: string | null;
  pausa?: boolean | null;
};

export type RigaCommessa = {
  commessaTitolo: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string | null;
};

export type RapportiniRiga = {
  id: string;
  dipendenteNome: string;
  data: string;
  stato: string;
  modificato?: boolean;
  inviatoAt: string | null;
  note: string | null;
  totale: { ord: number; straord: number; viaggio: number };
  nRighe: number;
  righe: RigaCommessa[];
  timbrature: TimbraturaItem[];
};

export type FiltriRapportini = {
  from: string;
  to: string;
  stato: string;
  dipendente: string;
};

export type DipendenteItem = { id: string; nome: string };
export type CommessaPickerItem = { id: string; titolo: string };
export type CantierePickerItem = { id: string; nome: string };

// Giorno corrente in formato YYYY-MM-DD (client-side, fuso locale)
function oggiLocale(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface Props {
  righe: RapportiniRiga[];
  filtri: FiltriRapportini;
  dipendenti: DipendenteItem[];
  commesse: CommessaPickerItem[];
  cantieri: CantierePickerItem[];
  giorniAperti: GiornataAperta[];
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

/** Dot + label per tipo timbratura. */
function TimbraturaIndicator({ tipo }: { tipo: string }) {
  const isIngresso = tipo === 'ingresso';
  return (
    <span
      className={[
        'inline-block h-2 w-2 rounded-full flex-shrink-0',
        isIngresso ? 'bg-emerald-500' : 'bg-slate-400',
      ].join(' ')}
      title={isIngresso ? 'Ingresso' : 'Uscita'}
    />
  );
}

export function RapportiniClient({ righe, filtri, dipendenti, commesse, cantieri, giorniAperti }: Props) {
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

  // Selezione multipla per approvazione in blocco
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkErr, setBulkErr] = React.useState<string | null>(null);
  const [isBulkPending, startBulk] = React.useTransition();

  // Dialog respingi
  const [respingiDialog, setRespingiDialog] = React.useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = React.useState('');
  const [motivoError, setMotivoError] = React.useState('');

  const [versioniFor, setVersioniFor] = React.useState<{ id: string; nome: string; data: string } | null>(null);

  // Dialog registra ore
  const [registraOpen, setRegistraOpen] = React.useState(false);
  const [regDipendenteId, setRegDipendenteId] = React.useState('');
  const [regTarget, setRegTarget] = React.useState(''); // "c:<id>" cantiere | "k:<id>" commessa
  const [regData, setRegData] = React.useState(oggiLocale());
  const [regOrdinarie, setRegOrdinarie] = React.useState(0);
  const [regViaggio, setRegViaggio] = React.useState(0);
  const [regStraordinari, setRegStraordinari] = React.useState(0);
  const [regNote, setRegNote] = React.useState('');
  const [regError, setRegError] = React.useState('');
  const [isRegPending, startRegAction] = React.useTransition();

  function openRegistra() {
    setRegDipendenteId(dipendenti[0]?.id ?? '');
    setRegTarget('');
    setRegData(oggiLocale());
    setRegOrdinarie(0);
    setRegViaggio(0);
    setRegStraordinari(0);
    setRegNote('');
    setRegError('');
    setRegistraOpen(true);
  }

  function handleRegistra() {
    setRegError('');
    if (!regDipendenteId) { setRegError('Seleziona un dipendente.'); return; }
    if (!regTarget) { setRegError('Seleziona una commessa o un cantiere.'); return; }
    if (!regData) { setRegError('Inserisci la data.'); return; }

    const isCommessa = regTarget.startsWith('k:');
    const isCantiere = regTarget.startsWith('c:');
    const targetId = regTarget.slice(2);

    startRegAction(async () => {
      const res = await registraOrePerDipendente({
        dipendenteId: regDipendenteId,
        commessaId: isCommessa ? targetId : undefined,
        cantiereId: isCantiere ? targetId : undefined,
        data: regData,
        ore_ordinarie: regOrdinarie,
        ore_viaggio: regViaggio,
        ore_straordinarie: regStraordinari,
        note: regNote.trim() || undefined,
      });
      if (!res.ok) {
        setRegError(res.error);
        return;
      }
      setRegistraOpen(false);
      router.refresh();
    });
  }

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

  // ── Selezione multipla / approvazione in blocco ──────────────────────────
  const approvabile = (s: string) => s === 'bozza' || s === 'inviato';
  const idApprovabili = righe.filter((r) => approvabile(r.stato)).map((r) => r.id);
  const allSelected = idApprovabili.length > 0 && idApprovabili.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (idApprovabili.every((id) => prev.has(id)) ? new Set() : new Set(idApprovabili)));
  }

  function handleApprovaBulk() {
    const ids = [...selected].filter((id) => idApprovabili.includes(id));
    if (ids.length === 0) return;
    setBulkErr(null);
    startBulk(async () => {
      const res = await approvaRapportiniBulk({ rapportinoIds: ids });
      if (!res.ok) {
        setBulkErr(res.error);
        return;
      }
      setSelected(new Set());
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

  // Summary totals
  const totalOrd = righe.reduce((s, r) => s + r.totale.ord, 0);
  const totalStraord = righe.reduce((s, r) => s + r.totale.straord, 0);
  const totalViaggio = righe.reduce((s, r) => s + r.totale.viaggio, 0);

  return (
    <div className="space-y-4">
      {/* Promemoria: giornate rimaste aperte da chiudere */}
      <GiornateApertePanel giorni={giorniAperti} />

      {/* Barra filtri */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
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
            <div className="ml-auto flex items-center gap-2">
              <Button variant="default" size="sm" onClick={openRegistra}>
                <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Registra ore
              </Button>
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
        <>
          {/* Summary line */}
          <div className="flex items-center gap-4 px-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{righe.length}</span> rapportini
            </span>
            <span className="text-border">|</span>
            <span>
              Ord. <span className="tabular-nums font-medium text-foreground">{fmtOre(totalOrd)}</span>
            </span>
            <span>
              Straord. <span className="tabular-nums font-medium text-foreground">{fmtOre(totalStraord)}</span>
            </span>
            <span>
              Viaggio <span className="tabular-nums font-medium text-foreground">{fmtOre(totalViaggio)}</span>
            </span>
          </div>

          {/* Barra azioni in blocco — visibile quando c'è una selezione */}
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary-soft/60 px-4 py-2.5 shadow-soft">
              <span className="text-sm font-medium text-foreground">
                {selected.size} selezionat{selected.size === 1 ? 'o' : 'i'}
              </span>
              <Button size="sm" onClick={handleApprovaBulk} disabled={isBulkPending}>
                {isBulkPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                Approva selezionati
              </Button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Deseleziona
              </button>
              {bulkErr ? <span className="text-xs text-destructive">Errore: {bulkErr}</span> : null}
            </div>
          ) : null}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-9 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={idApprovabili.length === 0}
                          aria-label="Seleziona tutti i rapportini approvabili"
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:opacity-40"
                        />
                      </th>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 font-medium">Dipendente</th>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Stato</th>
                      <th className="px-3 py-2 font-medium" title="Ore ordinarie / straordinarie / viaggio">
                        O / S / V
                      </th>
                      <th className="px-3 py-2 font-medium">Righe</th>
                      <th className="px-3 py-2 font-medium">Inviato</th>
                      <th className="w-48 px-3 py-2" aria-label="Azioni" />
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
                            <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                              {approvabile(riga.stato) ? (
                                <input
                                  type="checkbox"
                                  checked={selected.has(riga.id)}
                                  onChange={() => toggleSelect(riga.id)}
                                  aria-label={`Seleziona rapportino di ${riga.dipendenteNome}`}
                                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                />
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </td>
                            <td className="px-3 py-2 font-medium">{riga.dipendenteNome}</td>
                            <td className="px-3 py-2">
                              <div className="tabular-nums">{fmtData(riga.data)}</div>
                              <div className="mt-0.5">
                                <TimbratureSommario timbrature={riga.timbrature} />
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <RapportinoBadge stato={riga.stato} />
                                {riga.modificato ? (
                                  <span
                                    title="Il tecnico ha modificato il rapportino dopo l'invio"
                                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                                  >
                                    Modificato
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <span>{fmtOre(riga.totale.ord)}</span>
                                <span className="text-border/60">/</span>
                                <span>{fmtOre(riga.totale.straord)}</span>
                                <span className="text-border/60">/</span>
                                <span>{fmtOre(riga.totale.viaggio)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                              {riga.nRighe}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">
                              {riga.inviatoAt ? fmtDataOra(riga.inviatoAt) : <span className="select-none text-muted-foreground/50">·</span>}
                            </td>
                            <td
                              className="px-2 py-2 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {riga.stato !== 'bozza' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setVersioniFor({ id: riga.id, nome: riga.dipendenteNome, data: riga.data })}
                                  >
                                    Cronologia
                                  </Button>
                                )}
                                {approvabile(riga.stato) && (
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
                              <td colSpan={9} className="px-4 py-2 text-xs text-destructive">
                                Errore: {rowErr}
                              </td>
                            </tr>
                          ) : null}

                          {isOpen && (
                            <tr className="border-b border-border bg-muted/20">
                              <td colSpan={9} className="px-6 py-4">
                                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                  {/* Colonna sinistra: righe commessa */}
                                  <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Righe commessa
                                    </p>
                                    {riga.righe.length === 0 ? (
                                      <p className="text-xs text-muted-foreground">Nessuna riga commessa.</p>
                                    ) : (
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-left text-muted-foreground border-b border-border/40">
                                            <th className="pb-1.5 pr-4 font-medium">Commessa / Cantiere</th>
                                            <th className="pb-1.5 pr-3 font-medium text-right">Ord.</th>
                                            <th className="pb-1.5 pr-3 font-medium text-right">Straord.</th>
                                            <th className="pb-1.5 pr-3 font-medium text-right">Viaggio</th>
                                            <th className="pb-1.5 font-medium">Note</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {riga.righe.map((r, j) => (
                                            <tr key={j} className="border-b border-border/30">
                                              <td className="py-1.5 pr-4 font-medium text-foreground">
                                                {r.commessaTitolo}
                                              </td>
                                              <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                {fmtOre(r.ore_ordinarie)}
                                              </td>
                                              <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                {fmtOre(r.ore_straordinarie)}
                                              </td>
                                              <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                {fmtOre(r.ore_viaggio)}
                                              </td>
                                              <td className="py-1.5 text-muted-foreground max-w-[200px] truncate">
                                                {r.note ?? <span className="select-none opacity-40">·</span>}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                    {riga.note ? (
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">Nota rapportino:</span>{' '}
                                        {riga.note}
                                      </p>
                                    ) : null}
                                  </div>

                                  {/* Colonna destra: timeline timbrature */}
                                  <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Timbrature del giorno
                                    </p>
                                    <TimbratureRiepilogo timbrature={riga.timbrature} />
                                  </div>
                                </div>
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
        </>
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

      {/* Dialog Registra ore */}
      <Dialog open={registraOpen} onOpenChange={(open) => { if (!open) setRegistraOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registra ore per dipendente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Dipendente */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
              <select
                value={regDipendenteId}
                onChange={(e) => setRegDipendenteId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleziona dipendente...</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>

            {/* Target: commessa o cantiere */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commessa o cantiere</label>
              <select
                value={regTarget}
                onChange={(e) => setRegTarget(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleziona...</option>
                {commesse.length > 0 && (
                  <optgroup label="Commesse">
                    {commesse.map((c) => (
                      <option key={c.id} value={`k:${c.id}`}>{c.titolo}</option>
                    ))}
                  </optgroup>
                )}
                {cantieri.length > 0 && (
                  <optgroup label="Cantieri">
                    {cantieri.map((k) => (
                      <option key={k.id} value={`c:${k.id}`}>{k.nome}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Data */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <input
                type="date"
                value={regData}
                onChange={(e) => setRegData(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Ore */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore ordinarie</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regOrdinarie}
                  onChange={(e) => setRegOrdinarie(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore viaggio</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regViaggio}
                  onChange={(e) => setRegViaggio(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Straordinari</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regStraordinari}
                  onChange={(e) => setRegStraordinari(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note (opzionale)</label>
              <textarea
                value={regNote}
                onChange={(e) => setRegNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Note aggiuntive..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {regError ? (
              <p className="text-xs text-destructive">{regError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistraOpen(false)} disabled={isRegPending}>
              Annulla
            </Button>
            <Button onClick={handleRegistra} disabled={isRegPending}>
              {isRegPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cronologia versioni */}
      <VersioniDialog rapportino={versioniFor} onClose={() => setVersioniFor(null)} />
    </div>
  );
}
