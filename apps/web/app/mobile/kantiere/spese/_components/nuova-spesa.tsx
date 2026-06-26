'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Paperclip,
  Loader2,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import { creaSpesa } from '@/app/_actions/kantiere-spese';

/**
 * Nuova ricevuta (PWA Kantiere).
 *
 * Flusso: scatta/allega foto → POST /api/kantiere/spese/scan (OCR + AI) →
 * form di revisione precompilato → creaSpesa. La spesa viene agganciata in
 * automatico al cantiere attivo lato server.
 *
 * Idioma di cattura riusato da scansiona-client: <input capture="environment">
 * per lo scatto, <input> senza capture per l'allegato dalla galleria.
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
  estratto: Estratto;
  aiEstratto: boolean;
};

type Fase = 'idle' | 'analisi' | 'revisione' | 'errore' | 'fatto';

function isCategoria(v: string): v is CategoriaSpesa {
  return (CATEGORIE_ORDINATE as string[]).includes(v);
}

const FASI_ANALISI = [
  "Leggo l'importo...",
  "Riconosco l'esercente...",
  "Estraggo l'IVA...",
  'Rilevo la data...',
] as const;

/**
 * Overlay "magic" durante la scansione AI: si appoggia sull'anteprima della
 * ricevuta (gia' sfumata) con un beam che spazza dall'alto verso il basso +
 * caption che ruota tra le fasi. Rispetta prefers-reduced-motion (niente beam,
 * solo pulse calmo).
 */
function ScanningOverlay() {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % FASI_ANALISI.length), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0" role="status" aria-live="polite">
      <style jsx>{`
        @keyframes spesa-beam {
          0% {
            transform: translateY(-120%);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          88% {
            opacity: 1;
          }
          100% {
            transform: translateY(2400%);
            opacity: 0;
          }
        }
        @keyframes spesa-dot {
          0%,
          100% {
            transform: scale(0.7);
            opacity: 0.5;
          }
          50% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .spesa-beam {
          animation: spesa-beam 1.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .spesa-dot {
          animation: spesa-dot 0.9s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .spesa-beam {
            display: none;
          }
          .spesa-dot {
            animation: spesa-dot 1.8s ease-in-out infinite;
          }
        }
      `}</style>

      {/* velo + beam di scansione top→bottom */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="spesa-beam absolute left-0 right-0 top-0 h-[6%]"
          style={{
            background:
              'linear-gradient(to bottom, transparent, rgba(96,165,250,0.7), rgba(251,191,36,0.7), transparent)',
            boxShadow: '0 0 18px 3px rgba(96,165,250,0.45)',
          }}
        />
      </div>

      {/* caption rotante */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-sm font-medium text-white">
        <span
          className="spesa-dot inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: '#FBBF24' }}
          aria-hidden="true"
        />
        <span>{FASI_ANALISI[idx]}</span>
        <span aria-hidden="true">✨</span>
      </div>
    </div>
  );
}

// ISO (con offset) → valore per <input type="datetime-local"> in ora locale.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local vuole "YYYY-MM-DDTHH:mm" in ora locale del device.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function NuovaSpesa() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [fase, setFase] = React.useState<Fase>('idle');
  const [aperto, setAperto] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const [nonLeggibile, setNonLeggibile] = React.useState(false);

  const [scan, setScan] = React.useState<ScanOk | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  // campi del form di revisione
  const [importoTotale, setImportoTotale] = React.useState('');
  const [importoIva, setImportoIva] = React.useState('');
  const [categoria, setCategoria] = React.useState<CategoriaSpesa>('varie');
  const [ragioneSociale, setRagioneSociale] = React.useState('');
  const [dataLocal, setDataLocal] = React.useState('');
  // default sempre "carta" (Carta aziendale) finche' l'AI non restituisce altro
  const [metodo, setMetodo] = React.useState<MetodoPagamento>('carta');

  const fotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const allegaInputRef = React.useRef<HTMLInputElement | null>(null);

  const revokePreview = React.useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = React.useCallback(() => {
    revokePreview();
    setScan(null);
    setFase('idle');
    setErrMsg(null);
    setNonLeggibile(false);
    setImportoTotale('');
    setImportoIva('');
    setCategoria('varie');
    setRagioneSociale('');
    setDataLocal('');
    setMetodo('carta');
  }, [revokePreview]);

  const chiudi = React.useCallback(() => {
    reset();
    setAperto(false);
  }, [reset]);

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // permette di riscegliere lo stesso file
      if (!file) return;

      setErrMsg(null);
      setNonLeggibile(false);
      revokePreview();
      setPreview(URL.createObjectURL(file));
      setFase('analisi');

      try {
        const fd = new FormData();
        fd.append('foto', file);
        const resp = await fetch('/api/kantiere/spese/scan', {
          method: 'POST',
          body: fd,
        });

        if (resp.status === 422) {
          setNonLeggibile(true);
          setFase('errore');
          return;
        }
        if (!resp.ok) {
          setErrMsg('Non sono riuscito a leggere la ricevuta. Riprova.');
          setFase('errore');
          return;
        }

        const data = (await resp.json()) as ScanOk;
        const est = data.estratto;
        setScan(data);
        setImportoTotale(est.importo_totale != null ? String(est.importo_totale) : '');
        setImportoIva(est.importo_iva != null ? String(est.importo_iva) : '');
        setCategoria(isCategoria(est.categoria) ? est.categoria : 'varie');
        setRagioneSociale(est.ragione_sociale ?? '');
        setDataLocal(isoToLocalInput(est.data_scontrino));
        // default "carta": l'AI vince solo se ha restituito un metodo esplicito
        setMetodo(est.metodo_pagamento ?? 'carta');
        setFase('revisione');
      } catch {
        setErrMsg('Connessione assente o instabile. Riprova.');
        setFase('errore');
      }
    },
    [revokePreview],
  );

  const importoNum = Number(importoTotale.replace(',', '.'));
  const importoValido = Number.isFinite(importoNum) && importoNum > 0;
  const ivaNum = importoIva.trim() ? Number(importoIva.replace(',', '.')) : null;

  const salva = React.useCallback(() => {
    if (!scan || !importoValido) return;
    const est = scan.estratto;
    const dataIso = dataLocal ? new Date(dataLocal).toISOString() : null;

    startTransition(async () => {
      const res = await creaSpesa({
        r2Key: scan.r2Key,
        r2ThumbKey: scan.r2ThumbKey,
        mime: scan.mime,
        sizeBytes: scan.sizeBytes,
        importoTotale: importoNum,
        importoIva: ivaNum != null && Number.isFinite(ivaNum) ? ivaNum : null,
        categoria,
        ragioneSociale: ragioneSociale.trim() || null,
        valuta: est.valuta || 'EUR',
        dataScontrino: dataIso,
        metodoPagamento: metodo,
        partitaIva: est.partita_iva,
        numeroDocumento: est.numero_documento,
        indirizzoEsercente: est.indirizzo_esercente,
        aiRaw: est,
      });

      if (!res.ok) {
        setErrMsg('Salvataggio non riuscito. Riprova.');
        return;
      }
      setFase('fatto');
      router.refresh();
    });
  }, [
    scan,
    importoValido,
    importoNum,
    ivaNum,
    categoria,
    ragioneSociale,
    metodo,
    dataLocal,
    router,
  ]);

  // ── ENTRY: bottone + scelta sorgente foto ──────────────────────────────────
  if (!aperto) {
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-soft active:scale-[0.99] transition-transform"
      >
        <Receipt className="h-5 w-5" aria-hidden="true" />
        Nuova ricevuta
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Nuova ricevuta</p>
        <button
          type="button"
          onClick={chiudi}
          aria-label="Chiudi"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* input nativi nascosti */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />
      <input
        ref={allegaInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onFile(e)}
      />

      {/* anteprima */}
      {preview ? (
        <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className={`h-full w-full object-contain ${
              fase === 'analisi' ? 'opacity-70' : ''
            }`}
          />
          {fase === 'analisi' ? <ScanningOverlay /> : null}
          {fase === 'fatto' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-emerald-600/85 text-white">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm font-semibold">Spesa salvata</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* IDLE: scelta sorgente */}
      {fase === 'idle' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full py-3"
            onClick={() => fotoInputRef.current?.click()}
          >
            <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
            Scatta foto
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full py-3"
            onClick={() => allegaInputRef.current?.click()}
          >
            <Paperclip className="mr-2 h-5 w-5" aria-hidden="true" />
            Allega
          </Button>
        </div>
      ) : null}

      {/* ERRORE / ricevuta non leggibile */}
      {fase === 'errore' ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              {nonLeggibile
                ? 'Ricevuta non leggibile, riprova. Inquadra bene tutto lo scontrino con buona luce.'
                : errMsg ?? 'Qualcosa è andato storto. Riprova.'}
            </p>
          </div>
          <Button type="button" size="lg" className="w-full py-3" onClick={reset}>
            <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
            Riprova
          </Button>
        </div>
      ) : null}

      {/* REVISIONE: form precompilato */}
      {fase === 'revisione' && scan ? (
        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="spesa-importo"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Importo totale
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="spesa-importo"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                value={importoTotale}
                onChange={(e) => setImportoTotale(e.target.value)}
                placeholder="0,00"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
              />
              <span className="text-sm font-medium text-muted-foreground">
                {scan.estratto.valuta || 'EUR'}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="spesa-iva"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              IVA (facoltativo)
            </label>
            <input
              id="spesa-iva"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={importoIva}
              onChange={(e) => setImportoIva(e.target.value)}
              placeholder="0,00"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Categoria
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIE_ORDINATE.map((cat) => {
                const meta = CATEGORIA_META[cat];
                const attiva = cat === categoria;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoria(cat)}
                    aria-pressed={attiva}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
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

          <div>
            <label
              htmlFor="spesa-rs"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Esercente (facoltativo)
            </label>
            <input
              id="spesa-rs"
              type="text"
              value={ragioneSociale}
              onChange={(e) => setRagioneSociale(e.target.value)}
              placeholder="Nome del locale o negozio"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="spesa-data"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Data scontrino (facoltativo)
            </label>
            <input
              id="spesa-data"
              type="datetime-local"
              value={dataLocal}
              onChange={(e) => setDataLocal(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="spesa-metodo"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Metodo di pagamento (facoltativo)
            </label>
            <select
              id="spesa-metodo"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-primary"
            >
              <option value="carta">Carta aziendale</option>
              <option value="contanti">Contanti</option>
              <option value="altro">Altro</option>
            </select>
          </div>

          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            La spesa verrà collegata in automatico al cantiere su cui stai
            lavorando.
          </p>

          {errMsg ? <p className="text-sm text-destructive">{errMsg}</p> : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 py-3"
              onClick={reset}
              disabled={pending}
            >
              Annulla
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1 py-3"
              onClick={salva}
              disabled={!importoValido || pending}
            >
              {pending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : null}
              Salva
            </Button>
          </div>
        </div>
      ) : null}

      {/* FATTO: messaggio + nuova */}
      {fase === 'fatto' ? (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Spesa registrata.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="lg" className="flex-1 py-3" onClick={reset}>
              <Receipt className="mr-2 h-5 w-5" aria-hidden="true" />
              Altra ricevuta
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 py-3"
              onClick={chiudi}
            >
              Chiudi
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
