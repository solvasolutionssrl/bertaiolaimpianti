'use client';

import * as React from 'react';
import { Download, Eye, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
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
import { AreaDocumento, type FaseDocumento } from './area-documento';

/**
 * Il giustificativo di un'assenza gia' registrata: numero dell'attestato e
 * documento del medico.
 *
 * Il gemello di questo popup e' la colonna dentro «Nuova richiesta», che fa la
 * stessa cosa nello stesso gesto che crea l'assenza. Questo serve dopo: per
 * correggere un numero, sostituire il documento o allegarlo quando arriva in
 * ritardo. L'area di caricamento e' la stessa di la', apposta.
 */

const TIPI = [
  { codice: 'P' as const, titolo: 'PUC', descrizione: 'Certificato telematico inviato dal medico.' },
  { codice: 'M' as const, titolo: 'Protocollo', descrizione: 'Certificato consegnato su carta.' },
  { codice: 'C' as const, titolo: 'Codice fiscale', descrizione: 'Ente della donazione di sangue.' },
];

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
  const [fase, setFase] = React.useState<FaseDocumento>('idle');
  const [inCorso, setInCorso] = React.useState(false);

  async function salva() {
    if (numeroObbligatorio && !numero.trim()) {
      await mostraAvviso({
        title: 'Manca il numero',
        body: 'Il numero dell’attestato è obbligatorio per la malattia. Se il certificato è cartaceo, scegli «Protocollo».',
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
      setFase('carico');
      const dati = new FormData();
      dati.set('giustificativoId', res.id);
      dati.set('file', file);
      const caricato = await caricaGiustificativo(dati);
      if (!caricato.ok) {
        setFase('idle');
        setInCorso(false);
        // Il numero è comunque salvato: dirlo evita di ricominciare da capo.
        await mostraAvviso({ title: 'Documento non caricato', body: caricato.error });
        onSalvato();
        return;
      }
      setFase('fatto');
      await new Promise((r) => setTimeout(r, 900));
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

  const urlFile = esistente?.haAllegato ? `/api/personale/giustificativo/${esistente.id}` : null;

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
              Numero{' '}
              {numeroObbligatorio ? (
                <span className="text-rose-600">obbligatorio</span>
              ) : (
                '(facoltativo)'
              )}
            </label>
            <Input
              id="numero-giust"
              value={numero}
              maxLength={30}
              onChange={(e) => setNumero(e.target.value)}
              // Nessun placeholder: il campo accetta un PUC numerico, un
              // protocollo cartaceo o un codice fiscale, e un solo esempio ne
              // farebbe sembrare sbagliati due su tre.
              className="mt-1 h-9 bg-background font-mono shadow-none"
            />
            {numero.trim() ? (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Registrato sull&apos;assenza.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-amber-700">
                {numeroObbligatorio
                  ? 'Obbligatorio per la malattia.'
                  : 'Facoltativo per questo tipo di assenza.'}
              </p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Documento</span>
            <AreaDocumento
              file={file}
              onFile={setFile}
              fase={fase}
              nomeArchiviato={esistente?.haAllegato ? esistente.nomeFile ?? 'Documento archiviato' : null}
              onErrore={(title, body) => void mostraAvviso({ title, body })}
              azioni={
                urlFile ? (
                  <>
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
                  </>
                ) : null
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Il documento resta in archivio.</p>
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
