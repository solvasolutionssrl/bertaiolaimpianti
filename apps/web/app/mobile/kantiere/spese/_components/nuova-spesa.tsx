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
  Cloud,
  MapPin,
  ChevronLeft,
  X,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import { compressImage } from '@/app/office/commesse/nuova/_lib/compress-image';
import { useSheetOpen } from '@/app/mobile/kantiere/_lib/sheet-flag';
import {
  CantiereSearchList,
  type PickerCantiere,
} from '@/app/mobile/kantiere/_components/cantiere-picker';
import { titoloCase } from '@/app/mobile/_lib/display-case';

/**
 * Nuova ricevuta (PWA Kantiere) — flusso ASINCRONO.
 *
 * 1) Prima il CANTIERE (ricerca riusata da CantiereSearchList). Se c'è un turno
 *    aperto, il suo cantiere è preselezionato ma cambiabile.
 * 2) Poi la FOTO: scatta/allega → upload IMMEDIATO su R2 (l'utente aspetta solo
 *    questo, con retry per il poco-campo in cantiere).
 * 3) Popup di conferma "caricamento completato": l'analisi AI viene fatta in
 *    cloud dopo, il risultato compare nella pagina Spese. Auto-chiusura dopo 3s.
 *
 * Niente più attesa dei ~10s dell'AI: la riga `spese` nasce 'in_elaborazione'
 * lato server e si compila da sola. Idioma cattura: <input capture> / galleria.
 */

type NuovaSpesaProps = {
  /** Cantieri selezionabili (attivi/sospesi), formato picker. */
  cantieri?: PickerCantiere[];
  /** Cantiere del turno aperto → preselezionato (cambiabile). */
  turnoCantiereId?: string | null;
  /** Nome del cantiere del turno (per il banner "stai lavorando su…"). */
  turnoCantiereNome?: string | null;
  /**
   * 'default' = bottone grande; 'quick' = pill da griglia azioni;
   * 'fab-top' = pill fissa in alto a destra (accanto alla campanella).
   */
  triggerVariant?: 'default' | 'quick' | 'fab-top';
};

type Fase = 'cantiere' | 'foto' | 'invio' | 'errore' | 'fatto';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Codici HTTP non recuperabili col retry (gate/validazione): inutile insistere.
const NON_RIPROVABILE = new Set([400, 401, 403, 404, 413, 415]);

export function NuovaSpesa({
  cantieri = [],
  turnoCantiereId = null,
  turnoCantiereNome = null,
  triggerVariant = 'default',
}: NuovaSpesaProps = {}) {
  const router = useRouter();

  const [aperto, setAperto] = React.useState(false);
  const [fase, setFase] = React.useState<Fase>('cantiere');
  const [cantiereId, setCantiereId] = React.useState<string | null>(turnoCantiereId);
  // true → mostra la lista di ricerca (altrimenti banner turno + "Cambia").
  const [ricercaAperta, setRicercaAperta] = React.useState<boolean>(!turnoCantiereId);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  useSheetOpen(aperto);

  const fotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const allegaInputRef = React.useRef<HTMLInputElement | null>(null);

  const cantiereScelto = React.useMemo(
    () => (cantiereId ? cantieri.find((c) => c.id === cantiereId) ?? null : null),
    [cantiereId, cantieri],
  );
  const nomeCantiereScelto =
    (cantiereScelto ? titoloCase(cantiereScelto.nome ?? '') || cantiereScelto.codice : null) ||
    (cantiereId && cantiereId === turnoCantiereId ? turnoCantiereNome : null) ||
    null;

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
    setFile(null);
    setErrMsg(null);
    setCantiereId(turnoCantiereId);
    setRicercaAperta(!turnoCantiereId);
    setFase('cantiere');
  }, [revokePreview, turnoCantiereId]);

  const chiudi = React.useCallback(() => {
    reset();
    setAperto(false);
  }, [reset]);

  // Dopo l'upload (fase "fatto") torna da solo dopo 3s (l'AI gira in cloud).
  React.useEffect(() => {
    if (fase !== 'fatto') return;
    const t = setTimeout(() => chiudi(), 3000);
    return () => clearTimeout(t);
  }, [fase, chiudi]);

  // ── upload robusto: 3 tentativi con backoff (poco campo in cantiere) ────────
  const inviaFile = React.useCallback(
    async (f: File) => {
      setFase('invio');
      setErrMsg(null);
      let lastErr: string | null = null;
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        try {
          const fd = new FormData();
          fd.append('foto', f);
          if (cantiereId) fd.append('cantiereId', cantiereId);
          const resp = await fetch('/api/kantiere/spese/upload', { method: 'POST', body: fd });
          if (resp.ok) {
            setFase('fatto');
            router.refresh();
            return;
          }
          if (NON_RIPROVABILE.has(resp.status)) {
            lastErr =
              resp.status === 413
                ? 'Foto troppo grande. Riprova con uno scatto più leggero.'
                : 'Non è stato possibile registrare la spesa. Riprova.';
            break; // inutile ritentare
          }
          lastErr = 'Invio non riuscito. Riprovo…';
        } catch {
          lastErr = 'Connessione assente o instabile.';
        }
        // backoff crescente prima del prossimo tentativo
        if (tentativo < 2) await sleep(900 * (tentativo + 1));
      }
      setErrMsg(lastErr ?? 'Invio non riuscito.');
      setFase('errore');
    },
    [cantiereId, router],
  );

  const onFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const original = e.target.files?.[0];
      e.target.value = '';
      if (!original) return;
      // Comprimi (2048px / q0.88) prima dell'invio: meno banda dal cantiere.
      const compresso = await compressImage(original, { quality: 0.88 });
      revokePreview();
      setPreview(URL.createObjectURL(compresso));
      setFile(compresso);
      void inviaFile(compresso);
    },
    [revokePreview, inviaFile],
  );

  // ── ENTRY: bottone di apertura ──────────────────────────────────────────────
  if (!aperto) {
    if (triggerVariant === 'fab-top') {
      return (
        <button
          type="button"
          onClick={() => setAperto(true)}
          aria-label="Aggiungi spesa"
          className="hide-on-sheet fixed z-30 inline-flex h-10 items-center gap-1.5 rounded-full border border-primary/30 bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-soft active:scale-95 transition-transform"
          style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)', right: '3.6rem' }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          Spesa
        </button>
      );
    }
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

  const titoloFase =
    fase === 'cantiere' ? 'A quale cantiere?' : fase === 'foto' ? 'Scatta la ricevuta' : 'Nuova spesa';

  return (
    <div
      className="fixed inset-0 z-[35] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
      }}
    >
      {/* HEADER */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {fase === 'foto' ? (
            <button
              type="button"
              onClick={() => setFase('cantiere')}
              aria-label="Torna al cantiere"
              className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          <p className="truncate text-base font-semibold text-foreground">{titoloFase}</p>
        </div>
        <button
          type="button"
          onClick={chiudi}
          aria-label="Chiudi"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
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

      {/* ── STEP 1: CANTIERE ────────────────────────────────────────────────── */}
      {fase === 'cantiere' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {!ricercaAperta && (turnoCantiereId || cantiereId) ? (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary/80">
                  Stai lavorando su
                </p>
                <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 truncate">{nomeCantiereScelto ?? 'Cantiere del turno'}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setRicercaAperta(true)}
                  className="mt-3 text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Cambia cantiere
                </button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <CantiereSearchList
                cantieri={cantieri}
                selectedId={cantiereId}
                autoFocus={!turnoCantiereId}
                onPick={(id) => setCantiereId(id)}
                emptyLabel="Nessun cantiere disponibile."
              />
            </div>
          )}

          {/* footer: continua (con nome cantiere) + assegna dopo */}
          <div className="shrink-0 border-t border-border px-4 pb-3 pt-2">
            <Button
              type="button"
              size="lg"
              className="w-full py-3.5 text-base font-semibold"
              disabled={!cantiereId}
              onClick={() => setFase('foto')}
            >
              {cantiereId ? `Continua · ${nomeCantiereScelto ?? 'Cantiere'}` : 'Scegli un cantiere'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setCantiereId(null);
                setFase('foto');
              }}
              className="mt-2 w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Assegna il cantiere dopo →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── STEP 2: FOTO ────────────────────────────────────────────────────── */}
      {fase === 'foto' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* chip cantiere scelto */}
          <div className="shrink-0 px-4 pt-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate font-medium text-foreground">
                  {nomeCantiereScelto ?? 'Da assegnare'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFase('cantiere')}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                Cambia
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Receipt className="h-8 w-8" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">
              Scatta o allega la foto dello scontrino. Viene caricata subito; l’analisi la fa il
              sistema in automatico.
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
        </div>
      ) : null}

      {/* ── STEP 3: INVIO (attesa SOLO dell'upload) ─────────────────────────── */}
      {fase === 'invio' ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center"
          role="status"
          aria-live="polite"
        >
          {preview ? (
            <div className="relative h-44 w-36 overflow-hidden rounded-xl border border-border bg-muted/40 shadow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="h-full w-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-primary/10" aria-hidden="true" />
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden="true" />
            <p className="text-lg font-semibold text-foreground">Invio della foto in corso…</p>
            <p className="text-sm text-muted-foreground">
              Tieni il telefono acceso ancora un attimo
            </p>
          </div>
        </div>
      ) : null}

      {/* ── ERRORE upload ───────────────────────────────────────────────────── */}
      {fase === 'errore' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{errMsg ?? 'Invio non riuscito. Riprova.'}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              type="button"
              size="lg"
              className="w-full py-3.5"
              onClick={() => file && void inviaFile(file)}
              disabled={!file}
            >
              <Cloud className="mr-2 h-5 w-5" aria-hidden="true" />
              Riprova invio
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full py-3.5"
              onClick={() => {
                revokePreview();
                setFile(null);
                setErrMsg(null);
                setFase('foto');
              }}
            >
              <Camera className="mr-2 h-5 w-5" aria-hidden="true" />
              Rifai foto
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── FATTO: conferma premium ─────────────────────────────────────────── */}
      {fase === 'fatto' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden="true"
              className="animate-success-glow absolute inset-[-45%] rounded-full bg-emerald-400/30 blur-xl"
            />
            <span
              aria-hidden="true"
              className="animate-success-ring absolute inset-0 rounded-full bg-emerald-400/40"
            />
            <span
              aria-hidden="true"
              className="animate-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50 [animation-delay:0.16s]"
            />
            <span className="animate-success-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.5)]">
              <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
            </span>
          </span>
          <div className="animate-fade-up space-y-1.5">
            <p className="text-lg font-semibold text-foreground">Caricamento completato</p>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              La foto è al sicuro. L’analisi viene fatta in cloud: tra poco trovi la spesa compilata
              nella pagina <span className="font-medium text-foreground">Spese</span>.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <Button type="button" size="lg" className="w-full py-3.5" onClick={reset}>
              <Receipt className="mr-2 h-5 w-5" aria-hidden="true" />
              Altra ricevuta
            </Button>
            <Button type="button" variant="outline" size="lg" className="w-full py-3.5" onClick={chiudi}>
              Chiudi
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
