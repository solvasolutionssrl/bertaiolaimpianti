'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Printer, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent } from '@kommessa/ui';
import { useConfirm } from '@/app/_components/confirm-provider';
import { fmtDataOra } from '@/app/office/_lib/format';
import { generaQrCommessa, rigeneraQrCommessa } from '../../../_actions/cantiere-qr';
import type { QrRiga } from '../page';

interface Props {
  righe: QrRiga[];
}

const QR_STATO_CFG = {
  attivo: {
    label: 'Attivo',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  assente: {
    label: 'Non generato',
    dot: 'bg-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
  },
  revocato: {
    label: 'Revocato',
    dot: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  },
} satisfies Record<QrRiga['stato'], { label: string; dot: string; text: string }>;

function StatoQrBadge({ stato }: { stato: QrRiga['stato'] }) {
  const cfg = QR_STATO_CFG[stato];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function QrClient({ righe }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function clearError(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleGenera(id: string) {
    clearError(id);
    setPendingId(id);
    start(async () => {
      const res = await generaQrCommessa({ commessaId: id });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  function handleRigenera(id: string, titolo: string) {
    start(async () => {
      const ok = await confirm({
        title: `Rigenerare il QR di "${titolo}"?`,
        description:
          'Le copie già stampate smetteranno di funzionare. Sarà necessario ristampare e affiggere il nuovo QR.',
        confirmLabel: 'Rigenera',
        destructive: true,
      });
      if (!ok) return;
      clearError(id);
      setPendingId(id);
      const res = await rigeneraQrCommessa({ commessaId: id });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [id]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  if (righe.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna commessa.</p>;
  }

  const totaleAttivi = righe.filter((r) => r.stato === 'attivo').length;
  const totaleScansioni = righe.reduce((acc, r) => acc + r.scansioni, 0);

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <p className="text-xs text-muted-foreground">
        {righe.length} commesse &middot; {totaleAttivi} con QR attivo &middot;{' '}
        {totaleScansioni} scansioni totali
      </p>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Commessa</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Stato</th>
                  <th className="px-4 py-2.5 font-medium tabular-nums">Scansioni</th>
                  <th className="px-4 py-2.5 font-medium">Ultima scansione</th>
                  <th className="w-52 px-4 py-2.5" aria-label="Azioni" />
                </tr>
              </thead>
              <tbody>
                {righe.map((riga, i) => {
                  const isRowPending = pending && pendingId === riga.id;
                  return (
                    <React.Fragment key={riga.id}>
                      <tr
                        className={
                          i % 2 === 0
                            ? 'border-b border-border transition-colors hover:bg-muted/40'
                            : 'border-b border-border bg-muted/20 transition-colors hover:bg-muted/40'
                        }
                      >
                        {/* Commessa: titolo + codice */}
                        <td className="px-4 py-2.5">
                          <span className="font-medium leading-snug">{riga.titolo}</span>
                          {riga.codice ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {riga.codice}
                            </span>
                          ) : null}
                        </td>

                        {/* Tipo: piccolo badge inline */}
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            Commessa
                          </span>
                        </td>

                        {/* Stato */}
                        <td className="px-4 py-2.5">
                          <StatoQrBadge stato={riga.stato} />
                        </td>

                        {/* Scansioni */}
                        <td className="px-4 py-2.5 tabular-nums">
                          {riga.scansioni === 0 ? (
                            <span className="text-muted-foreground">0</span>
                          ) : (
                            <span className="font-medium">{riga.scansioni}</span>
                          )}
                        </td>

                        {/* Ultima scansione */}
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {riga.ultimaScansione ? fmtDataOra(riga.ultimaScansione) : '—'}
                        </td>

                        {/* Azioni */}
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {riga.stato === 'assente' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isRowPending || pending}
                                onClick={() => handleGenera(riga.id)}
                              >
                                {isRowPending ? (
                                  <Loader2
                                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                Genera QR
                              </Button>
                            )}
                            {riga.stato === 'attivo' && (
                              <>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/office/kantiere/qr/${riga.id}/stampa`}>
                                    <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                    Stampa
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRowPending || pending}
                                  onClick={() => handleRigenera(riga.id, riga.titolo)}
                                >
                                  {isRowPending ? (
                                    <Loader2
                                      className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <RefreshCw
                                      className="mr-1.5 h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  )}
                                  Rigenera
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Error row */}
                      {errors[riga.id] ? (
                        <tr className="border-b border-border bg-destructive/5">
                          <td colSpan={6} className="px-4 py-2 text-xs text-destructive">
                            Errore: {errors[riga.id]}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
