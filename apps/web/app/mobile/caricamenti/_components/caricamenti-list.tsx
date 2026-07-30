'use client';

import * as React from 'react';
import { CheckCircle2, CloudOff, RotateCw, UploadCloud } from 'lucide-react';
import { Button } from '@kommessa/ui';

import { useUploadQueue } from '../../../_components/upload-queue-provider';
import {
  UploadJobRow,
  formattaByte,
} from '../../../_components/upload-job-row';

/**
 * Elenco completo dei caricamenti, raggruppato per significato:
 *  1. **Riprendo** (ambra) — file di una sessione precedente o in ritentativo;
 *  2. **In corso** (blu) — file aggiunti adesso;
 *  3. **Da riprovare** (rosso) — tentativi esauriti, serve un tocco;
 *  4. **Completati** (verde) — cronologia breve della sessione.
 */
export function CaricamentiList() {
  const { jobs, cancel, retry, remove } = useUploadQueue();

  const ripresi = jobs.filter(
    (j) =>
      (j.ripreso || j.attempt > 0) &&
      j.status !== 'done' &&
      j.status !== 'failed' &&
      j.status !== 'canceled',
  );
  const nuovi = jobs.filter(
    (j) =>
      !j.ripreso &&
      j.attempt === 0 &&
      (j.status === 'queued' ||
        j.status === 'init' ||
        j.status === 'uploading' ||
        j.status === 'finalizing'),
  );
  const falliti = jobs.filter((j) => j.status === 'failed');
  const fatti = jobs.filter((j) => j.status === 'done');

  const daFare = ripresi.length + nuovi.length + falliti.length;
  const bytesDaFare = [...ripresi, ...nuovi, ...falliti].reduce(
    (acc, j) => acc + Math.max(0, j.bytesTotal - j.bytesUploaded),
    0,
  );

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">Non c&apos;è niente in sospeso</p>
        <p className="max-w-[26ch] text-xs text-muted-foreground">
          Tutte le foto e i video che hai aggiunto sono già arrivati.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {daFare > 0 ? (
        <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
          <p className="text-sm font-semibold">
            {daFare} file da completare
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formattaByte(bytesDaFare)} ancora da mandare. Vanno avanti da soli
            mentre usi l&apos;app, e riprendono se la chiudi.
          </p>
          {falliti.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2.5 min-h-[40px] w-full"
              onClick={() => falliti.forEach((j) => retry(j.id))}
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Riprova i {falliti.length} falliti
            </Button>
          ) : null}
        </div>
      ) : null}

      <Gruppo
        titolo="Riprendo"
        sottotitolo="Rimasti indietro: li sto finendo"
        icona={<RotateCw className="h-3.5 w-3.5" aria-hidden="true" />}
        jobs={ripresi}
        cancel={cancel}
        retry={retry}
        remove={remove}
      />
      <Gruppo
        titolo="In corso"
        sottotitolo="Aggiunti adesso"
        icona={<UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />}
        jobs={nuovi}
        cancel={cancel}
        retry={retry}
        remove={remove}
      />
      <Gruppo
        titolo="Da riprovare"
        sottotitolo="Tentativi esauriti"
        icona={<CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
        jobs={falliti}
        cancel={cancel}
        retry={retry}
        remove={remove}
      />
      <Gruppo
        titolo="Completati"
        icona={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
        jobs={fatti}
        cancel={cancel}
        retry={retry}
        remove={remove}
      />
    </div>
  );
}

function Gruppo({
  titolo,
  sottotitolo,
  icona,
  jobs,
  cancel,
  retry,
  remove,
}: {
  titolo: string;
  sottotitolo?: string;
  icona: React.ReactNode;
  jobs: ReturnType<typeof useUploadQueue>['jobs'];
  cancel: (id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header className="flex items-baseline gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
        <span className="text-muted-foreground">{icona}</span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em]">
          {titolo}
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {jobs.length}
        </span>
        {sottotitolo ? (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">
            {sottotitolo}
          </span>
        ) : null}
      </header>
      <ul className="divide-y divide-border">
        {jobs.map((job) => (
          <UploadJobRow
            key={job.id}
            job={job}
            onCancel={() => cancel(job.id)}
            onRetry={() => retry(job.id)}
            onRemove={() => remove(job.id)}
          />
        ))}
      </ul>
    </section>
  );
}
