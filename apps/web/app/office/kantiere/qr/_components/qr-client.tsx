'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Printer, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import { useConfirm } from '@/app/_components/confirm-provider';
import { generaQrCommessa, rigeneraQrCommessa } from '../../../_actions/cantiere-qr';
import type { QrRiga } from '../page';

interface Props {
  righe: QrRiga[];
}

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function StatoQrBadge({ stato, createdAt }: { stato: QrRiga['stato']; createdAt: string | null }) {
  if (stato === 'attivo') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Attivo
        {createdAt ? (
          <span className="text-muted-foreground font-normal">
            dal {fmtData(createdAt)}
          </span>
        ) : null}
      </span>
    );
  }
  if (stato === 'revocato') {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Revocato
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      Assente
    </Badge>
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
          'Le copie gia stampate smetteranno di funzionare.',
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
    return (
      <p className="text-sm text-muted-foreground">
        Nessuna commessa trovata per questo tenant.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Commessa</th>
                <th className="px-4 py-3 font-medium">Codice</th>
                <th className="px-4 py-3 font-medium">Stato QR</th>
                <th className="w-52 px-4 py-3" aria-label="Azioni" />
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
                          ? 'border-b border-border transition-colors hover:bg-primary-soft/50'
                          : 'border-b border-border bg-muted/20 transition-colors hover:bg-primary-soft/50'
                      }
                    >
                      <td className="px-4 py-3 font-medium">{riga.titolo}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {riga.codice ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatoQrBadge stato={riga.stato} createdAt={riga.createdAt} />
                      </td>
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
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              Genera QR
                            </Button>
                          )}
                          {riga.stato === 'attivo' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                              >
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
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                Rigenera
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {errors[riga.id] ? (
                      <tr className="border-b border-border bg-destructive/5">
                        <td colSpan={4} className="px-4 py-2 text-xs text-destructive">
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
  );
}
