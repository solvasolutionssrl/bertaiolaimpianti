'use client';

import * as React from 'react';
import { Check, FileText, Paperclip, UploadCloud, X } from 'lucide-react';

/**
 * L'area dove si trascina il documento di un'assenza.
 *
 * Pezzo unico, usato sia dal popup di inserimento sia da quello di modifica:
 * due aree di caricamento con comportamenti diversi nella stessa pagina si
 * notano subito.
 *
 * Quattro stati, e si vedono tutti: ferma, con il file sopra che sta per
 * essere lasciato, con il file scelto, mentre carica (barretta che va e viene,
 * non finge una percentuale) e fatto (il check). Le animazioni sono quelle
 * gia' in casa (`animate-barra-avanzamento`, `animate-success-*`), che si
 * spengono da sole se il sistema chiede meno movimento.
 */

export type FaseDocumento = 'idle' | 'carico' | 'fatto';

const MIME_AMMESSI = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_BYTE = 15 * 1024 * 1024;

export function pesoLeggibile(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

interface Props {
  file: File | null;
  onFile: (f: File | null) => void;
  fase: FaseDocumento;
  /** Nome del documento gia' in archivio, se ce n'e' uno. */
  nomeArchiviato?: string | null;
  /** Tasti accanto al documento archiviato (aprire, scaricare). */
  azioni?: React.ReactNode;
  /**
   * Occupa tutta l'altezza disponibile. Serve quando l'area sta in una colonna
   * accanto a una piu' alta: senza, la colonna finisce a meta' e sotto resta un
   * vuoto che sembra un pezzo mancante.
   */
  riempi?: boolean;
  onErrore: (titolo: string, corpo: string) => void;
}

export function AreaDocumento({
  file,
  onFile,
  fase,
  nomeArchiviato,
  azioni,
  riempi,
  onErrore,
}: Props) {
  const [sopra, setSopra] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /** Si controlla qui quello che il server ricontrolla: l'errore si vede subito. */
  const accetta = (scelto: File | null | undefined) => {
    if (!scelto) return;
    if (scelto.size > MAX_BYTE) {
      onErrore('File troppo grande', `"${scelto.name}" pesa ${pesoLeggibile(scelto.size)}. Il limite è 15 MB.`);
      return;
    }
    if (!MIME_AMMESSI.includes(scelto.type)) {
      onErrore('Formato non ammesso', 'Sono ammessi PDF e immagini.');
      return;
    }
    onFile(scelto);
  };

  const riempiClasse = riempi ? ' h-full justify-center' : '';

  if (fase === 'fatto') {
    return (
      <div
        className={
          'flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-5 text-center' +
          riempiClasse
        }
      >
        <span className="relative flex h-10 w-10 items-center justify-center">
          <span
            className="animate-success-glow absolute inset-[-45%] rounded-full bg-emerald-400/30 blur-xl"
            aria-hidden="true"
          />
          <span
            className="animate-success-ring absolute inset-0 rounded-full bg-emerald-400/40"
            aria-hidden="true"
          />
          <span
            className="animate-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50 [animation-delay:0.16s]"
            aria-hidden="true"
          />
          <span className="animate-success-pop relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-5 w-5" />
          </span>
        </span>
        <span className="text-[13px] font-medium text-emerald-900">Documento archiviato</span>
      </div>
    );
  }

  if (fase === 'carico') {
    return (
      <div
        className={
          'flex flex-col rounded-lg border border-border bg-muted/20 px-3 py-5' + riempiClasse
        }
      >
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {file?.name ?? 'Documento'}
          </span>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-barra-avanzamento rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Caricamento in corso</p>
      </div>
    );
  }

  return (
    <div className={'min-w-0' + (riempi ? ' flex h-full flex-col' : '')}>
      {nomeArchiviato && !file ? (
        <div className="mb-1.5 flex min-w-0 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-emerald-900">
            {nomeArchiviato}
          </span>
          {azioni ? (
            <span className="flex shrink-0 items-center gap-1">{azioni}</span>
          ) : (
            <span className="shrink-0 text-[11px] text-emerald-700">in archivio</span>
          )}
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSopra(true);
        }}
        onDragLeave={() => setSopra(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSopra(false);
          accetta(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={
          'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-all duration-150 ' +
          (riempi ? 'min-h-[9rem] flex-1 justify-center ' : '') +
          (sopra
            ? 'scale-[1.01] border-primary bg-primary/5'
            : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40')
        }
      >
        {file ? (
          <>
            <span className="flex w-full min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">
                {file.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFile(null);
                }}
                aria-label="Togli il documento"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {pesoLeggibile(file.size)} · si carica al salvataggio
            </span>
          </>
        ) : (
          <>
            <UploadCloud
              className={'h-6 w-6 transition-colors ' + (sopra ? 'text-primary' : 'text-muted-foreground')}
            />
            <span className="text-[13px] font-medium text-foreground">
              {nomeArchiviato ? 'Sostituisci il documento' : 'Trascina qui il PDF'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              oppure clicca per sceglierlo · PDF o foto, fino a 15 MB
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => accetta(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
