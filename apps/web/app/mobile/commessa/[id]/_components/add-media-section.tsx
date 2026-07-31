'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';

import {
  MediaAttachSection,
  type MediaFile,
} from '../../../../office/commesse/nuova/_components/media-attach-section';
import { useUploadQueue } from '../../../../_components/upload-queue-provider';
import { preparaMedia } from '../../../../_lib/prepara-media';

interface Props {
  commessaId: string;
}

/**
 * Aggiunta media a una commessa esistente (tab Media mobile).
 *
 * Carica SUBITO appena selezioni: i file finiscono nella UploadQueue globale
 * (upload in background, persistito su IndexedDB → sopravvive a cambio pagina
 * e refresh). Niente più tasto "Carica" da premere: prima il cliente
 * selezionava e dimenticava di confermare, perdendo la roba. Lo stato lo
 * mostra il pannello upload in basso; quando un file finisce ricarichiamo la
 * pagina così compare nella griglia.
 */
function toAllegatoKind(k: MediaFile['kind']): 'foto' | 'video' | 'pdf_acquisito' {
  if (k === 'video') return 'video';
  if (k === 'pdf') return 'pdf_acquisito';
  return 'foto';
}

export function AddMediaSection({ commessaId }: Props) {
  const queue = useUploadQueue();
  const router = useRouter();

  // Lista transitoria: appena un file viene selezionato lo accodiamo e
  // svuotiamo la lista (il progresso è nel pannello in basso).
  const [files, setFiles] = React.useState<MediaFile[]>([]);
  const enqueuedIdsRef = React.useRef<Set<string>>(new Set()); // MediaFile.id
  const jobIdsRef = React.useRef<Set<string>>(new Set()); // job accodati da qui
  const doneJobIdsRef = React.useRef<Set<string>>(new Set());
  const [inviati, setInviati] = React.useState(0);
  const [caricati, setCaricati] = React.useState(0);

  const handleChange = async (next: MediaFile[]) => {
    const daAccodare = next.filter((f) => !enqueuedIdsRef.current.has(f.id));
    // Svuota subito: i file sono ora "presi in carico" (la coda mostra il
    // progresso nel pannello in basso).
    setFiles([]);
    if (daAccodare.length === 0) return;
    daAccodare.forEach((f) => enqueuedIdsRef.current.add(f.id));
    setInviati((n) => n + daAccodare.length);

    const accoda = (f: MediaFile, blob: Blob | File) => {
      const jobId = queue.enqueue({
        fileBlob: blob,
        fileName: (blob as File).name || f.file.name,
        fileMime: blob.type || f.file.type || 'application/octet-stream',
        fileSize: blob.size,
        commessaId,
        momento: 'sopralluogo',
        kind: toAllegatoKind(f.kind),
        takenAtIso: f.takenAt ? f.takenAt.toISOString() : null,
      });
      jobIdsRef.current.add(jobId);
    };

    // PRIMA video e PDF, che non passano da nessuna preparazione: partono
    // all'istante. Poi le foto — che dal 31/07/2026 salgono a piena qualità,
    // quindi anche loro senza attesa salvo il caso raro del file enorme
    // (vedi `preparaMedia`).
    for (const f of daAccodare.filter((x) => x.kind !== 'image')) {
      accoda(f, f.file);
    }
    for (const f of daAccodare.filter((x) => x.kind === 'image')) {
      accoda(f, await preparaMedia(f.file, 'image'));
    }
  };

  // Quando un nostro job arriva a 'done': conta + ricarica (la griglia Media
  // mostra il nuovo file).
  React.useEffect(() => {
    let nuoviDone = false;
    for (const job of queue.jobs) {
      if (
        jobIdsRef.current.has(job.id) &&
        job.status === 'done' &&
        !doneJobIdsRef.current.has(job.id)
      ) {
        doneJobIdsRef.current.add(job.id);
        setCaricati((n) => n + 1);
        nuoviDone = true;
      }
    }
    if (nuoviDone) router.refresh();
  }, [queue.jobs, router]);

  const inCorso = Math.max(0, inviati - caricati);

  return (
    <div className="space-y-3">
      <MediaAttachSection files={files} onChange={handleChange} />

      {inviati > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          {inCorso > 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin"
                aria-hidden="true"
              />
              <span>
                {inCorso} in caricamento… puoi continuare, lo stato è nel
                pannello in basso.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{caricati} file caricati</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
