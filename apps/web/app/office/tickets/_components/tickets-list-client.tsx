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
} from '@impiantixplus/ui';
import { Download, Flag, UserCheck, Workflow } from 'lucide-react';

import { SlaBadge, isSlaAlerting, type SlaStatus } from './sla-badge';
import { useBulkSelection } from '../../_components/use-bulk-selection';
import { BulkActionBar } from '../../_components/bulk-action-bar';
import {
  bulkAssegna,
  bulkCambiaStato,
  bulkCambiaPriorita,
} from '../../_actions/bulk';
import { fmtDataOra } from '../../_lib/format';

export interface TicketRow {
  id: string;
  codice: string;
  oggetto: string;
  stato: 'aperto' | 'in_lavorazione' | 'attesa_cliente' | 'chiuso';
  priorita: 'bassa' | 'media' | 'alta' | 'urgente';
  source: string;
  created_at: string;
  sla_status: SlaStatus;
  cliente: { id: string; ragione_sociale: string } | null;
  assegnato: { id: string; display_name: string } | null;
}

export interface StaffUser {
  id: string;
  display_name: string | null;
}

interface Props {
  rows: TicketRow[];
  staff: StaffUser[];
}

const STATI: Array<{ value: TicketRow['stato']; label: string }> = [
  { value: 'aperto', label: 'Aperto' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'attesa_cliente', label: 'Attesa cliente' },
  { value: 'chiuso', label: 'Chiuso' },
];

const PRIORITA: Array<{ value: TicketRow['priorita']; label: string }> = [
  { value: 'bassa', label: 'Bassa' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const SOURCES_LABEL: Record<string, string> = {
  manual: 'Manuale',
  email: 'Email',
  portal_cliente: 'Portale cliente',
  imported_from_freshdesk: 'Freshdesk (legacy)',
};

const PRIORITY_COLORS: Record<string, string> = {
  bassa: 'text-muted-foreground',
  media: 'text-foreground',
  alta: 'text-stato-collaudo',
  urgente: 'text-stato-critica font-semibold',
};

type DialogMode = 'assegna' | 'stato' | 'priorita' | null;

export function TicketsListClient({ rows, staff }: Props) {
  const router = useRouter();
  const {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    count,
  } = useBulkSelection<TicketRow>();

  const [dialog, setDialog] = React.useState<DialogMode>(null);
  const [pending, startTransition] = React.useTransition();
  const [feedback, setFeedback] = React.useState<{
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);

  // form state per le dialog
  const [selUser, setSelUser] = React.useState<string>('');
  const [selStato, setSelStato] = React.useState<TicketRow['stato']>('in_lavorazione');
  const [selPriorita, setSelPriorita] = React.useState<TicketRow['priorita']>('media');

  React.useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const allIds = React.useMemo(() => rows.map((r) => r.id), [rows]);

  function runAction(action: () => Promise<{ ok: boolean; updated?: number; error?: string }>, successLabel: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setFeedback({
          kind: 'ok',
          msg: `${successLabel}: ${res.updated ?? 0} ticket aggiornati.`,
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
      'oggetto',
      'cliente',
      'stato',
      'priorita',
      'sla_status',
      'origine',
      'creato_il',
      'assegnato_a',
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
          r.codice,
          r.oggetto,
          r.cliente?.ragione_sociale ?? '',
          labelStato(r.stato),
          labelPriorita(r.priorita),
          r.sla_status,
          SOURCES_LABEL[r.source] ?? r.source,
          r.created_at,
          r.assegnato?.display_name ?? '',
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
    a.download = `tickets_${ts}.csv`;
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
                      aria-label="Seleziona tutti"
                      checked={allChecked}
                      onChange={() => toggleAll(allIds)}
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Codice</th>
                  <th className="px-4 py-3 font-medium">Oggetto</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Priorità</th>
                  <th className="px-4 py-3 font-medium">SLA</th>
                  <th className="px-4 py-3 font-medium">Origine</th>
                  <th className="px-4 py-3 font-medium">Creato</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const alert = isSlaAlerting(t.sla_status);
                  const sel = isSelected(t.id);
                  const baseCls = sel
                    ? 'border-b border-primary/40 bg-primary-soft transition-colors hover:bg-primary-soft'
                    : alert
                      ? 'border-b border-border bg-accent/5 transition-colors hover:bg-primary-soft/50'
                      : i % 2 === 0
                        ? 'border-b border-border transition-colors hover:bg-primary-soft/50'
                        : 'border-b border-border bg-muted/20 transition-colors hover:bg-primary-soft/50';
                  return (
                    <tr key={t.id} className={baseCls}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Seleziona ticket ${t.codice}`}
                          checked={sel}
                          onChange={() => toggle(t.id)}
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium">
                        <Link href={`/office/tickets/${t.id}`} className="text-primary hover:underline">
                          {t.codice}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">{t.oggetto}</td>
                      <td className="px-4 py-3">{t.cliente?.ragione_sociale ?? '—'}</td>
                      <td className="px-4 py-3">{labelStato(t.stato)}</td>
                      <td className={`px-4 py-3 ${PRIORITY_COLORS[t.priorita] ?? ''}`}>
                        {labelPriorita(t.priorita)}
                      </td>
                      <td className="px-4 py-3">
                        <SlaBadge status={t.sla_status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {SOURCES_LABEL[t.source] ?? t.source}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtDataOra(t.created_at)}
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
            label: 'Assegna a…',
            icon: <UserCheck className="h-4 w-4" />,
            onClick: () => setDialog('assegna'),
          },
          {
            label: 'Cambia stato a…',
            icon: <Workflow className="h-4 w-4" />,
            onClick: () => setDialog('stato'),
          },
          {
            label: 'Cambia priorità a…',
            icon: <Flag className="h-4 w-4" />,
            onClick: () => setDialog('priorita'),
          },
          {
            label: 'Esporta CSV',
            icon: <Download className="h-4 w-4" />,
            onClick: exportCsv,
          },
        ]}
      />

      {/* Dialog: Assegna */}
      <Dialog open={dialog === 'assegna'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna {count} ticket</DialogTitle>
            <DialogDescription>
              Scegli un membro dello staff a cui assegnare i ticket selezionati.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-user">
              Destinatario
            </label>
            <select
              id="bulk-user"
              value={selUser}
              onChange={(e) => setSelUser(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Seleziona utente —</option>
              {staff.map((u) => (
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
              disabled={!selUser || pending}
              onClick={() =>
                runAction(() => bulkAssegna(selectedIds, selUser), 'Assegnazione completata')
              }
            >
              {pending ? 'Aggiorno…' : 'Assegna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cambia stato */}
      <Dialog open={dialog === 'stato'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia stato di {count} ticket</DialogTitle>
            <DialogDescription>
              Il nuovo stato verrà applicato a tutti i ticket selezionati.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-stato">
              Nuovo stato
            </label>
            <select
              id="bulk-stato"
              value={selStato}
              onChange={(e) => setSelStato(e.target.value as TicketRow['stato'])}
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
                runAction(() => bulkCambiaStato(selectedIds, selStato), 'Stato aggiornato')
              }
            >
              {pending ? 'Aggiorno…' : 'Applica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cambia priorità */}
      <Dialog open={dialog === 'priorita'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambia priorità di {count} ticket</DialogTitle>
            <DialogDescription>
              I target SLA verranno ricalcolati per ciascun ticket secondo la
              policy del tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="bulk-priorita">
              Nuova priorità
            </label>
            <select
              id="bulk-priorita"
              value={selPriorita}
              onChange={(e) => setSelPriorita(e.target.value as TicketRow['priorita'])}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {PRIORITA.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
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
                  () => bulkCambiaPriorita(selectedIds, selPriorita),
                  'Priorità aggiornata',
                )
              }
            >
              {pending ? 'Aggiorno…' : 'Applica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function labelStato(s: string) {
  return STATI.find((x) => x.value === s)?.label ?? s;
}
function labelPriorita(s: string) {
  return PRIORITA.find((x) => x.value === s)?.label ?? s;
}
