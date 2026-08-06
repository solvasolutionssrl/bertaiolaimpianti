'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Plus, Search } from 'lucide-react';
import { Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import {
  creaDaGestionale,
  type EsitoCreazione,
  type SoloNelGestionale,
} from '../../../_actions/integrazione-collegamenti';

/**
 * "Nel gestionale ma non da noi": si creano in Kommessa, gia' collegate.
 *
 * Non si creano da sole, e la scelta e' deliberata: un gestionale porta anche
 * anni di commesse chiuse, e importarle tutte allagherebbe l'elenco cantieri di
 * roba morta che poi nessuno ripulisce. Meglio un elenco da spuntare.
 *
 * Il verso e' quello giusto per come lavora il cliente: la commessa **nasce nel
 * gestionale** (li' si fa l'offerta e si apre la posizione), Kommessa la
 * **arricchisce** con quello che il gestionale non ha — mappa, foto, QR,
 * referenti. Da quel momento il cantiere e' nostro e nessun sync lo sovrascrive.
 */
export function NuoveDalGestionale({ voci }: { voci: SoloNelGestionale[] }) {
  const [scelti, setScelti] = React.useState<Set<string>>(() => new Set());
  const [q, setQ] = React.useState('');
  const [conferma, setConferma] = React.useState(false);
  const [esito, setEsito] = React.useState<EsitoCreazione | null>(null);
  const [pending, start] = React.useTransition();

  const visibili = React.useMemo(() => {
    const parole = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parole.length === 0) return voci;
    return voci.filter((v) => {
      const c = [v.nome, v.codice, v.cliente].filter(Boolean).join(' ').toLowerCase();
      return parole.every((p) => c.includes(p));
    });
  }, [voci, q]);

  const crea = () => {
    start(async () => {
      const res = await creaDaGestionale({ externalIds: [...scelti] });
      setEsito(res);
      setConferma(false);
      if (res.ok && res.creati > 0) window.location.reload();
    });
  };

  if (voci.length === 0) return null;

  return (
    <Card className="border-sky-500/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              {voci.length}{' '}
              {voci.length === 1 ? 'commessa presente' : 'commesse presenti'} solo nel
              gestionale
            </p>
            <p className="text-sm text-muted-foreground">
              Puoi crearle qui, già collegate. Da quel momento il cantiere è tuo:
              indirizzo, foto e QR li aggiungi da Kommessa, e nessuna
              sincronizzazione successiva li tocca.
            </p>
          </div>
          <Button
            onClick={() => setConferma(true)}
            disabled={pending || scelti.size === 0}
            className="gap-1.5"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Crea{scelti.size > 0 ? ` (${scelti.size})` : ''}
          </Button>
        </div>

        {esito && !esito.ok ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {esito.error}
          </p>
        ) : null}
        {esito?.ok && esito.saltati.length > 0 ? (
          <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-50 p-2.5 dark:bg-amber-950/20">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {esito.creati} create, {esito.saltati.length} saltate
            </p>
            {esito.saltati.slice(0, 5).map((s) => (
              <p key={s.externalId} className="text-[11px] text-amber-900/80 dark:text-amber-200/80">
                <code>{s.externalId}</code>: {s.motivo}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca…"
              className="pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setScelti((prev) =>
                prev.size === visibili.length
                  ? new Set()
                  : new Set(visibili.map((v) => v.externalId)),
              )
            }
          >
            {scelti.size === visibili.length && visibili.length > 0
              ? 'Deseleziona'
              : 'Seleziona tutte'}
          </Button>
        </div>

        {/* Alta quanto serve, ma con un tetto: con centinaia di voci il resto
            della pagina finirebbe irraggiungibile. */}
        <div className="max-h-[22rem] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {visibili.map((v) => {
            const on = scelti.has(v.externalId);
            return (
              <label
                key={v.externalId}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm',
                  on && 'bg-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setScelti((prev) => {
                      const next = new Set(prev);
                      if (next.has(v.externalId)) next.delete(v.externalId);
                      else next.add(v.externalId);
                      return next;
                    })
                  }
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{v.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[v.codice, v.cliente].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </label>
            );
          })}
          {visibili.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nessun risultato.
            </p>
          ) : null}
        </div>

        {conferma ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
          >
            <Card className="w-full max-w-md">
              <CardContent className="space-y-3 p-5">
                <p className="text-base font-semibold">
                  Creare {scelti.size} {scelti.size === 1 ? 'cantiere' : 'cantieri'}?
                </p>
                <p className="text-sm text-muted-foreground">
                  Prendono il prossimo codice della tua numerazione (CAN-…), con il
                  codice del gestionale a fianco. L’indirizzo resta da completare:
                  li troverai segnati come «da verificare».
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setConferma(false)} disabled={pending}>
                    Annulla
                  </Button>
                  <Button onClick={crea} disabled={pending}>
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Sì, crea
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
