'use client';

import * as React from 'react';
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Paperclip,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kommessa/ui';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import {
  caricaGiustificativo,
  eliminaGiustificativo,
  salvaGiustificativo,
} from '@/app/office/_actions/ferie-permessi';

/**
 * Il giustificativo di un'assenza: il numero dell'attestato e il documento.
 *
 * Il numero non si inventa mai. Per la malattia e' obbligatorio — senza, il
 * consulente del lavoro non chiude la busta — e allora lo si chiede qui, dove
 * c'e' il certificato davanti, invece di lasciare un campo vuoto che sembra
 * una dimenticanza.
 *
 * Il documento archiviato si **riscarica**: un archivio da cui non si estrae
 * niente non serve a nessuno.
 */

const TIPI = [
  { codice: 'P' as const, titolo: 'PUC', descrizione: 'Certificato telematico del medico. È il caso normale.' },
  { codice: 'M' as const, titolo: 'Protocollo', descrizione: 'Numero di protocollo del certificato cartaceo.' },
  {
    codice: 'C' as const,
    titolo: 'Codice fiscale',
    descrizione: 'Dell’ente, per la donazione di sangue.',
  },
];

const MIME_AMMESSI = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_BYTE = 15 * 1024 * 1024;

export interface GiustificativoEsistente {
  id: string;
  tipoInfo: 'C' | 'P' | 'M';
  numero: string | null;
  nota: string | null;
  nomeFile: string | null;
  sizeBytes: number | null;
  haAllegato: boolean;
}

interface Props {
  permessoId: string;
  dipendenteNome: string;
  tipoLabel: string;
  periodo: string;
  /** Per la malattia il numero è obbligatorio: lo decide il tipo di assenza. */
  numeroObbligatorio: boolean;
  esistente: GiustificativoEsistente | null;
  onChiudi: () => void;
  onSalvato: () => void;
}

function pesoLeggibile(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function GiustificativoDialog({
  permessoId,
  dipendenteNome,
  tipoLabel,
  periodo,
  numeroObbligatorio,
  esistente,
  onChiudi,
  onSalvato,
}: Props) {
  const mostraAvviso = useAlert();
  const chiediConferma = useConfirm();
  const [tipoInfo, setTipoInfo] = React.useState<'C' | 'P' | 'M'>(esistente?.tipoInfo ?? 'P');
  const [numero, setNumero] = React.useState(esistente?.numero ?? '');
  const [nota, setNota] = React.useState(esistente?.nota ?? '');
  const [file, setFile] = React.useState<File | null>(null);
  const [sopra, setSopra] = React.useState(false);
  const [inCorso, setInCorso] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const numeroMancante = numeroObbligatorio && !numero.trim();

  /** Controlla qui quello che il server ricontrolla: l'errore si vede subito. */
  const accetta = React.useCallback(
    async (scelto: File | null | undefined) => {
      if (!scelto) return;
      if (scelto.size > MAX_BYTE) {
        await mostraAvviso({
          title: 'File troppo grande',
          body: `"${scelto.name}" pesa ${pesoLeggibile(scelto.size)}. Il limite è 15 MB.`,
        });
        return;
      }
      if (!MIME_AMMESSI.includes(scelto.type)) {
        await mostraAvviso({
          title: 'Formato non ammesso',
          body: 'Si può allegare un PDF o una foto del certificato.',
        });
        return;
      }
      setFile(scelto);
    },
    [mostraAvviso],
  );

  async function salva() {
    if (numeroMancante) {
      await mostraAvviso({
        title: 'Manca il numero',
        body: 'Per la malattia il numero dell’attestato è obbligatorio. Se il certificato è cartaceo, scegli «Protocollo».',
      });
      return;
    }
    setInCorso(true);
    const res = await salvaGiustificativo({
      permessoId,
      tipoInfo,
      numero: numero.trim() || null,
      nota: nota.trim() || null,
    });
    if (!res.ok) {
      setInCorso(false);
      await mostraAvviso({ title: 'Non salvato', body: res.error });
      return;
    }

    if (file) {
      const dati = new FormData();
      dati.set('giustificativoId', res.id);
      dati.set('file', file);
      const caricato = await caricaGiustificativo(dati);
      if (!caricato.ok) {
        setInCorso(false);
        // Il numero è comunque salvato: dirlo evita che si ricominci da capo.
        await mostraAvviso({ title: 'Numero salvato, documento no', body: caricato.error });
        onSalvato();
        return;
      }
    }

    setInCorso(false);
    onSalvato();
  }

  async function rimuovi() {
    if (!esistente) return;
    const ok = await chiediConferma({
      title: 'Eliminare il giustificativo?',
      description: 'Vengono tolti il numero e il documento archiviato. L’assenza resta.',
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const res = await eliminaGiustificativo(esistente.id);
    setInCorso(false);
    if (!res.ok) await mostraAvviso({ title: 'Non eliminato', body: res.error });
    else onSalvato();
  }

  const urlFile = esistente ? `/api/personale/giustificativo/${esistente.id}` : null;

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onChiudi())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Giustificativo</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px]">
            <span className="font-medium text-foreground">{dipendenteNome}</span>
            <span className="text-muted-foreground">{tipoLabel}</span>
            <span className="text-muted-foreground">{periodo}</span>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Tipo di numero</span>
            <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {TIPI.map((t) => (
                <button
                  key={t.codice}
                  type="button"
                  onClick={() => setTipoInfo(t.codice)}
                  className={
                    tipoInfo === t.codice
                      ? 'rounded-md bg-primary px-2.5 py-2 text-left text-primary-foreground'
                      : 'rounded-md border border-border bg-card px-2.5 py-2 text-left hover:border-primary/40'
                  }
                >
                  <span className="block text-[13px] font-semibold">{t.titolo}</span>
                  <span
                    className={`mt-0.5 block text-[11px] leading-snug ${
                      tipoInfo === t.codice ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {t.descrizione}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="numero-giust">
              Numero {numeroObbligatorio ? <span className="text-rose-600">obbligatorio</span> : '(se c’è)'}
            </label>
            <Input
              id="numero-giust"
              value={numero}
              maxLength={30}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Come sta sul certificato"
              className="mt-1 h-9 bg-background font-mono shadow-none"
            />
            {numero.trim() ? (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Finirà nel file per il consulente, accanto al periodo di assenza.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-amber-700">
                {numeroObbligatorio
                  ? 'Senza numero il consulente deve inseguirlo a mano. Leggilo sul certificato: non va inventato.'
                  : 'Facoltativo per questo tipo di assenza.'}
              </p>
            )}
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Documento</span>

            {esistente?.haAllegato && !file ? (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-emerald-900">
                  {esistente.nomeFile ?? 'Documento archiviato'}
                  {esistente.sizeBytes ? (
                    <span className="ml-1.5 text-emerald-700">{pesoLeggibile(esistente.sizeBytes)}</span>
                  ) : null}
                </span>
                {urlFile ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <a
                      href={`${urlFile}?vista=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      <Eye className="h-3.5 w-3.5" /> Apri
                    </a>
                    <a
                      href={urlFile}
                      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                    >
                      <Download className="h-3.5 w-3.5" /> Scarica
                    </a>
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* L'area di caricamento: si trascina il file o si sceglie. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSopra(true);
              }}
              onDragLeave={() => setSopra(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSopra(false);
                void accetta(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={
                'mt-1.5 flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition ' +
                (sopra
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40')
              }
            >
              {file ? (
                <>
                  <Paperclip className="h-5 w-5 text-primary" />
                  <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-foreground">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {pesoLeggibile(file.size)} · si carica al salvataggio
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud
                    className={'h-6 w-6 ' + (sopra ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <span className="text-[13px] font-medium text-foreground">
                    {esistente?.haAllegato ? 'Sostituisci il documento' : 'Trascina qui il certificato'}
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
                onChange={(e) => void accetta(e.target.files?.[0])}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Resta in archivio, non viene mandato a nessuno.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="nota-giust">
              Nota interna
            </label>
            <Input
              id="nota-giust"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="mt-1 h-9 bg-background shadow-none"
            />
          </div>
        </div>

        <DialogFooter>
          {esistente ? (
            <Button
              variant="outline"
              size="sm"
              className="mr-auto text-rose-600"
              onClick={rimuovi}
              disabled={inCorso}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Elimina
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </Button>
          <Button size="sm" onClick={salva} disabled={inCorso}>
            {inCorso ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {file ? 'Salva e carica' : 'Salva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
