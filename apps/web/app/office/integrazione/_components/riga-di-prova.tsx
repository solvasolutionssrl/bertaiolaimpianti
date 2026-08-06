'use client';

import * as React from 'react';
import { CheckCircle2, FlaskConical, Loader2 } from 'lucide-react';
import { Button, Card, CardContent } from '@kommessa/ui';

import {
  accodaRigaDiProva,
  type EsitoProva,
} from '../../../_actions/integrazione-prova';

export interface CantiereCollegato {
  id: string;
  etichetta: string;
}

/**
 * Collaudo: manda UNA riga costruita apposta.
 *
 * Nasce dal recinto di collaudo dell'agente, che accetta un solo cantiere: la
 * sincronizzazione normale accoderebbe decine di righe e tutte le altre
 * tornerebbero rifiutate, seppellendo l'unica che interessa guardare.
 *
 * L'operazione e' sintetica — 15 minuti, 1 km, 1 euro, con PROVA in testa alla
 * descrizione — e non tocca rapportini, spese o timbrature di nessuno. Sul
 * gestionale si riconosce a colpo d'occhio quando e' ora di cancellarla.
 */
export function RigaDiProva({ cantieri }: { cantieri: CantiereCollegato[] }) {
  const [cantiereId, setCantiereId] = React.useState(cantieri[0]?.id ?? '');
  const [tipo, setTipo] = React.useState<'ore' | 'km' | 'spesa'>('ore');
  const [esito, setEsito] = React.useState<EsitoProva | null>(null);
  const [pending, start] = React.useTransition();

  const manda = () => {
    setEsito(null);
    start(async () => setEsito(await accodaRigaDiProva({ tipo, cantiereId })));
  };

  if (cantieri.length === 0) return null;

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">Collaudo · manda una riga di prova</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Accoda una sola operazione, inventata per la prova: 15 minuti, 1 km o 1 euro,
          con «PROVA» nella descrizione. Non tocca ore, spese o timbrature di nessuno.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1 space-y-1">
            <label htmlFor="prova-cantiere" className="text-xs text-muted-foreground">
              Cantiere (solo quelli già collegati)
            </label>
            <select
              id="prova-cantiere"
              value={cantiereId}
              onChange={(e) => setCantiereId(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {cantieri.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etichetta}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="prova-tipo" className="text-xs text-muted-foreground">
              Cosa
            </label>
            <select
              id="prova-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'ore' | 'km' | 'spesa')}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="ore">Ore (15 min)</option>
              <option value="km">Km (1)</option>
              <option value="spesa">Spesa (1 €)</option>
            </select>
          </div>
          <Button onClick={manda} disabled={pending || !cantiereId} className="gap-1.5">
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Accoda
          </Button>
        </div>

        {esito ? (
          esito.ok ? (
            <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-50 p-2.5 dark:bg-emerald-950/20">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                In coda. Ora tocca al collegamento ritirarla.
              </p>
              <p className="text-xs text-muted-foreground">
                Sul gestionale cerca: <strong>{esito.descrizione}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Commessa <code>{esito.externalId}</code>
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {esito.error}
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
