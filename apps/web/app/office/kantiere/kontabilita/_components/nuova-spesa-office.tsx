'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, PenLine, AlertTriangle, FileText, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import { creaSpesaOffice } from '@/app/_actions/kantiere-spese';

import type { CantiereOption, DipendenteOption } from './spese-table';

/**
 * Nuova spesa lato OFFICE.
 *
 * Due modi di partire:
 *  - upload di un file (jpg/png/pdf) → POST /api/kantiere/spese/scan (OCR + AI) →
 *    form precompilato dall'estratto (per i PDF l'estratto e' vuoto, l'utente
 *    compila a mano ma il file resta agganciato);
 *  - "Inserisci a mano" → form vuoto, nessun file.
 *
 * In piu' rispetto alla PWA: selettore dipendente (default = se stesso se
 * l'utente office e' anche un dipendente) e selettore cantiere.
 */

type MetodoPagamento = 'contanti' | 'carta' | 'altro';

type Estratto = {
  ragione_sociale: string | null;
  categoria: string;
  importo_totale: number | null;
  importo_iva: number | null;
  valuta: string;
  data_scontrino: string | null;
  partita_iva: string | null;
  metodo_pagamento: MetodoPagamento | null;
  numero_documento: string | null;
  indirizzo_esercente: string | null;
};

type ScanOk = {
  ok: true;
  r2Key: string;
  r2ThumbKey: string | null;
  mime: string;
  sizeBytes: number;
  isPdf: boolean;
  estratto: Estratto;
  aiEstratto: boolean;
};

type Fase = 'scelta' | 'analisi' | 'form';

function isCategoria(v: string): v is CategoriaSpesa {
  return (CATEGORIE_ORDINATE as string[]).includes(v);
}

// ISO (con offset) → valore per <input type="datetime-local"> in ora locale.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

interface Props {
  cantieri: CantiereOption[];
  dipendentiOptions: DipendenteOption[];
  mioDipendenteId: string | null;
}

export function NuovaSpesaOffice({ cantieri, dipendentiOptions, mioDipendenteId }: Props) {
  const router = useRouter();
  const [aperto, setAperto] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const [fase, setFase] = React.useState<Fase>('scelta');
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const [avviso, setAvviso] = React.useState<string | null>(null);

  // file agganciato (presente solo dopo uno scan ok)
  const [scan, setScan] = React.useState<ScanOk | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  // campi del form
  const defaultDip = mioDipendenteId ?? dipendentiOptions[0]?.id ?? '';
  const [dipendenteId, setDipendenteId] = React.useState<string>(defaultDip);
  const [cantiereId, setCantiereId] = React.useState<string>('');
  const [categoria, setCategoria] = React.useState<CategoriaSpesa>('varie');
  const [importoTotale, setImportoTotale] = React.useState('');
  const [importoIva, setImportoIva] = React.useState('');
  const [ragioneSociale, setRagioneSociale] = React.useState('');
  const [dataLocal, setDataLocal] = React.useState('');
  const [metodo, setMetodo] = React.useState<MetodoPagamento | ''>('');
  const [valuta, setValuta] = React.useState('EUR');

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const reset = React.useCallback(() => {
    setFase('scelta');
    setErrMsg(null);
    setAvviso(null);
    setScan(null);
    setFileName(null);
    setDipendenteId(defaultDip);
    setCantiereId('');
    setCategoria('varie');
    setImportoTotale('');
    setImportoIva('');
    setRagioneSociale('');
    setDataLocal('');
    setMetodo('');
    setValuta('EUR');
  }, [defaultDip]);

  const chiudi = React.useCallback(() => {
    reset();
    setAperto(false);
  }, [reset]);

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setErrMsg(null);
      setAvviso(null);
      setFase('analisi');

      try {
        const fd = new FormData();
        fd.append('foto', file);
        const resp = await fetch('/api/kantiere/spese/scan', { method: 'POST', body: fd });

        if (resp.status === 422) {
          // immagine non leggibile: nessun r2Key restituito → si prosegue a mano senza file
          setScan(null);
          setFileName(null);
          setAvviso('Ricevuta non leggibile. Compila a mano oppure riprova con uno scatto piu nitido.');
          setFase('form');
          return;
        }
        if (!resp.ok) {
          setErrMsg('Non sono riuscito a leggere la ricevuta. Riprova.');
          setFase('scelta');
          return;
        }

        const data = (await resp.json()) as ScanOk;
        const est = data.estratto;
        setScan(data);
        setFileName(file.name);
        setImportoTotale(est.importo_totale != null ? String(est.importo_totale) : '');
        setImportoIva(est.importo_iva != null ? String(est.importo_iva) : '');
        setCategoria(isCategoria(est.categoria) ? est.categoria : 'varie');
        setRagioneSociale(est.ragione_sociale ?? '');
        setDataLocal(isoToLocalInput(est.data_scontrino));
        setMetodo(est.metodo_pagamento ?? '');
        setValuta(est.valuta || 'EUR');
        if (data.isPdf) {
          setAvviso('PDF allegato. Inserisci i dati a mano, il documento resta agganciato alla spesa.');
        }
        setFase('form');
      } catch {
        setErrMsg('Connessione assente o instabile. Riprova.');
        setFase('scelta');
      }
    },
    [],
  );

  const importoNum = Number(importoTotale.replace(',', '.'));
  const importoValido = Number.isFinite(importoNum) && importoNum > 0;
  const ivaNum = importoIva.trim() ? Number(importoIva.replace(',', '.')) : null;
  const puoSalvare = importoValido && !!dipendenteId;

  const salva = React.useCallback(() => {
    if (!puoSalvare) return;
    const dataIso = dataLocal ? new Date(dataLocal).toISOString() : null;

    startTransition(async () => {
      const res = await creaSpesaOffice({
        dipendenteId,
        cantiereId: cantiereId ? cantiereId : null,
        categoria,
        importoTotale: importoNum,
        importoIva: ivaNum != null && Number.isFinite(ivaNum) ? ivaNum : null,
        valuta: valuta || 'EUR',
        ragioneSociale: ragioneSociale.trim() || null,
        dataScontrino: dataIso,
        metodoPagamento: metodo || null,
        ...(scan
          ? {
              r2Key: scan.r2Key,
              r2ThumbKey: scan.r2ThumbKey,
              mime: scan.mime,
              sizeBytes: scan.sizeBytes,
              partitaIva: scan.estratto.partita_iva,
              numeroDocumento: scan.estratto.numero_documento,
              indirizzoEsercente: scan.estratto.indirizzo_esercente,
              aiRaw: scan.estratto,
            }
          : {}),
      });

      if (!res.ok) {
        setErrMsg('Salvataggio non riuscito. Riprova.');
        return;
      }
      router.refresh();
      chiudi();
    });
  }, [
    puoSalvare,
    dipendenteId,
    cantiereId,
    categoria,
    importoNum,
    ivaNum,
    valuta,
    ragioneSociale,
    dataLocal,
    metodo,
    scan,
    router,
    chiudi,
  ]);

  return (
    <>
      <Button size="sm" onClick={() => setAperto(true)}>
        <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Nuova spesa
      </Button>

      {aperto ? (
        <Dialog open onOpenChange={(o) => !o && chiudi()}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuova spesa</DialogTitle>
              <DialogDescription>
                Carica una ricevuta da leggere in automatico oppure inserisci i dati a mano.
              </DialogDescription>
            </DialogHeader>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => void onFile(e)}
            />

            {/* SCELTA */}
            {fase === 'scelta' ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-6 text-sm font-medium text-foreground transition hover:bg-muted/60"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  Carica ricevuta
                  <span className="text-xs font-normal text-muted-foreground">JPG, PNG o PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScan(null);
                    setFileName(null);
                    setFase('form');
                  }}
                  className="flex flex-col items-center gap-2 rounded-lg border border-input bg-background px-4 py-6 text-sm font-medium text-foreground transition hover:bg-muted/40"
                >
                  <PenLine className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  Inserisci a mano
                  <span className="text-xs font-normal text-muted-foreground">Senza file</span>
                </button>
              </div>
            ) : null}

            {/* ANALISI */}
            {fase === 'analisi' ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                <p className="text-sm">Analizzo la ricevuta...</p>
              </div>
            ) : null}

            {errMsg && fase !== 'form' ? (
              <p className="text-sm text-rose-600">{errMsg}</p>
            ) : null}

            {/* FORM */}
            {fase === 'form' ? (
              <div className="space-y-4">
                {avviso ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{avviso}</p>
                  </div>
                ) : null}

                {scan ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {fileName || 'Documento allegato'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setScan(null);
                        setFileName(null);
                      }}
                      className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"
                      aria-label="Rimuovi file"
                      title="Rimuovi file"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                {/* Dipendente */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
                  <select
                    value={dipendenteId}
                    onChange={(e) => setDipendenteId(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {dipendentiOptions.length === 0 ? (
                      <option value="">Nessun dipendente</option>
                    ) : null}
                    {dipendentiOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome || 'Senza nome'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cantiere */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Cantiere</label>
                  <select
                    value={cantiereId}
                    onChange={(e) => setCantiereId(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Da assegnare</option>
                    {cantieri.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Categoria */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIE_ORDINATE.map((cat) => {
                      const meta = CATEGORIA_META[cat];
                      const attiva = cat === categoria;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoria(cat)}
                          aria-pressed={attiva}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                            attiva
                              ? meta.badge + ' ring-2 ring-primary/40'
                              : 'border-border bg-background text-muted-foreground'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Importo + IVA */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Importo totale
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      required
                      value={importoTotale}
                      onChange={(e) => setImportoTotale(e.target.value)}
                      placeholder="0,00"
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      IVA (facoltativo)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={importoIva}
                      onChange={(e) => setImportoIva(e.target.value)}
                      placeholder="0,00"
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>

                {/* Esercente */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Esercente (facoltativo)
                  </label>
                  <input
                    type="text"
                    value={ragioneSociale}
                    onChange={(e) => setRagioneSociale(e.target.value)}
                    placeholder="Nome del locale o negozio"
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Data + Metodo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Data scontrino
                    </label>
                    <input
                      type="datetime-local"
                      value={dataLocal}
                      onChange={(e) => setDataLocal(e.target.value)}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Metodo pagamento
                    </label>
                    <select
                      value={metodo}
                      onChange={(e) => setMetodo(e.target.value as MetodoPagamento | '')}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Non indicato</option>
                      <option value="contanti">Contanti</option>
                      <option value="carta">Carta</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>
                </div>

                {errMsg ? <p className="text-sm text-rose-600">{errMsg}</p> : null}
              </div>
            ) : null}

            {fase === 'form' ? (
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={chiudi} disabled={pending}>
                  Annulla
                </Button>
                <Button size="sm" onClick={salva} disabled={!puoSalvare || pending}>
                  {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Salva
                </Button>
              </DialogFooter>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
