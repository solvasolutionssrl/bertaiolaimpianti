'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Save,
  X,
} from 'lucide-react';

import { Button } from '@kommessa/ui';

import { MobileBackButton } from '../../../../_components/mobile-back-button';

import {
  DatiCommessaFields,
  ReferentiFields,
  TipologieSection,
  FrozenFolderNotice,
  RiepilogoConferma,
  OfflineNotice,
  type SetValue,
} from '../../../../../_components/commessa-editor/fields';
import type {
  CommessaEditorValue,
  ResponsabileOption,
} from '../../../../../_components/commessa-editor/types';
import type {
  TipologiaVoce,
  TipologiaPreset,
} from '../../../../../_components/aggiungi-tipologie-dialog';
import type { VoiceReviewData } from '../../../../../_components/voice-review';
import { VoiceRecorder } from '../../../../../_components/voice-recorder';
import { aggiornaCommessaCompleta } from '../../../../../_actions/aggiorna-commessa-completa';
import { useOnline } from '../../../../../_lib/use-online';

type Step = 1 | 2 | 3;

export function EditWizardMobile({
  commessaId,
  codiceInterno,
  clienteNome,
  nomeCartella,
  initial,
  responsabili,
  vociPresenti,
  voci,
  presets,
}: {
  commessaId: string;
  codiceInterno: string;
  clienteNome: string | null;
  nomeCartella: string;
  initial: CommessaEditorValue;
  responsabili: ResponsabileOption[];
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [step, setStep] = React.useState<Step>(1);
  const [value, setValue] = React.useState<CommessaEditorValue>(initial);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onChange: SetValue = (patch) => setValue((v) => ({ ...v, ...patch }));

  const tornaIndietro = () => router.push(`/mobile/commessa/${commessaId}`);

  const salva = () => {
    setError(null);
    start(async () => {
      const res = await aggiornaCommessaCompleta({
        commessaId,
        descrizioneFinale: value.descrizioneFinale.trim(),
        indirizzoCantiere: value.indirizzoCantiere.trim() || null,
        noteIniziali: value.noteIniziali,
        isCritica: value.isCritica,
        stato: value.stato,
        responsabileId: value.responsabileId,
        referenti: value.referenti
          .filter((r) => r.nome.trim().length > 0)
          .map((r) => ({
            nome: r.nome.trim(),
            ruolo: r.ruolo.trim() || null,
            telefono: r.telefono.trim() || null,
            email: r.email.trim() || null,
          })),
      });
      if (res.ok) {
        router.push(`/mobile/commessa/${commessaId}`);
        router.refresh();
        return;
      }
      setError(res.error);
    });
  };

  return (
    <div className="min-h-dvh bg-canvas-mobile pb-28">
      {/* Header — stessa impostazione della scheda commessa: back a pill in
          alto a sx (MobileBackButton) con un filo d'aria dal bordo alto. */}
      <header className="bg-primary px-4 pb-4 pt-5 text-primary-foreground">
        <MobileBackButton tone="dark" label="Annulla" onClick={tornaIndietro} />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">
          {codiceInterno}
          {clienteNome ? ` · ${clienteNome}` : ''}
        </p>
        <h1 className="mt-0.5 text-lg font-semibold leading-snug">
          Modifica commessa
        </h1>
        <StepIndicator step={step} />
      </header>

      <main className="space-y-4 px-4 pt-4">
        {!online ? <OfflineNotice /> : null}

        {step === 1 ? (
          <>
            <FrozenFolderNotice nomeCartella={nomeCartella} />
            <DatiCommessaFields
              value={value}
              onChange={onChange}
              responsabili={responsabili}
              online={online}
              voiceSlot={
                <VoceAggiornaSlot
                  online={online}
                  onMerge={(suggested, transcript) =>
                    setValue((v) => mergeVoce(v, suggested, transcript))
                  }
                />
              }
            />
            <section className="rounded-lg border border-border bg-card p-4">
              <ReferentiFields value={value} onChange={onChange} />
            </section>
          </>
        ) : null}

        {step === 2 ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <TipologieSection
              commessaId={commessaId}
              vociPresenti={vociPresenti}
              voci={voci}
              presets={presets}
              variant="sheet"
            />
          </section>
        ) : null}

        {step === 3 ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">Conferma le modifiche</p>
            <RiepilogoConferma value={value} responsabili={responsabili} />
            {error ? (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </section>
        ) : null}
      </main>

      {/* Barra azioni fissa.
          - Su questa rotta la tab bar della shell è nascosta (vedi
            ROTTE_SENZA_NAV in mobile/_components/bottom-nav-shell.tsx): era
            `fixed bottom-0 z-40` opaca e copriva Avanti/Salva.
          - Sfondo OPACO e niente backdrop-blur: su iOS un `fixed` con
            backdrop-filter si stacca durante lo scroll inerziale (stesso
            motivo per cui il bottom-nav è opaco).
          - pb con safe-area per l'home indicator iPhone. */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background shadow-[0_-10px_26px_-14px_rgba(15,30,66,0.28)]">
        <div className="mx-auto flex max-w-screen-sm items-center gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={pending}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Indietro
            </Button>
          ) : null}
          {step < 3 ? (
            <Button
              type="button"
              className="min-h-[48px] flex-1"
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Avanti
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-[48px] flex-1"
              onClick={salva}
              disabled={pending || !online}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salva
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ['Dati', 'Tipologie', 'Conferma'];
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={[
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                active
                  ? 'bg-primary-foreground text-primary'
                  : done
                    ? 'bg-primary-foreground/40 text-primary-foreground'
                    : 'bg-primary-foreground/15 text-primary-foreground/70',
              ].join(' ')}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <span
              className={
                'text-[11px] font-medium ' +
                (active ? 'text-primary-foreground' : 'text-primary-foreground/60')
              }
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Slot voce opzionale: detta per aggiornare. Online-only. Merge NON
 * distruttivo (riempie i campi vuoti, accoda il dettato alle note).
 */
function VoceAggiornaSlot({
  online,
  onMerge,
}: {
  online: boolean;
  onMerge: (suggested: VoiceReviewData, transcript: string) => void;
}) {
  const [recording, setRecording] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onRecorded = async (blob: Blob) => {
    setRecording(false);
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      const ext = blob.type.includes('mp4') || blob.type.includes('m4a')
        ? 'm4a'
        : blob.type.includes('ogg')
          ? 'ogg'
          : 'webm';
      fd.append('audio', blob, `voicenote.${ext}`);
      fd.append('mode', 'full');
      const res = await fetch('/api/voice/extract', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Trascrizione non riuscita');
      const data = (await res.json()) as {
        transcript: string;
        suggested?: VoiceReviewData;
      };
      onMerge(data.suggested ?? {}, data.transcript ?? '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore trascrizione');
    } finally {
      setBusy(false);
    }
  };

  if (!online) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        Offline: dettatura e match AI non disponibili. Esci e riprova quando
        torni online.
      </p>
    );
  }

  if (recording) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-2">
        <VoiceRecorder
          onRecorded={onRecorded}
          onCancel={() => setRecording(false)}
          maxDurationSec={120}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] w-full"
        onClick={() => setRecording(true)}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? 'Trascrivo…' : 'Detta per aggiornare (opzionale)'}
      </Button>
      {err ? (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <X className="h-3 w-3" aria-hidden="true" />
          {err}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        La dettatura riempie i campi vuoti e aggiunge il testo alle note. Non
        sovrascrive quello che hai già scritto.
      </p>
    </div>
  );
}

/** Merge non distruttivo dei campi estratti dall'AI nello stato editor. */
function mergeVoce(
  v: CommessaEditorValue,
  suggested: VoiceReviewData,
  transcript: string,
): CommessaEditorValue {
  const next: CommessaEditorValue = { ...v };
  if (!next.descrizioneFinale.trim() && suggested.descrizione) {
    next.descrizioneFinale = suggested.descrizione;
  }
  if (!next.indirizzoCantiere.trim() && suggested.indirizzo) {
    next.indirizzoCantiere = [suggested.indirizzo, suggested.citta]
      .filter(Boolean)
      .join(' ');
  }
  const t = transcript.trim();
  if (t.length > 0) {
    next.noteIniziali = next.noteIniziali.trim()
      ? `${next.noteIniziali.trim()}\n\n${t}`
      : t;
  }
  if (suggested.referenti && suggested.referenti.length > 0) {
    const esistenti = new Set(
      next.referenti.map((r) => `${r.nome.trim().toLowerCase()}`),
    );
    const nuovi = suggested.referenti
      .filter((r) => r.nome && !esistenti.has(r.nome.trim().toLowerCase()))
      .map((r) => ({
        nome: r.nome,
        ruolo: r.ruolo ?? '',
        telefono: r.telefono ?? '',
        email: r.email ?? '',
      }));
    next.referenti = [...next.referenti, ...nuovi];
  }
  return next;
}
