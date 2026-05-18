'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  StatoBadge,
} from '@impiantixplus/ui';
import { Download, Tag, UserCheck, Workflow } from 'lucide-react';

import { useBulkSelection } from '../../_components/use-bulk-selection';
import { BulkActionBar } from '../../_components/bulk-action-bar';
import {
  bulkAggiungiTag,
  bulkAssegnaResponsabile,
  bulkCambiaStatoCommessa,
} from '../../_actions/bulk';
import { fmtData } from '../../_lib/format';

export interface CommessaRow {
  id: string;
  codice_interno: string;
  stato: 'bozza' | 'aperta' | 'in_corso' | 'collaudo' | 'completata' | 'archiviata';
  data_apertura: string | null;
  cliente: { id: string; ragione_sociale: string } | null;
  responsabile: { id: string; display_name: string | null } | null;
}

export interface ResponsabileOption {
  id: string;
  display_name: string | null;
}

interface Props {
  rows: CommessaRow[];
  responsabili: ResponsabileOption[];
}

const STATI: Array<{ value: CommessaRow['stato']; label: string }> = [
  { value: 'bozza', label: 'Bozza' },
  { value: 'aperta', label: 'Aperta' },
  { value: 'in_corso', label: 'In corso' },
  { value: 'collaudo', label: 'Collaudo' },
  { value: 'completata', label: 'Completata' },
  { value: 'archiviata', label: 'Archiviata' },
];

type DialogMode = 'stato' | 'responsabile' | 'tag' | null;

export function CommesseListClient({ rows, responsabili }: Props) {
  const router = useRouter();
  const {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    count,
  } = useBulkSelection<CommessaRow>();

  const [dialog, setDialog] = React.useState<DialogMode>(null);
  const [pending, startTransition] = React.useTransition();
  const [feedback, setFeedback] = React.useState<{
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);

  const [selStato, setSelStato] = React.useState<CommessaRow['stato']>('in_corso');
  const [selResp, setSelResp] = React.useState<string>('');
  const [tagValue, setTagValue] = React.useState<string>('');

  React.useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const allIds = React.useMemo(() => rows.map((r) => r.id), [rows]);

  function runAction(
    action: () => Promise<{ ok: boolean; updated?: number; error?: string }>,
    successLabel: string,
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setFeedback({
          kind: 'ok',
          msg: `${successLabel}: ${res.updated ?? 0} commess${(res.updated ?? 0) === 1 ? 'a' : 'e'} aggiornate.`,
        });
        setDialog(null);
        clear();
        router.refresh();
      } else {
        setFeedback({ kind: 'err', msg: res.error ?? 'Errore sconosciuto.' });
      }
    });
  }

  function exportCsv() {
    const selected = rows.filter((r) => isSelected(r.id));
    if (selected.length === 0) return;
    const header = [
      'codice',
      'cliente',
      'stato',
      'data_apertura',
      'responsabile',
    ];
    const escape = (s: unknown) => {
      const v = s == null ? '' : String(s);
      if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [header.join(',')];
    for (const r of selected) {
      lines.push(
        [
          r.codice_interno,
          r.cliente?.ragione_sociale ?? '',
          r.stato,
          r.data_apertura ?? '',
          r.responsabile?.display_name ?? '',
        ]
          .map(escape)
          .join(','),
      );
    }
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `commesse_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const allChecked = isAllSelected(allIds);

  return (
    <>
      {feedback && (
        <div
          role="status"
          className={
            feedback.kind === 'ok'
              ? 'rounded-md border border-stato-completata/30 bg-stato-completata/10 px-3 py-2 text-sm text-foreground'
              : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
          }
        >
          {feedback.msg}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutte"
                      checked={allChecked}
                      onChange={() => toggleAll(allIds)}
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Codice</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Apertura</th>
                  <th className="px-4 py-3 font-medium">Responsabile</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const sel = isSelected(c.id);
                  const baseCls = sel
                    ? 'border-b border-primary/40 bg-primary-soft transition-colors hover:bg-primary-soft'
                    : i % 2 === 0
                      ? 'border-b border-border transition-colors hover:bg-primary-soft/50'
                      : 'border-b border-border bg-muted/20 transition-colors hover:bg-primary-soft/50';
                  return (
                    <tr key={c.id} className={baseCls}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Seleziona commessa ${c.codice_interno}`}
                          checked={sel}
                          onChange={() => toggle(c.id)}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        <Link
                          href={`/office/commesse/${c.id}`}
                          className="text-primary hover:underline"
                        >
                          {c.codice_interno}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {c.cliente?.ragione_sociale ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatoBadge stato={c.stato} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fmtData(c.data_apertura ?? null)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.responsabile?.display_name ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BulkActionBar
        count={count}
        onClear={clear}
        actions={[
          {
            label: 'Cambia stato a…',
            icon: <Workflow className="h-4 w-4" />,
            onClick: () => setDialog('stato'),
          },
          {
            label: 'Assegna responsabile…',
            icon: <UserCheck className="h-4 w-4" />,
            onClick: () => setDialog('responsabile'),
          },
          {
            label: 'Aggiungi tag…',
            icon: <Tag className="h-4 w-4" />,
            onClick: () => setDialog('tag'),
          },
          {
            label: 'Esporta CSV',
            icon: <Download className="h-4 w-4" />,
            onClick: exportCsv,
          },
        ]}
      />

      {/* Dialog: Cambia stato */}
      <Dialog open={dialog === 'stato'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia stato di {count} commesse</DialogTitle>
            <DialogDescription>
              Il nuovo stato verrà applicato a tutte le commesse selezionate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-c-stato">
              Nuovo stato
            </label>
            <select
              id="bulk-c-stato"
              value={selStato}
              onChange={(e) => setSelStato(e.target.value as CommessaRow['stato'])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {STATI.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                runAction(
                  () => bulkCambiaStatoCommessa(selectedIds, selStato),
                  'Stato aggiornato',
                )
              }
            >
              {pending ? 'Aggiorno…' : 'Applica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Assegna responsabile */}
      <Dialog
        open={dialog === 'responsabile'}
        onOpenChange={(v) => !v && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna responsabile a {count} commesse</DialogTitle>
            <DialogDescription>
              Il responsabile verrà applicato a tutte le commesse selezionate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-c-resp">
              Responsabile
            </label>
            <select
              id="bulk-c-resp"
              value={selResp}
              onChange={(e) => setSelResp(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Seleziona utente —</option>
              {responsabili.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ?? u.id}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              disabled={!selResp || pending}
              onClick={() =>
                runAction(
                  () => bulkAssegnaResponsabile(selectedIds, selResp),
                  'Responsabile assegnato',
                )
              }
            >
              {pending ? 'Aggiorno…' : 'Assegna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Aggiungi tag */}
      <Dialog open={dialog === 'tag'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi tag a {count} commesse</DialogTitle>
            <DialogDescription>
              Inserisci un tag breve (max 48 caratteri). Sarà aggiunto a tutte
              le commesse selezionate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-c-tag">
              Tag
            </label>
            <Input
              id="bulk-c-tag"
              value={tagValue}
              maxLength={48}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="es. urgente, da-fatturare"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Annulla
            </Button>
            <Button
              disabled={!tagValue.trim() || pending}
              onClick={() =>
                runAction(
                  () => bulkAggiungiTag(selectedIds, tagValue.trim()),
                  'Tag aggiunto',
                )
              }
            >
              {pending ? 'Aggiungo…' : 'Aggiungi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
