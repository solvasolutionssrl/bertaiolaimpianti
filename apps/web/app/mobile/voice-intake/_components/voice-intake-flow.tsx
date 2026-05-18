'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Loader2,
  Sparkles,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@impiantixplus/ui';

import { VoiceRecorder } from '../../../_components/voice-recorder';
import {
  VoiceReview,
  type VoiceReviewData,
} from '../../../_components/voice-review';
import { creaCommessa } from '../../../_actions/crea-commessa';

export interface VoceOption {
  id: number;
  nome: string;
  default: boolean;
}

interface FlowProps {
  voci: VoceOption[];
  vociDefault: number[];
}

type Phase =
  | 'record'
  | 'uploading'
  | 'transcribing'
  | 'extracting'
  | 'review'
  | 'confirm'
  | 'creating'
  | 'done';

interface IntakeState {
  phase: Phase;
  transcript: string;
  data: VoiceReviewData;
  previewReason?: string;
  error?: string | null;
  result?: {
    commessaId: string;
    codiceInterno: string;
    nomeCartella: string;
    cloudFolderPath: string;
  };
}

const SUGGESTION_EXAMPLES = [
  'Ho fatto un sopralluogo da Mario Rossi via Roma 12 Treviso, vuole sostituire la caldaia e rifare due bagni completi. Telefono 333 1234567.',
  'Cliente Bianchi Lucia, via Garibaldi 8 Castelfranco Veneto, mi ha chiesto un fotovoltaico 6 kilowatt con accumulo. Email bianchi.lucia@gmail.com.',
  'Sono dalla ditta Edilizia Tre, cantiere a Conegliano via Industria 22, dobbiamo fare pavimento radiante e centrale termica per un duplex nuovo, superbonus.',
];

export function VoiceIntakeFlow({ voci, vociDefault }: FlowProps) {
  const router = useRouter();
  const [state, setState] = React.useState<IntakeState>({
    phase: 'record',
    transcript: '',
    data: {},
  });
  const [tipsOpen, setTipsOpen] = React.useState(false);

  const stepNum =
    state.phase === 'record'
      ? 1
      : state.phase === 'review' || state.phase === 'uploading' ||
          state.phase === 'transcribing' || state.phase === 'extracting'
        ? 2
        : 3;

  // ---------- Schermo 1: Record → POST /api/voice/extract ----------
  const handleRecorded = async (blob: Blob) => {
    setState((s) => ({ ...s, phase: 'uploading', error: null }));
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voicenote.webm');
      fd.append('mode', 'full');
      setState((s) => ({ ...s, phase: 'transcribing' }));
      const t0 = performance.now();
      const res = await fetch('/api/voice/extract', { method: 'POST', body: fd });
      const t1 = performance.now();
      setState((s) => ({ ...s, phase: 'extracting' }));
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          j.error ?? `Trascrizione fallita (HTTP ${res.status})`,
        );
      }
      const data = (await res.json()) as {
        transcript: string;
        suggested?: VoiceReviewData;
        _preview?: boolean;
        _previewReason?: string;
      };
      console.info(
        `[voice-intake] extraction roundtrip ${(t1 - t0).toFixed(0)}ms`,
      );
      setState({
        phase: 'review',
        transcript: data.transcript,
        data: data.suggested ?? {},
        previewReason: data._preview ? data._previewReason : undefined,
        error: null,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: 'record',
        error: e instanceof Error ? e.message : 'Errore trascrizione',
      }));
    }
  };

  // ---------- Schermo 2: Regen name AI ----------
  const regenerateName = async (input: {
    voci: number[];
    cliente?: string;
    note?: string;
  }) => {
    const res = await fetch('/api/suggerisci-nome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { proposta: string; alternatives: string[] };
  };

  // ---------- Schermo 2 → 3: Conferma e procedi al final ----------
  const handleReviewConfirm = (data: VoiceReviewData) => {
    setState((s) => ({ ...s, data, phase: 'confirm' }));
  };

  // ---------- Schermo 3: Crea commessa ----------
  const handleCreate = async () => {
    const d = state.data;
    if (!d.ragione_sociale?.trim()) {
      setState((s) => ({
        ...s,
        error:
          'Manca il nome cliente. Torna indietro e modifica la card "Cliente".',
      }));
      return;
    }
    if (!d.descrizione?.trim()) {
      setState((s) => ({
        ...s,
        error: 'Manca la descrizione cartella.',
      }));
      return;
    }

    setState((s) => ({ ...s, phase: 'creating', error: null }));
    try {
      // Voci finali: sempre includi le default (Sezione A) + quelle estratte/confermate
      const vociFromAi = (d.voci_ids ?? []).filter(
        (id) => !vociDefault.includes(id),
      );

      const res = await creaCommessa({
        clienteId: undefined, // sempre nuovo cliente nel flow voice (può cercare in seguito)
        clienteNew: {
          ragione_sociale: d.ragione_sociale.trim(),
          tipo: d.tipo ?? 'persona_fisica', // dedotto da AI (azienda se trova S.r.l./Comune di/ecc.)
          indirizzo: d.indirizzo || null,
          citta: d.citta || null,
          telefoni: d.telefono ? [d.telefono] : [],
          email: d.email ? [d.email] : [],
          note: d.note || null,
        },
        voci: vociFromAi,
        descrizioneFinale: d.descrizione.trim(),
        note: d.note || null,
        indirizzoCantiere: d.indirizzo || null,
      });
      if (!res.ok) {
        setState((s) => ({ ...s, phase: 'confirm', error: res.error }));
        return;
      }
      setState((s) => ({
        ...s,
        phase: 'done',
        result: {
          commessaId: res.data.commessaId,
          codiceInterno: res.data.codiceInterno,
          nomeCartella: res.data.nomeCartella,
          cloudFolderPath: res.data.cloudFolderPath,
        },
        error: null,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        phase: 'confirm',
        error: e instanceof Error ? e.message : 'Creazione commessa fallita',
      }));
    }
  };

  // ---------- Header / progress ----------
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-screen-sm flex-col gap-5 px-4 pb-32 pt-6">
      <header className="space-y-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          aria-label="Torna indietro"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Indietro
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Dettato vocale
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea una commessa parlando. Il resto lo facciamo noi.
          </p>
        </div>

        {/* Progress 1/3 · 2/3 · 3/3 */}
        <ol
          aria-label="Avanzamento"
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
        >
          {[
            { n: 1, label: 'Registra' },
            { n: 2, label: 'Rivedi' },
            { n: 3, label: 'Conferma' },
          ].map((s, i, arr) => {
            const done = s.n < stepNum;
            const current = s.n === stepNum;
            return (
              <React.Fragment key={s.n}>
                <li
                  aria-current={current ? 'step' : undefined}
                  className={[
                    'flex items-center gap-1.5',
                    done
                      ? 'text-success'
                      : current
                        ? 'text-primary'
                        : 'text-muted-foreground',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px]',
                      done
                        ? 'border-success bg-success/15'
                        : current
                          ? 'border-primary bg-primary-soft'
                          : 'border-border',
                    ].join(' ')}
                  >
                    {done ? '✓' : s.n}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </li>
                {i < arr.length - 1 ? (
                  <span
                    className={[
                      'h-0.5 flex-1 rounded-full',
                      s.n < stepNum ? 'bg-success/60' : 'bg-border',
                    ].join(' ')}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </ol>
      </header>

      {/* Error banner globale */}
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* -------- Phase RECORD -------- */}
      {state.phase === 'record' ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
          <VoiceRecorder
            onRecorded={handleRecorded}
            maxDurationSec={180}
            size="xl"
            showWaveform
          />
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Tap per iniziare. Parla con calma di{' '}
            <strong className="text-foreground">cliente</strong>,{' '}
            <strong className="text-foreground">lavoro</strong>,{' '}
            <strong className="text-foreground">indirizzo</strong> e{' '}
            <strong className="text-foreground">note</strong>.
          </p>

          <div className="grid w-full max-w-xs grid-cols-2 gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-[48px]"
              onClick={() => router.back()}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-[48px]"
              onClick={() => setTipsOpen(true)}
            >
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              Suggerimenti
            </Button>
          </div>
        </section>
      ) : null}

      {/* -------- Phase LOADING (uploading/transcribing/extracting) -------- */}
      {state.phase === 'uploading' ||
      state.phase === 'transcribing' ||
      state.phase === 'extracting' ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
          <div className="relative">
            <span className="absolute inset-0 -m-4 animate-ping rounded-full bg-primary/20" />
            <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-glow-brand">
              <Loader2 className="h-10 w-10 animate-spin" aria-hidden="true" />
            </div>
          </div>
          <p className="text-center text-base font-medium">
            {state.phase === 'uploading'
              ? 'Carico l’audio…'
              : state.phase === 'transcribing'
                ? 'Trascrivo con Whisper…'
                : 'Estraggo i campi con AI…'}
          </p>
          <p className="text-xs text-muted-foreground">
            Tempo tipico: 3-8 secondi.
          </p>
        </section>
      ) : null}

      {/* -------- Phase REVIEW -------- */}
      {state.phase === 'review' ? (
        <VoiceReview
          transcript={state.transcript}
          data={state.data}
          voci={voci}
          onConfirm={handleReviewConfirm}
          onRedo={() =>
            setState({
              phase: 'record',
              transcript: '',
              data: {},
              error: null,
            })
          }
          onRegenerateName={regenerateName}
          previewReason={state.previewReason}
        />
      ) : null}

      {/* -------- Phase CONFIRM -------- */}
      {state.phase === 'confirm' || state.phase === 'creating' ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Conferma e crea</h2>

          <div className="space-y-3 rounded-lg border-2 border-primary/20 bg-card p-4 shadow-soft-md">
            <SummaryRow label="Cliente" value={state.data.ragione_sociale} />
            <SummaryRow label="Indirizzo" value={state.data.indirizzo} />
            <SummaryRow label="Città" value={state.data.citta} />
            <SummaryRow label="Telefono" value={state.data.telefono} />
            <SummaryRow label="Email" value={state.data.email} />
            <SummaryRow
              label="Voci"
              value={
                state.data.voci_ids && state.data.voci_ids.length > 0
                  ? `${state.data.voci_ids.length} voci selezionate`
                  : undefined
              }
            />
            <SummaryRow
              label="Descrizione"
              value={state.data.descrizione}
              mono
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="text-muted-foreground">Anteprima cartella:</p>
            <code className="mt-1 block break-all font-mono text-foreground">
              /
              {anteprimaCartella(
                state.data.ragione_sociale ?? 'Cliente',
                state.data.descrizione ?? 'Commessa',
              )}
              /
            </code>
          </div>

          <Button
            size="lg"
            className="min-h-[56px] w-full text-base"
            onClick={handleCreate}
            disabled={state.phase === 'creating'}
          >
            {state.phase === 'creating' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Creo la commessa…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Crea commessa
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setState((s) => ({ ...s, phase: 'review' }))}
            disabled={state.phase === 'creating'}
          >
            Torna a modificare
          </Button>
        </section>
      ) : null}

      {/* -------- Phase DONE -------- */}
      {state.phase === 'done' && state.result ? (
        <section className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border-2 border-success/40 bg-success/10 p-4">
            <CheckCircle2
              className="h-8 w-8 text-success"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-success">Commessa creata.</p>
              <p className="text-xs text-success/80">
                Hai dettato tutto in pochi secondi.
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Codice:</span>{' '}
              <strong className="font-mono">
                {state.result.codiceInterno}
              </strong>
            </p>
            <p>
              <span className="text-muted-foreground">Cartella:</span>{' '}
              <code className="break-all font-mono">
                {state.result.nomeCartella}
              </code>
            </p>
            <p className="text-xs text-muted-foreground">
              Percorso:{' '}
              <code className="break-all">{state.result.cloudFolderPath}</code>
            </p>
          </div>

          <Button
            size="lg"
            className="min-h-[52px] w-full"
            onClick={() =>
              router.push(`/mobile/commessa/${state.result!.commessaId}`)
            }
          >
            Apri commessa
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] w-full"
            onClick={() => {
              setState({
                phase: 'record',
                transcript: '',
                data: {},
                error: null,
              });
            }}
          >
            Nuovo dettato
          </Button>
        </section>
      ) : null}

      {/* -------- Tips dialog -------- */}
      <Dialog open={tipsOpen} onOpenChange={setTipsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-accent" aria-hidden="true" />
              Suggerimenti
            </DialogTitle>
            <DialogDescription>
              Come parlare per fare un dettato efficace.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm">
            <li className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esempio 1
              </p>
              <p className="italic">&ldquo;{SUGGESTION_EXAMPLES[0]}&rdquo;</p>
            </li>
            <li className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esempio 2
              </p>
              <p className="italic">&ldquo;{SUGGESTION_EXAMPLES[1]}&rdquo;</p>
            </li>
            <li className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Esempio 3
              </p>
              <p className="italic">&ldquo;{SUGGESTION_EXAMPLES[2]}&rdquo;</p>
            </li>
            <li className="text-xs text-muted-foreground">
              Tip · Parla 30-90 secondi, frasi corte, dai dettagli chiari (via,
              civico, città, numeri di telefono).
            </li>
          </ul>
          <DialogFooter>
            <Button onClick={() => setTipsOpen(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          'text-right text-sm',
          mono ? 'font-mono' : '',
          value ? 'text-foreground' : 'italic text-muted-foreground',
        ].join(' ')}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function anteprimaCartella(rag: string, desc: string): string {
  const seg1 = sanitize(rag.trim().split(/\s+/).slice(-1)[0] ?? rag);
  const seg2 = new Date().toISOString().slice(0, 10);
  const seg3 = sanitize(desc);
  return `${seg1 || 'Cliente'}_${seg2}_${seg3 || 'Commessa'}`;
}

function sanitize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 30);
}
