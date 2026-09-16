'use client';

import * as React from 'react';
import { FileUp, Loader2, Paperclip, ShieldCheck, Trash2 } from 'lucide-react';
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
  caricaAllegatoCertificato,
  eliminaCertificato,
  salvaCertificato,
} from '@/app/office/_actions/paghe';
import type { CertificatoMese, DipendenteMese } from '../_lib/dati-mese';

/**
 * L'attestato di malattia: il numero che il tracciato chiede e il documento
 * del medico.
 *
 * Il numero non si inventa mai. Se non c'e', il file esce lo stesso e lo Studio
 * lo inserisce a mano: qui lo si dice chiaramente invece di lasciare un campo
 * vuoto che sembra una dimenticanza.
 */

const TIPI = [
  {
    codice: 'P' as const,
    titolo: 'PUC',
    descrizione: 'Numero del certificato telematico inviato dal medico. E' + "' il caso normale.",
  },
  {
    codice: 'M' as const,
    titolo: 'Protocollo cartaceo',
    descrizione: 'Numero di protocollo quando il certificato e' + "' stato consegnato su carta.",
  },
  {
    codice: 'C' as const,
    titolo: 'Codice fiscale',
    descrizione: "Codice fiscale dell'ente, si usa per la donazione di sangue.",
  },
];

export interface CertificatoDialogProps {
  dipendente: DipendenteMese;
  dal: string;
  al: string;
  esistente: CertificatoMese | null;
  onChiudi: () => void;
  onSalvato: () => void;
}

export function CertificatoDialog({
  dipendente,
  dal,
  al,
  esistente,
  onChiudi,
  onSalvato,
}: CertificatoDialogProps) {
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [tipoInfo, setTipoInfo] = React.useState<'C' | 'P' | 'M'>(esistente?.tipoInfo ?? 'P');
  const [numero, setNumero] = React.useState(esistente?.numero ?? '');
  const [nota, setNota] = React.useState(esistente?.nota ?? '');
  const [file, setFile] = React.useState<File | null>(null);
  const [inCorso, setInCorso] = React.useState(false);

  const periodo =
    dal === al
      ? `${dal.slice(8, 10)}/${dal.slice(5, 7)}`
      : `${dal.slice(8, 10)}/${dal.slice(5, 7)} - ${al.slice(8, 10)}/${al.slice(5, 7)}`;

  async function salva() {
    setInCorso(true);
    const res = await salvaCertificato({
      id: esistente?.id,
      dipendenteId: dipendente.id,
      dal,
      al,
      tipoInfo,
      numero: numero.trim() || null,
      nota: nota.trim() || null,
    });
    if (!res.ok) {
      setInCorso(false);
      await showAlert({ title: 'Non salvato', body: res.error });
      return;
    }

    if (file && res.id) {
      const dati = new FormData();
      dati.set('certificatoId', res.id);
      dati.set('file', file);
      const caricato = await caricaAllegatoCertificato(dati);
      if (!caricato.ok) {
        setInCorso(false);
        await showAlert({
          title: 'Numero salvato, documento no',
          body: caricato.error,
        });
        onSalvato();
        return;
      }
    }

    setInCorso(false);
    onSalvato();
  }

  async function rimuovi() {
    if (!esistente) return;
    const ok = await confirm({
      title: "Elimina l'attestato",
      description: 'Vengono tolti il numero e il documento allegato.',
      confirmLabel: 'Elimina',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const res = await eliminaCertificato(esistente.id);
    setInCorso(false);
    if (!res.ok) await showAlert({ title: 'Non eliminato', body: res.error });
    else onSalvato();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? undefined : onChiudi())}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Attestato di malattia</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px]">
            <span className="font-medium text-foreground">
              {dipendente.cognome} {dipendente.nome}
            </span>
            <span className="text-muted-foreground">Periodo {periodo}</span>
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
                    className={`mt-0.5 block text-[11px] leading-snug ${tipoInfo === t.codice ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                  >
                    {t.descrizione}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="numero">
              Numero
            </label>
            <Input
              id="numero"
              value={numero}
              maxLength={30}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Come sta sul certificato"
              className="mt-1 h-9 bg-background font-mono shadow-none"
            />
            {numero.trim() ? (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Finira' nel file accanto al periodo di malattia.
              </p>
            ) : (
              <p className="mt-1 text-[11px] leading-snug text-amber-700">
                Senza numero il file esce comunque, ma lo Studio dovra' inserirlo a mano. Non va
                inventato.
              </p>
            )}
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Documento del medico</span>
            {esistente?.haAllegato && !file ? (
              <div className="mt-1 flex min-w-0 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-emerald-900">
                  {esistente.nomeFile ?? 'Documento allegato'}
                </span>
                <span className="shrink-0 text-[11px] text-emerald-700">in archivio</span>
              </div>
            ) : null}
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-2.5 py-2.5 hover:border-primary/40">
              <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {file ? file.name : 'Scegli un PDF o una foto del certificato'}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Fino a 15 MB. Il documento resta in archivio, non viene mandato allo Studio.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="nota-cert">
              Nota interna
            </label>
            <Input
              id="nota-cert"
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
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
