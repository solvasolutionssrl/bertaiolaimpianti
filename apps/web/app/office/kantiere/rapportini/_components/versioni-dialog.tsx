'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@kommessa/ui';
import { fmtData, fmtDataOra } from '@/app/office/_lib/format';
import {
  versioniRapportino,
  type VersioneRapportino,
} from '../../../_actions/kantiere-rapportini';

const AZIONE_LABEL: Record<string, string> = {
  invio: 'Inviato dal tecnico',
  modifica_tecnico: 'Modificato dal tecnico',
  modifica_ufficio: 'Modificato dall’ufficio',
  approvazione: 'Approvato',
  respinta: 'Respinto',
  riapertura: 'Riaperto',
};

function fmtOre(n: number | undefined): string {
  const totMin = Math.max(0, Math.round((n ?? 0) * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

export function VersioniDialog({
  rapportino,
  onClose,
}: {
  rapportino: { id: string; nome: string; data: string } | null;
  onClose: () => void;
}) {
  const [versioni, setVersioni] = React.useState<VersioneRapportino[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!rapportino) {
      setVersioni(null);
      setErr(null);
      return;
    }
    let attivo = true;
    setLoading(true);
    setErr(null);
    versioniRapportino({ rapportinoId: rapportino.id })
      .then((res) => {
        if (!attivo) return;
        if (res.ok) setVersioni(res.versioni);
        else setErr(res.error);
      })
      .catch((e) => attivo && setErr((e as Error).message))
      .finally(() => attivo && setLoading(false));
    return () => {
      attivo = false;
    };
  }, [rapportino]);

  return (
    <Dialog open={!!rapportino} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Cronologia rapportino
            {rapportino ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {rapportino.nome} · {fmtData(rapportino.data)}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : err ? (
          <p className="py-6 text-center text-sm text-destructive">{err}</p>
        ) : !versioni || versioni.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessuna versione registrata per questo rapportino.
          </p>
        ) : (
          <ol className="space-y-2">
            {versioni.map((v) => {
              const t = v.snapshot?.totali;
              const prima = v.azione === 'invio';
              return (
                <li
                  key={v.versione}
                  className={[
                    'rounded-lg border px-3 py-2.5',
                    prima ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {AZIONE_LABEL[v.azione] ?? v.azione}
                      {prima ? (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Prima versione
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDataOra(v.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{v.modificato_da_nome ?? 'n.d.'}</span>
                    {t ? (
                      <span className="tabular-nums">
                        Ord {fmtOre(t.ore_ordinarie)} · Straord {fmtOre(t.ore_straordinarie)} · Viaggio{' '}
                        {fmtOre(t.ore_viaggio)}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
