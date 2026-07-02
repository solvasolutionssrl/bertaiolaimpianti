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
  Plus,
  Minus,
  Users,
  Calendar,
  X,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import { creaSpesa, creaSpesaOffice } from '@/app/_actions/kantiere-spese';
import { compressImage } from '@/app/office/commesse/nuova/_lib/compress-image';

/**
 * Nuova ricevuta (PWA Kantiere).
 *
 * Flusso: scatta/allega foto → POST /api/kantiere/spese/scan (OCR + AI) →
 * form di revisione precompilato → creaSpesa. La spesa viene agganciata in
 * automatico al cantiere attivo lato server.
 *
 * Idioma di cattura riusato da scansiona-client: <input capture="environment">
 * per lo scatto, <input> senza capture per l'allegato dalla galleria.
 *
 * Modalità ADMIN (`adminMode`): admin/office non timbrano, quindi il cantiere
 * NON si deriva dal turno → si mostra un selettore cantiere e si salva via
 * `creaSpesaOffice` (dipendente = l'admin stesso, ruolo-gated lato server).
 * `triggerVariant='quick'` = pill compatta da griglia (cruscotto/profilo).
 */

type MetodoPagamento = 'contanti' | 'carta' | 'altro';

type NuovaSpesaProps = {
  /** Admin/office: mostra il picker cantiere e salva via creaSpesaOffice. */
  adminMode?: boolean;
  /** Opzioni cantiere per il picker admin. */
  cantieri?: { id: string; nome: string }[];
  /** Id del profilo dipendente dell'admin (richiesto in adminMode). */
  dipendenteId?: string | null;
  /**
   * 'default' = bottone grande; 'quick' = pill da griglia azioni;
   * 'fab-top' = pill fissa in alto a destra (accanto alla campanella), presente
   * su tutte le pagine della shell Kantiere.
   */
  triggerVariant?: 'default' | 'quick' | 'fab-top';
};

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
  numero_persone: number | null;
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

// "YYYY-MM-DDTHH:mm" (locale) → etichetta leggibile "6 feb 2016, 13:45".
function fmtDataInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function NuovaSpesa({
  adminMode = false,
  cantieri = [],
  dipendenteId = null,
  triggerVariant = 'default',
}: NuovaSpesaProps = {}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [fase, setFase] = React.useState<Fase>('idle');
  const [aperto, setAperto] = React.useState(false);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const [nonLeggibile, setNonLeggibile] = React.useState(false);

  const [scan, setScan] = React.useState<ScanOk | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  // Lightbox foto in revisione (la miniatura è piccola per far stare i dati
  // nello schermo; tap → foto a tutto schermo).
  const [fotoGrande, setFotoGrande] = React.useState(false);

  // campi del form di revisione
  const [importoTotale, setImportoTotale] = React.useState('');
  const [importoIva, setImportoIva] = React.useState('');
  const [categoria, setCategoria] = React.useState<CategoriaSpesa>('varie');
  const [ragioneSociale, setRagioneSociale] = React.useState('');
  const [dataLocal, setDataLocal] = React.useState('');
  // default sempre "carta" (Carta aziendale) finche' l'AI non restituisce altro
  const [metodo, setMetodo] = React.useState<MetodoPagamento>('carta');
  // numero di persone (coperti): default 1, proposto dall'AI. Se l'utente non lo
  // tocca, alla submit compare un pop-up di conferma (personeToccato = false).
  const [numeroPersone, setNumeroPersone] = React.useState(1);
  const [personeToccato, setPersoneToccato] = React.useState(false);
  // overlay full-screen di conferma "per quante persone?" (solo se non toccato)
  const [confermaPersone, setConfermaPersone] = React.useState(false);
  // cantiere scelto (solo adminMode): '' = "Da assegnare".
  const [cantiereId, setCantiereId] = React.useState('');

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
    setNumeroPersone(1);
    setPersoneToccato(false);
    setConfermaPersone(false);
    setCantiereId('');
  }, [revokePreview]);

  const chiudi = React.useCallback(() => {
    reset();
    setAperto(false);
  }, [reset]);

  // Dopo il salvataggio (fase "fatto") torna da solo alla pagina spese dopo 3s.
  // L'utente può comunque toccare "Altra ricevuta" o "Chiudi" prima.
  React.useEffect(() => {
    if (fase !== 'fatto') return;
    const t = setTimeout(() => chiudi(), 3000);
    return () => clearTimeout(t);
  }, [fase, chiudi]);

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const original = e.target.files?.[0];
      e.target.value = ''; // permette di riscegliere lo stesso file
      if (!original) return;

      setErrMsg(null);
      setNonLeggibile(false);
      // Comprimi le immagini prima dell'upload: 2048px / q0.88 (leggermente piu'
      // alta del default per il testo piccolo degli scontrini), ~tipico 0,5-1MB.
      // Meno banda dal cantiere, R2 piu' leggero, stesso invio a OpenAI. I PDF e
      // i file gia' piccoli passano invariati (compressImage li salta).
      const file = await compressImage(original, { quality: 0.88 });
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

        if (!resp.ok) {
          let code = '';
          try {
            code = ((await resp.json()) as { code?: string }).code ?? '';
          } catch {
            // body non-JSON
          }
          // AI non disponibile (crediti/quota/down): messaggio generico, niente
          // dettagli tecnici. Il super admin viene avvisato lato server.
          if (resp.status === 503 || code === 'AI_NON_DISPONIBILE') {
            setErrMsg('Funzioni AI non disponibili al momento, riprova più tardi.');
            setFase('errore');
            return;
          }
          if (resp.status === 422 || code === 'RICEVUTA_NON_LEGGIBILE') {
            setNonLeggibile(true);
            setFase('errore');
            return;
          }
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
        // numero persone proposto dall'AI (fallback 1): l'utente conferma o corregge
        setNumeroPersone(est.numero_persone ?? 1);
        setPersoneToccato(false);
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

  // Scrive la spesa col numero di persone passato. Usato sia dal salvataggio
  // diretto (utente ha toccato il campo) sia dalla conferma del pop-up.
  const eseguiSalva = React.useCallback(
    (persone: number) => {
      if (!scan || !importoValido) return;
      if (adminMode && !dipendenteId) {
        setErrMsg('Profilo dipendente non collegato: non puoi registrare spese a tuo nome.');
        return;
      }
      const est = scan.estratto;
      const dataIso = dataLocal ? new Date(dataLocal).toISOString() : null;
      const comune = {
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
        numeroPersone: persone,
        partitaIva: est.partita_iva,
        numeroDocumento: est.numero_documento,
        indirizzoEsercente: est.indirizzo_esercente,
        aiRaw: est,
      };

      startTransition(async () => {
        // adminMode: l'admin non timbra → cantiere scelto a mano, salva a proprio
        // nome via creaSpesaOffice (ruolo-gated + service role lato server).
        const res = adminMode
          ? await creaSpesaOffice({
              ...comune,
              dipendenteId: dipendenteId as string,
              cantiereId: cantiereId || null,
            })
          : await creaSpesa(comune);

        if (!res.ok) {
          setErrMsg('Salvataggio non riuscito. Riprova.');
          return;
        }
        setConfermaPersone(false);
        setFase('fatto');
        router.refresh();
      });
    },
    [
      scan,
      importoValido,
      importoNum,
      ivaNum,
      categoria,
      ragioneSociale,
      metodo,
      dataLocal,
      router,
      adminMode,
      dipendenteId,
      cantiereId,
    ],
  );

  const salva = React.useCallback(() => {
    if (!scan || !importoValido) return;
    // Se l'utente non ha confermato il numero di persone, prima chiediglielo.
    if (!personeToccato) {
      setConfermaPersone(true);
      return;
    }
    eseguiSalva(numeroPersone);
  }, [scan, importoValido, personeToccato, numeroPersone, eseguiSalva]);

  // ── ENTRY: bottone + scelta sorgente foto ──────────────────────────────────
  if (!aperto) {
    // Pill fissa in alto a destra, accanto alla campanella (shell Kantiere):
    // aggiungi spesa da qualunque pagina. Stessa altezza della campanella (h-10)
    // e safe-area aware; sta alla sua sinistra.
    if (triggerVariant === 'fab-top') {
      return (
        <button
          type="button"
          onClick={() => setAperto(true)}
          aria-label="Aggiungi spesa"
          className="fixed z-30 inline-flex h-10 items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-soft active:scale-95 transition-transform"
          style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)', right: '3.6rem' }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Spesa
        </button>
      );
    }
    // Pill compatta per le griglie azioni (cruscotto/profilo admin).
    if (triggerVariant === 'quick') {
      return (
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-3 text-center text-sm font-semibold text-primary shadow-soft transition-transform active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Aggiungi spesa
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-[0_12px_30px_-10px_rgba(0,0,0,0.35)] active:scale-[0.99] transition-transform"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        Aggiungi nuova ricevuta
      </button>
    );
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[35] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        // Foglio a TUTTA pagina (il bianco prosegue dietro la bottom-nav → niente
        // "gradino" di sfondo colorato). Z gestita: z-[35] sta SOPRA la campanella
        // (z-30, così non sbuca in alto) e SOTTO la bottom-nav + FAB "Scansiona"
        // (z-40), che restano davanti senza essere tagliati. Il padding-bottom
        // tiene contenuti e azioni sopra la barra + cappello FAB (~6rem).
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
      }}
    >
      {/* HEADER */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-base font-semibold text-foreground">Nuova ricevuta</p>
        <button
          type="button"
          onClick={chiudi}
          aria-label="Chiudi"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

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

      {/* BODY scrollabile SOLO in verticale. Con `overflow-y-auto` da solo l'asse
          x diventa `auto` (spec CSS) e scrolla se un campo sfora → il form "si
          muove" orizzontalmente. `overflow-x-hidden` lo blocca; i campi hanno
          `min-w-0` per rientrare nella larghezza. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* IDLE: scelta sorgente */}
        {fase === 'idle' ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Receipt className="h-8 w-8" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">
              Scatta o allega la foto dello scontrino: i dati vengono compilati in automatico.
            </p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                size="lg"
                className="w-full py-3.5"
                onClick={() => fotoInputRef.current?.click()}
              >
                <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
                Scatta foto
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full py-3.5"
                onClick={() => allegaInputRef.current?.click()}
              >
                <Paperclip className="mr-2 h-5 w-5" aria-hidden="true" />
                Allega
              </Button>
            </div>
          </div>
        ) : null}

        {/* ANALISI: loading a tutta pagina */}
        {fase === 'analisi' ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center"
            role="status"
            aria-live="polite"
          >
            {preview ? (
              <div className="relative h-48 w-40 overflow-hidden rounded-xl border border-border bg-muted/40 shadow-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" className="h-full w-full object-cover opacity-70" />
                <ScanningOverlay />
              </div>
            ) : null}
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden="true" />
              <p className="text-lg font-semibold text-foreground">
                Attendi qualche secondo mentre vengono estratti i dati dello scontrino
              </p>
              <p className="text-sm text-muted-foreground">Non chiudere questa schermata</p>
            </div>
          </div>
        ) : null}

        {/* ERRORE / ricevuta non leggibile */}
        {fase === 'errore' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
            <div className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                {nonLeggibile
                  ? 'Ricevuta non leggibile, riprova. Inquadra bene tutto lo scontrino con buona luce.'
                  : errMsg ?? 'Qualcosa è andato storto. Riprova.'}
              </p>
            </div>
            <Button type="button" size="lg" className="w-full py-3.5" onClick={reset}>
              <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
              Riprova
            </Button>
          </div>
        ) : null}

        {/* REVISIONE: form compatto (dati + foto-thumb) */}
        {fase === 'revisione' && scan ? (
          <div className="space-y-2.5 px-4 py-3">
            {/* miniatura foto: tap per ingrandire (libera spazio per i dati) */}
            {preview ? (
              <button
                type="button"
                onClick={() => setFotoGrande(true)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-1.5 text-left active:scale-[0.99] transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                <span className="text-xs text-muted-foreground">Tocca per ingrandire la foto</span>
              </button>
            ) : null}

            {/* GRUPPO Importo: Totale+IVA / Pagamento+Data (2 righe da 2) */}
            <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Importo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-importo"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Totale ({scan.estratto.valuta || 'EUR'})
                  </label>
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
                    className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-lg font-semibold tabular-nums outline-none focus:border-primary"
                  />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-iva"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    IVA
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
                    className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-base tabular-nums outline-none focus:border-primary"
                  />
                </div>
              </div>
              {/* Pagamento e Data 50/50 come la riga Totale/IVA sopra: la Data usa
                  un campo custom troncabile, quindi ci sta anche a metà larghezza. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-metodo"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Pagamento
                  </label>
                  <select
                    id="spesa-metodo"
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
                    className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-2 py-2 text-base outline-none focus:border-primary"
                  >
                    <option value="carta">Carta aziendale</option>
                    <option value="contanti">Contanti</option>
                    <option value="altro">Altro</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-data"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Data
                  </label>
                  {/* Campo data custom: display pulito (icona + testo formattato,
                      troncabile) con l'<input datetime-local> nativo INVISIBILE
                      sopra, che apre comunque il picker iOS al tap. Il nativo
                      sforava perché iOS lo disegna alla larghezza intrinseca
                      ignorando width; così controllo formato/spaziatura e il
                      campo non esce mai dal box (pattern standard iOS). */}
                  <div className="relative mt-1">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-2 text-base"
                    >
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {dataLocal ? (
                        <span className="min-w-0 truncate">{fmtDataInput(dataLocal)}</span>
                      ) : (
                        <span className="text-muted-foreground">Scegli data</span>
                      )}
                    </div>
                    <input
                      id="spesa-data"
                      type="datetime-local"
                      value={dataLocal}
                      onChange={(e) => setDataLocal(e.target.value)}
                      aria-label="Data e ora"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* GRUPPO Dettaglio: Persone (in evidenza) + Categoria/Esercente */}
            <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Dettaglio
              </p>
              {/* Persone: in evidenza (bordo + tinta primary, grassetto) */}
              <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-2">
                <label
                  htmlFor="spesa-persone"
                  className="block text-[11px] font-bold uppercase tracking-wider text-primary"
                >
                  Per quante persone?
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Diminuisci"
                    onClick={() => {
                      setPersoneToccato(true);
                      setNumeroPersone((n) => Math.max(1, n - 1));
                    }}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground active:scale-95 transition disabled:opacity-40"
                    disabled={numeroPersone <= 1}
                  >
                    <Minus className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <input
                    id="spesa-persone"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={numeroPersone}
                    onChange={(e) => {
                      setPersoneToccato(true);
                      const n = Math.floor(Number(e.target.value));
                      setNumeroPersone(Number.isFinite(n) && n >= 1 ? n : 1);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-primary/30 bg-background px-2.5 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    aria-label="Aumenta"
                    onClick={() => {
                      setPersoneToccato(true);
                      setNumeroPersone((n) => n + 1);
                    }}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground active:scale-95 transition"
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {/* Categoria + Esercente in 2 colonne */}
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-categoria"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Categoria
                  </label>
                  <select
                    id="spesa-categoria"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as CategoriaSpesa)}
                    className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-2 py-2 text-base outline-none focus:border-primary"
                  >
                    {CATEGORIE_ORDINATE.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORIA_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor="spesa-rs"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Esercente
                  </label>
                  <input
                    id="spesa-rs"
                    type="text"
                    value={ragioneSociale}
                    onChange={(e) => setRagioneSociale(e.target.value)}
                    placeholder="Locale o negozio"
                    className="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-base outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {adminMode ? (
              <div className="space-y-1.5 rounded-xl border border-border bg-muted/25 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  Cantiere
                </p>
                <select
                  id="spesa-cantiere"
                  aria-label="Cantiere"
                  value={cantiereId}
                  onChange={(e) => setCantiereId(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-base outline-none focus:border-primary"
                >
                  <option value="">Da assegnare</option>
                  {cantieri.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Non stai timbrando: scegli tu il cantiere (o lascia “Da assegnare”).
                </p>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                La spesa verrà collegata in automatico al cantiere su cui stai lavorando.
              </p>
            )}
          </div>
        ) : null}

        {/* FATTO */}
        {fase === 'fatto' ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            {/* Conferma "premium": il check fa un pop morbido, un anello verde si
                espande dietro, poi il testo sale in dissolvenza. */}
            <span className="relative flex h-16 w-16 items-center justify-center">
              {/* glow morbido dietro */}
              <span
                aria-hidden="true"
                className="animate-success-glow absolute inset-[-45%] rounded-full bg-emerald-400/30 blur-xl"
              />
              {/* due anelli che si espandono (il secondo in leggero ritardo) */}
              <span
                aria-hidden="true"
                className="animate-success-ring absolute inset-0 rounded-full bg-emerald-400/40"
              />
              <span
                aria-hidden="true"
                className="animate-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50 [animation-delay:0.16s]"
              />
              {/* check con pop + ombra emerald per profondità */}
              <span className="animate-success-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.5)]">
                <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
              </span>
            </span>
            <p className="animate-fade-up text-lg font-semibold text-foreground">Spesa registrata</p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button type="button" size="lg" className="w-full py-3.5" onClick={reset}>
                <Receipt className="mr-2 h-5 w-5" aria-hidden="true" />
                Altra ricevuta
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full py-3.5"
                onClick={chiudi}
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* FOOTER: action area FLOTTANTE (arrotondata, tinta, sopra tutto) */}
      {fase === 'revisione' && scan ? (
        <footer className="shrink-0 px-3 pb-3 pt-2">
          {errMsg ? (
            <p className="mb-2 text-center text-sm text-destructive">{errMsg}</p>
          ) : null}
          <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.06] p-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.32)]">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="shrink-0 bg-background px-4 py-3.5"
              onClick={reset}
              disabled={pending}
            >
              Rifai
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1 py-3.5 text-base font-semibold shadow-soft"
              onClick={salva}
              disabled={!importoValido || pending}
            >
              {pending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {importoValido
                ? `Salva spesa · ${importoNum.toLocaleString('it-IT', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} ${scan.estratto.valuta || 'EUR'}`
                : 'Salva spesa'}
            </Button>
          </div>
        </footer>
      ) : null}

    </div>

      {/* Lightbox foto: FUORI dal foglio (che è z-[35]) così il suo z-[70]
          compete globalmente e copre anche la bottom-nav. */}
      {fotoGrande && preview ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setFotoGrande(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
        >
          {/* X di chiusura sempre visibile: chi non sa del tap-fuori non preme
              "Indietro" (che chiuderebbe il form perdendo l'estrazione). */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFotoGrande(false);
            }}
            aria-label="Chiudi anteprima"
            className="absolute right-3 z-[71] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95 transition"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : null}

      {/* Conferma numero persone: pop-up full-screen quando l'utente non ha
          toccato il campo. Ricorda l'importo e chiede i coperti. */}
      {confermaPersone && scan ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="w-full rounded-2xl bg-background p-5 shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.4)]">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-center text-base font-semibold text-foreground">
              Stai aggiungendo una spesa da{' '}
              {importoNum.toLocaleString('it-IT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              {scan.estratto.valuta || 'EUR'}.
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Per quante persone hai pagato?
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Diminuisci"
                onClick={() => {
                  setPersoneToccato(true);
                  setNumeroPersone((n) => Math.max(1, n - 1));
                }}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground active:scale-95 transition disabled:opacity-40"
                disabled={numeroPersone <= 1}
              >
                <Minus className="h-6 w-6" aria-hidden="true" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                aria-label="Numero di persone"
                value={numeroPersone}
                onChange={(e) => {
                  setPersoneToccato(true);
                  const n = Math.floor(Number(e.target.value));
                  setNumeroPersone(Number.isFinite(n) && n >= 1 ? n : 1);
                }}
                className="w-24 rounded-xl border border-border bg-background px-3 py-3 text-center text-2xl font-bold tabular-nums outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label="Aumenta"
                onClick={() => {
                  setPersoneToccato(true);
                  setNumeroPersone((n) => n + 1);
                }}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground active:scale-95 transition"
              >
                <Plus className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full py-3.5"
                onClick={() => setConfermaPersone(false)}
                disabled={pending}
              >
                Modifica
              </Button>
              <Button
                type="button"
                size="lg"
                className="w-full py-3.5 font-semibold"
                onClick={() => eseguiSalva(numeroPersone)}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
                )}
                Conferma
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
