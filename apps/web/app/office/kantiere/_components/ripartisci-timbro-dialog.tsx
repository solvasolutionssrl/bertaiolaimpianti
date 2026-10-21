'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';

import { Scelta } from '@/app/_components/scelta';
import { SceltaPausaPranzo } from '@/app/_components/scelta-pausa-pranzo';
import { ripartisciGiornataTimbro } from '@/app/_actions/kantiere-timbra';
import type { TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import { TimbriTerminale } from './timbri-terminale';

const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const fmtGiorno = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtHM = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${String(Math.max(0, min) % 60).padStart(2, '0')}`;

type Riga = { cantiereId: string; minuti: number; inSede: boolean };

/**
 * La versione da scrivania di «riempire la scatola»: l'ufficio dice su quali
 * cantieri ha lavorato una persona che ha timbrato al terminale. Niente «chi
 * guidava» — la strada dalla sede la propone il sistema (da passeggero) per
 * i cantieri segnati «uscito».
 */
export function RipartisciTimbroDialog({
  open,
  onOpenChange,
  giornata,
  cantieri,
  passo = 15,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  giornata: TimbroGiornataVista | null;
  cantieri: { id: string; nome: string; stato?: string | null }[];
  passo?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [righe, setRighe] = React.useState<Riga[]>([]);
  const [pausaMin, setPausaMin] = React.useState(0);
  const [errore, setErrore] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !giornata) return;
    setErrore(null);
    setPausaMin(giornata.pausaTimbrataMin > 0 ? 0 : giornata.nettoMin > 5 * 60 ? 60 : 0);
    setRighe(
      giornata.primoCantiere
        ? [{ cantiereId: giornata.primoCantiere.id, minuti: 0, inSede: false }]
        : [{ cantiereId: '', minuti: 0, inSede: giornata.inizioFisico }],
    );
  }, [open, giornata]);

  if (!giornata) return null;

  const daRipartire = giornata.nettoMin - pausaMin;
  const assegnato = righe.reduce((a, r) => a + r.minuti, 0);
  const resto = daRipartire - assegnato;
  const opzioni = cantieri.map((c) => ({
    valore: c.id,
    etichetta: c.stato === 'chiuso' ? `${c.nome} (chiuso)` : c.nome,
  }));

  function salva() {
    setErrore(null);
    if (righe.some((r) => !r.cantiereId)) return setErrore('Scegli un cantiere per ogni riga.');
    if (righe.slice(0, -1).some((r) => r.minuti <= 0)) return setErrore('Ogni cantiere deve avere delle ore (l’ultimo prende il resto).');
    if (resto < 0) return setErrore(`Le ore superano la presenza timbrata di ${fmtHM(-resto)}.`);
    const split = righe.map((r, i) => ({
      cantiereId: r.cantiereId,
      minuti: i === righe.length - 1 ? r.minuti + Math.max(0, resto) : r.minuti,
      daSede: r.inSede || undefined,
    }));
    startTransition(async () => {
      const res = await ripartisciGiornataTimbro({
        giorno: giornata!.giorno,
        dipendenteId: giornata!.dipendenteId,
        pausaMin,
        split,
      });
      if (!res.ok) {
        setErrore(
          res.error === 'SCATOLA_NON_DISPONIBILE'
            ? 'La giornata è cambiata nel frattempo: ricarica la pagina.'
            : res.error === 'SPLIT_SOMMA' || res.error === 'SPLIT_NETTO'
              ? 'Le ore non tornano con la presenza timbrata (strada compresa).'
              : res.error === 'SEDE_PREDEFINITA_MANCANTE'
                ? 'Manca la sede predefinita: impostala in Sedi.'
                : `Non salvato: ${res.error}`,
        );
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ripartisci la giornata timbrata</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{giornata.dipendenteNome}</span> ·{' '}
            <span className="first-letter:uppercase">{fmtGiorno.format(new Date(`${giornata.giorno}T12:00:00Z`))}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                Timbrato{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {giornata.inizioIso ? fmtOra.format(new Date(giornata.inizioIso)) : '--:--'} →{' '}
                  {giornata.fineIso ? fmtOra.format(new Date(giornata.fineIso)) : '--:--'}
                </span>
                {giornata.pausaTimbrataMin > 0 ? ` · pausa timbrata ${fmtHM(giornata.pausaTimbrataMin)}` : ''}
              </span>
              <span>
                Presenza <span className="font-semibold tabular-nums text-foreground">{fmtHM(giornata.nettoMin)}</span>
              </span>
            </div>
            <div className="mt-1.5">
              <TimbriTerminale timbri={giornata.timbri} />
            </div>
          </div>

          {giornata.pausaTimbrataMin === 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Pausa pranzo non timbrata
              </p>
              <SceltaPausaPranzo valore={pausaMin} onChange={setPausaMin} conNessuna disabled={pending} tono="tenue" />
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cantieri</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {fmtHM(assegnato)} / {fmtHM(Math.max(0, daRipartire))}
                {resto > 0 && righe.length > 0 ? ` · ${fmtHM(resto)} all’ultimo` : ''}
              </p>
            </div>
            {righe.map((r, i) => {
              const bloccata = !!giornata.primoCantiere && i === 0;
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                  {bloccata ? (
                    <span className="truncate text-sm">
                      {giornata.primoCantiere!.nome}{' '}
                      <span className="text-[10px] uppercase text-muted-foreground">turno aperto</span>
                    </span>
                  ) : (
                    <Scelta
                      opzioni={opzioni}
                      valore={r.cantiereId || null}
                      onCambia={(v) => setRighe((p) => p.map((x, j) => (j === i ? { ...x, cantiereId: v ?? '' } : x)))}
                      segnaposto="Cantiere…"
                      disabilitato={pending}
                    />
                  )}
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={!r.inSede}
                      disabled={pending}
                      onChange={(e) => setRighe((p) => p.map((x, j) => (j === i ? { ...x, inSede: !e.target.checked } : x)))}
                    />
                    <Building2 className="h-3 w-3" aria-hidden="true" />
                    uscito
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={passo}
                    value={r.minuti}
                    disabled={pending}
                    onChange={(e) =>
                      setRighe((p) =>
                        p.map((x, j) => (j === i ? { ...x, minuti: Math.max(0, parseInt(e.target.value || '0', 10)) } : x)),
                      )
                    }
                    className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                    aria-label="Minuti"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={pending || bloccata || righe.length === 1}
                    onClick={() => setRighe((p) => p.filter((_, j) => j !== i))}
                    aria-label="Togli"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={pending || righe.length >= 12}
              onClick={() => setRighe((p) => [...p, { cantiereId: '', minuti: 0, inSede: giornata.inizioFisico }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Aggiungi cantiere
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Minuti di lavoro per cantiere. «Uscito» = la persona è andata in cantiere: la strada dalla sede
              si calcola da sola e sta dentro la presenza. Senza la spunta le ore sono del cantiere ma la
              persona era in sede.
            </p>
          </div>

          {errore ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              {errore}
            </p>
          ) : null}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Annulla
          </Button>
          <Button size="sm" onClick={salva} disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Salva le ore
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
