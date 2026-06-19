'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, Printer, RefreshCw, ExternalLink, Clock } from 'lucide-react';
import { Button, Card, CardContent } from '@kommessa/ui';
import { useConfirm } from '@/app/_components/confirm-provider';
import { fmtDataOra } from '@/app/office/_lib/format';
import { generaQrCommessa, rigeneraQrCommessa } from '../../../_actions/cantiere-qr';
import type { QrStorico, CommessaSenzaQr } from '../page';

interface Props {
  attivi: QrStorico[];
  storico: QrStorico[];
  commesseSenzaQr: CommessaSenzaQr[];
}

// ── Badge tipo target ────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: 'commessa' | 'cantiere' }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {tipo === 'commessa' ? 'Commessa' : 'Cantiere'}
    </span>
  );
}

// ── Thead riutilizzabile ─────────────────────────────────────────────────────

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        {cols.map((c, i) => (
          <th key={i} className="px-4 py-2.5 font-medium">
            {c}
          </th>
        ))}
        <th className="w-48 px-4 py-2.5" aria-label="Azioni" />
      </tr>
    </thead>
  );
}

// ── Sezione QR attivi ────────────────────────────────────────────────────────

function SezioneAttivi({
  attivi,
  pending,
  pendingId,
  errors,
  onRigenera,
}: {
  attivi: QrStorico[];
  pending: boolean;
  pendingId: string | null;
  errors: Record<string, string>;
  onRigenera: (id: string, label: string, targetTipo: 'commessa' | 'cantiere', targetId: string) => void;
}) {
  if (attivi.length === 0) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-semibold">QR attivi</h2>
        <p className="text-sm text-muted-foreground">Nessun QR attivo.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">QR attivi</h2>
      <Card className="ring-1 ring-emerald-200 dark:ring-emerald-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <Thead cols={['Target', 'Tipo', 'Scansioni', 'Generato il']} />
              <tbody>
                {attivi.map((row, i) => {
                  const isRowPending = pending && pendingId === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={
                          i % 2 === 0
                            ? 'border-b border-border transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                            : 'border-b border-border bg-emerald-50/20 dark:bg-emerald-950/10 transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                        }
                      >
                        <td className="px-4 py-2.5 font-medium leading-snug">{row.targetLabel}</td>
                        <td className="px-4 py-2.5">
                          <TipoBadge tipo={row.targetTipo} />
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {row.scansioni === 0 ? (
                            <span className="text-muted-foreground">0</span>
                          ) : (
                            <span className="font-medium">{row.scansioni}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {fmtDataOra(row.createdAt)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {row.targetTipo === 'commessa' ? (
                              <>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/office/kantiere/qr/${row.targetId}/stampa`}>
                                    <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                    Stampa
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isRowPending || pending}
                                  onClick={() => onRigenera(row.id, row.targetLabel, row.targetTipo, row.targetId)}
                                >
                                  {isRowPending ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                  )}
                                  Rigenera
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/office/kantiere/cantieri/${row.targetId}/stampa`}>
                                    <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                    Stampa
                                  </Link>
                                </Button>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href={`/office/kantiere/cantieri/${row.targetId}`}>
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                    Apri cantiere
                                  </Link>
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {errors[row.id] ? (
                        <tr className="border-b border-border bg-destructive/5">
                          <td colSpan={5} className="px-4 py-2 text-xs text-destructive">
                            Errore: {errors[row.id]}
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

// ── Sezione commesse senza QR ────────────────────────────────────────────────

function SezioneGeneraQr({
  commesseSenzaQr,
  pending,
  pendingId,
  errors,
  onGenera,
}: {
  commesseSenzaQr: CommessaSenzaQr[];
  pending: boolean;
  pendingId: string | null;
  errors: Record<string, string>;
  onGenera: (id: string) => void;
}) {
  if (commesseSenzaQr.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">
        Commesse senza QR{' '}
        <span className="ml-1 font-normal text-muted-foreground">({commesseSenzaQr.length})</span>
      </h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <Thead cols={['Commessa', 'Codice']} />
              <tbody>
                {commesseSenzaQr.map((c, i) => {
                  const isRowPending = pending && pendingId === c.id;
                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        className={
                          i % 2 === 0
                            ? 'border-b border-border transition-colors hover:bg-muted/40'
                            : 'border-b border-border bg-muted/20 transition-colors hover:bg-muted/40'
                        }
                      >
                        <td className="px-4 py-2.5 font-medium leading-snug">{c.titolo}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {c.codice ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRowPending || pending}
                            onClick={() => onGenera(c.id)}
                          >
                            {isRowPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <QrCode className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Genera QR
                          </Button>
                        </td>
                      </tr>
                      {errors[c.id] ? (
                        <tr className="border-b border-border bg-destructive/5">
                          <td colSpan={3} className="px-4 py-2 text-xs text-destructive">
                            Errore: {errors[c.id]}
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

// ── Sezione storico revocati ─────────────────────────────────────────────────

function SezioneStorico({ storico }: { storico: QrStorico[] }) {
  if (storico.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Storico QR (revocati){' '}
        <span className="font-normal">({storico.length})</span>
      </h2>
      <Card className="opacity-70">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Token</th>
                  <th className="px-4 py-2.5 font-medium">Scansioni</th>
                  <th className="px-4 py-2.5 font-medium">Generato il</th>
                  <th className="px-4 py-2.5 font-medium">Revocato il</th>
                  <th className="px-4 py-2.5 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {storico.map((row, i) => (
                  <tr
                    key={row.id}
                    className={
                      i % 2 === 0
                        ? 'border-b border-border'
                        : 'border-b border-border bg-muted/20'
                    }
                  >
                    <td className="px-4 py-2.5 text-muted-foreground">{row.targetLabel}</td>
                    <td className="px-4 py-2.5">
                      <TipoBadge tipo={row.targetTipo} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {row.tokenMasked}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {row.scansioni}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtDataOra(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {row.revokedAt ? fmtDataOra(row.revokedAt) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Revocato
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Root component ───────────────────────────────────────────────────────────

export function QrClient({ attivi, storico, commesseSenzaQr }: Props) {
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

  function handleGenera(commessaId: string) {
    clearError(commessaId);
    setPendingId(commessaId);
    start(async () => {
      const res = await generaQrCommessa({ commessaId });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [commessaId]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  function handleRigenera(
    _qrId: string,
    label: string,
    targetTipo: 'commessa' | 'cantiere',
    targetId: string,
  ) {
    start(async () => {
      const ok = await confirm({
        title: `Rigenerare il QR di "${label}"?`,
        description:
          'Le copie già stampate smetteranno di funzionare. Sarà necessario ristampare e affiggere il nuovo QR.',
        confirmLabel: 'Rigenera',
        destructive: true,
      });
      if (!ok) return;
      if (targetTipo !== 'commessa') return; // cantieri gestiti nella pagina del cantiere
      clearError(targetId);
      setPendingId(targetId);
      const res = await rigeneraQrCommessa({ commessaId: targetId });
      setPendingId(null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [targetId]: res.error }));
        return;
      }
      router.refresh();
    });
  }

  const totaleAttivi = attivi.length;
  const totaleScansioni =
    [...attivi, ...storico].reduce((acc, r) => acc + r.scansioni, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <p className="text-xs text-muted-foreground">
        {totaleAttivi} QR{totaleAttivi === 1 ? ' attivo' : ' attivi'} &middot;{' '}
        {storico.length} revocati &middot; {totaleScansioni} scansioni totali
      </p>

      <SezioneAttivi
        attivi={attivi}
        pending={pending}
        pendingId={pendingId}
        errors={errors}
        onRigenera={handleRigenera}
      />

      <SezioneGeneraQr
        commesseSenzaQr={commesseSenzaQr}
        pending={pending}
        pendingId={pendingId}
        errors={errors}
        onGenera={handleGenera}
      />

      <SezioneStorico storico={storico} />
    </div>
  );
}
