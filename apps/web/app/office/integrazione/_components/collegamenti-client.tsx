'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Save,
  Search,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import {
  salvaCollegamenti,
  type DatiCollegamenti,
  type EsitoSalvataggio,
  type RigaCollegamento,
} from '../../../_actions/integrazione-collegamenti';
import { NuoveDalGestionale } from './nuove-dal-gestionale';
import { RigaDiProva } from './riga-di-prova';

/**
 * Collegamento delle anagrafiche.
 *
 * Tre principi, in ordine di importanza:
 *
 * 1. **Chi decide e' l'ufficio.** Le proposte automatiche sono ordinate mettendo
 *    davanti quelle che richiedono una decisione: i casi certi si scorrono in
 *    fondo, quelli incerti si guardano subito.
 * 2. **Un abbinamento sbagliato non da' errore.** Manda le ore sulla commessa di
 *    un altro, e sul gestionale non si cancella. Per questo prima di salvare si
 *    ricapitola cosa sta per cambiare.
 * 3. **I duplicati si fermano prima del salvataggio.** Due cantieri sullo stesso
 *    record del gestionale = costi doppi che nessuno nota per mesi.
 */

const FORZA: Record<
  RigaCollegamento['forza'],
  { etichetta: string; classe: string; ordine: number }
> = {
  nessuno: {
    etichetta: 'Da collegare',
    classe: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    ordine: 0,
  },
  debole: {
    etichetta: 'Da verificare',
    classe: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    ordine: 1,
  },
  probabile: {
    etichetta: 'Probabile',
    classe: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    ordine: 2,
  },
  certo: {
    etichetta: 'Sicuro',
    classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    ordine: 3,
  },
  confermato: {
    etichetta: 'Confermato',
    classe: 'bg-muted text-muted-foreground',
    ordine: 4,
  },
};

export function CollegamentiClient({ dati }: { dati: DatiCollegamenti }) {
  const [scelte, setScelte] = React.useState<Map<string, string | null>>(
    () => new Map(dati.righe.map((r) => [r.nostroId, r.externalId])),
  );
  const [q, setQ] = React.useState('');
  const [soloDaFare, setSoloDaFare] = React.useState(false);
  const [conferma, setConferma] = React.useState(false);
  const [esito, setEsito] = React.useState<EsitoSalvataggio | null>(null);
  const [pending, start] = React.useTransition();

  const iniziali = React.useMemo(
    () => new Map(dati.righe.map((r) => [r.nostroId, r.externalId])),
    [dati.righe],
  );

  const cambiate = React.useMemo(
    () => dati.righe.filter((r) => scelte.get(r.nostroId) !== iniziali.get(r.nostroId)),
    [dati.righe, scelte, iniziali],
  );

  // Duplicati calcolati mentre si lavora, non solo al salvataggio: scoprirlo
  // dopo aver sistemato cento righe sarebbe una beffa.
  const duplicati = React.useMemo(() => {
    const per = new Map<string, string[]>();
    for (const [nostroId, ext] of scelte) {
      if (!ext) continue;
      per.set(ext, [...(per.get(ext) ?? []), nostroId]);
    }
    return new Set(
      [...per.entries()].filter(([, v]) => v.length > 1).flatMap(([, v]) => v),
    );
  }, [scelte]);

  const visibili = React.useMemo(() => {
    const parole = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return dati.righe.filter((r) => {
      if (soloDaFare && (r.forza === 'confermato' || r.forza === 'certo')) return false;
      if (parole.length === 0) return true;
      const cercabile = [r.nostroNome, r.nostroCodice, r.nostroCliente, r.externalNome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return parole.every((p) => cercabile.includes(p));
    });
  }, [dati.righe, q, soloDaFare]);

  const daCollegare = dati.righe.filter((r) => !scelte.get(r.nostroId)).length;

  const salva = () => {
    start(async () => {
      const res = await salvaCollegamenti({
        scelte: cambiate.map((r) => ({
          nostroId: r.nostroId,
          externalId: scelte.get(r.nostroId) ?? null,
        })),
      });
      setEsito(res);
      setConferma(false);
      if (res.ok) window.location.reload();
    });
  };

  if (!dati.ok) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{dati.error}</CardContent>
      </Card>
    );
  }

  // Senza dati dal gestionale non c'e' niente da abbinare: dirlo chiaramente
  // invece di mostrare una tabella vuota che sembra un guasto.
  if (dati.esterniTotali === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-center">
          <CircleDashed className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Il gestionale non ha ancora inviato le sue commesse</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Il collegamento con il gestionale deve fare almeno una lettura prima
            che si possa abbinare qualcosa. Finché non succede, questa pagina
            resta vuota.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Riepilogo in cima: quante mancano è il numero che conta. */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className={cn('flex-1', daCollegare > 0 && 'border-amber-500/40')}>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5 text-sm">
            <span>
              <strong className="tabular-nums">{dati.righe.length}</strong> tuoi cantieri
            </span>
            <span className="text-muted-foreground">
              <strong className="tabular-nums">{dati.esterniTotali}</strong> nel gestionale
            </span>
            {daCollegare > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                <strong className="tabular-nums">{daCollegare}</strong> ancora da collegare
                — le loro ore non partono
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                tutti collegati
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <NuoveDalGestionale voci={dati.soloNelGestionale} />

      <RigaDiProva cantieri={dati.collegati} />

      {duplicati.size > 0 ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-start gap-2 p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Lo stesso record del gestionale è scelto per più cantieri (righe in
              rosso). Le ore verrebbero contate due volte: risolvi prima di salvare.
            </span>
          </CardContent>
        </Card>
      ) : null}

      {esito && !esito.ok ? (
        <Card className="border-destructive/50">
          <CardContent className="space-y-1.5 p-3.5 text-sm">
            <p className="font-medium text-destructive">{esito.error}</p>
            {esito.duplicati.map((d) => (
              <p key={d.externalId} className="text-xs text-muted-foreground">
                <code>{d.externalId}</code> → {d.nomi.join(' + ')}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome, codice o cliente…"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">
          <input
            type="checkbox"
            checked={soloDaFare}
            onChange={(e) => setSoloDaFare(e.target.checked)}
            className="h-4 w-4"
          />
          Solo quelli da decidere
        </label>
        <Button
          onClick={() => setConferma(true)}
          disabled={pending || cambiate.length === 0 || duplicati.size > 0}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          Salva{cambiate.length > 0 ? ` (${cambiate.length})` : ''}
        </Button>
      </div>

      {/* Niente altezza fissa: la lista è alta quanto serve e scorre con la
          pagina. Con 190 cantieri un riquadro interno con barra propria
          costringerebbe a due scroll annidati. */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Il tuo cantiere</th>
                  <th className="w-[13%] px-3 py-2 font-medium">Stato</th>
                  <th className="w-[38%] px-3 py-2 font-medium">Nel gestionale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibili.map((r) => {
                  const scelto = scelte.get(r.nostroId) ?? '';
                  const dup = duplicati.has(r.nostroId);
                  const modificata = scelto !== (iniziali.get(r.nostroId) ?? '');
                  return (
                    <tr
                      key={r.nostroId}
                      className={cn(
                        'align-top',
                        dup && 'bg-destructive/5',
                        !dup && modificata && 'bg-primary/5',
                      )}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">{r.nostroNome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[r.nostroCodice, r.nostroCliente].filter(Boolean).join(' · ') ||
                            '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={cn('font-normal', FORZA[r.forza].classe)}>
                          {FORZA[r.forza].etichetta}
                        </Badge>
                        {r.motivo ? (
                          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                            {r.motivo}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={scelto}
                          onChange={(e) =>
                            setScelte((prev) => {
                              const next = new Map(prev);
                              next.set(r.nostroId, e.target.value || null);
                              return next;
                            })
                          }
                          className={cn(
                            'h-9 w-full rounded-md border bg-background px-2 text-sm',
                            dup ? 'border-destructive' : 'border-border',
                          )}
                        >
                          <option value="">— non collegato —</option>
                          {dati.esterni.map((e) => (
                            <option key={e.externalId} value={e.externalId}>
                              {e.etichetta}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {visibili.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">
                      Nessun cantiere corrisponde ai filtri.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Conferma: si ricapitola cosa cambia. Un abbinamento sbagliato manda le
          ore sulla commessa di un altro, e sul gestionale non si cancella. */}
      {conferma ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="max-h-[85vh] w-full max-w-lg overflow-hidden">
            <CardContent className="flex max-h-[85vh] flex-col gap-3 p-5">
              <p className="text-base font-semibold">
                Confermi {cambiate.length}{' '}
                {cambiate.length === 1 ? 'modifica' : 'modifiche'}?
              </p>
              <p className="text-sm text-muted-foreground">
                Da qui in avanti ore, chilometri e spese di questi cantieri verranno
                imputati alla commessa scelta. Un abbinamento sbagliato manda i dati
                sulla commessa di un altro, e sul gestionale non si può correggere.
              </p>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-md border border-border p-2.5">
                {cambiate.map((r) => {
                  const nuovo = scelte.get(r.nostroId);
                  const etichetta = nuovo
                    ? (dati.esterni.find((e) => e.externalId === nuovo)?.etichetta ?? nuovo)
                    : null;
                  return (
                    <p key={r.nostroId} className="text-xs">
                      <strong>{r.nostroNome}</strong> →{' '}
                      {etichetta ? (
                        <span className="text-foreground">{etichetta}</span>
                      ) : (
                        <span className="text-destructive">scollegato</span>
                      )}
                    </p>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConferma(false)} disabled={pending}>
                  Annulla
                </Button>
                <Button onClick={salva} disabled={pending}>
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Sì, salva
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
