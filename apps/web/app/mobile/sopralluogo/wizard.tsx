'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Sparkles,
  CheckCircle2,
  Mic,
  Wand2,
} from 'lucide-react';

import {
  Button,
  Input,
  Label,
  StatoBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@impiantixplus/ui';

import { creaCommessa } from '../../_actions/crea-commessa';
import { VoiceRecorder } from '../../_components/voice-recorder';

interface VoiceSuggested {
  ragione_sociale?: string;
  telefono?: string;
  email?: string;
  indirizzo?: string;
  voci_ids?: number[];
  descrizione?: string;
  note?: string;
  tag_suggeriti?: string[];
}

export interface ClienteOption {
  id: string;
  nome: string;
  indirizzo: string | null;
  citta: string | null;
}

export interface VoceCatalogoOption {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
}

export interface PresetOption {
  id: string;
  nome: string;
  vociIds: number[];
}

interface WizardProps {
  clienti: ClienteOption[];
  voci: VoceCatalogoOption[];
  preset: PresetOption[];
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface State {
  cliente: {
    id?: string;
    nome: string;
    tipo: 'persona_fisica' | 'azienda';
    indirizzo: string;
    citta: string;
    telefono: string;
    email: string;
  };
  capture: { nota: string };
  vociSelezionate: Set<number>; // include sempre quelle di default
  descrizioneFinale: string;
  descrizioneAlternative: string[];
}

const initialState = (vociDefault: number[]): State => ({
  cliente: {
    nome: '',
    tipo: 'persona_fisica',
    indirizzo: '',
    citta: '',
    telefono: '',
    email: '',
  },
  capture: { nota: '' },
  vociSelezionate: new Set(vociDefault),
  descrizioneFinale: '',
  descrizioneAlternative: [],
});

export function SopralluogoWizard({ clienti, voci, preset }: WizardProps) {
  const router = useRouter();
  const vociDefault = React.useMemo(
    () => voci.filter((v) => v.default).map((v) => v.id),
    [voci],
  );
  const [step, setStep] = React.useState<Step>(1);
  const [state, setState] = React.useState<State>(() => initialState(vociDefault));
  const [aiPending, setAiPending] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    commessaId: string;
    codiceInterno: string;
    nomeCartella: string;
    cloudFolderPath: string;
  } | null>(null);

  // ------ navigation ------
  const next = () => setStep((s) => Math.min(s + 1, 7) as Step);
  const back = () => setStep((s) => Math.max(s - 1, 1) as Step);

  const canGoNext = (): boolean => {
    switch (step) {
      case 1:
        return state.cliente.nome.trim().length >= 2;
      case 2:
        return true;
      case 3:
        return state.vociSelezionate.size > 0;
      case 4:
        return true;
      case 5:
        return state.descrizioneFinale.trim().length > 0;
      default:
        return true;
    }
  };

  // ------ step 5: AI naming via /api/suggerisci-nome ------
  const handleGenAi = async () => {
    setAiPending(true);
    setError(null);
    try {
      const res = await fetch('/api/suggerisci-nome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente: state.cliente.nome,
          voci: [...state.vociSelezionate],
          note: state.capture.nota || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { proposta, alternatives } = (await res.json()) as {
        proposta: string;
        alternatives: string[];
      };
      setState((s) => ({
        ...s,
        descrizioneFinale: proposta,
        descrizioneAlternative: alternatives ?? [],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generazione nome fallita');
    } finally {
      setAiPending(false);
    }
  };

  // Auto-gen al primo ingresso su step 5
  React.useEffect(() => {
    if (step === 5 && state.descrizioneFinale === '' && !aiPending) {
      void handleGenAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ------ step 6: submit ------
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await creaCommessa({
        clienteId: state.cliente.id,
        clienteNew: state.cliente.id
          ? undefined
          : {
              ragione_sociale: state.cliente.nome.trim(),
              tipo: state.cliente.tipo,
              indirizzo: state.cliente.indirizzo || null,
              citta: state.cliente.citta || null,
              telefoni: state.cliente.telefono ? [state.cliente.telefono] : [],
              email: state.cliente.email ? [state.cliente.email] : [],
              note: state.capture.nota || null,
            },
        voci: [...state.vociSelezionate].filter(
          (id) => !vociDefault.includes(id),
        ),
        descrizioneFinale: state.descrizioneFinale.trim(),
        note: state.capture.nota || null,
        indirizzoCantiere: state.cliente.indirizzo || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        commessaId: res.data.commessaId,
        codiceInterno: res.data.codiceInterno,
        nomeCartella: res.data.nomeCartella,
        cloudFolderPath: res.data.cloudFolderPath,
      });
      setStep(7);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creazione commessa fallita');
    } finally {
      setSubmitting(false);
    }
  };

  // ------ render ------
  return (
    <div className="flex flex-col gap-4">
      <ProgressBar step={step} />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {step === 1 && (
        <Step1Cliente state={state} setState={setState} clienti={clienti} />
      )}
      {step === 2 && (
        <Step2Capture
          state={state}
          setState={setState}
          vociDefault={vociDefault}
        />
      )}
      {step === 3 && (
        <Step3Voci
          state={state}
          setState={setState}
          voci={voci}
          preset={preset}
          vociDefault={vociDefault}
        />
      )}
      {step === 4 && <Step4Riepilogo state={state} voci={voci} />}
      {step === 5 && (
        <Step5Nome
          state={state}
          setState={setState}
          aiPending={aiPending}
          onRegen={handleGenAi}
        />
      )}
      {step === 6 && (
        <Step6Conferma
          state={state}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
      {step === 7 && result && (
        <Step7Success
          result={result}
          onOpen={() => router.push(`/mobile/commessa/${result.commessaId}`)}
        />
      )}

      {step < 6 && (
        <div className="mt-2 flex gap-2 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="min-h-[48px] flex-1"
            onClick={back}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Indietro
          </Button>
          <Button
            size="lg"
            className="min-h-[48px] flex-1"
            onClick={next}
            disabled={!canGoNext()}
          >
            Avanti
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Sub-components (step screens)
// ---------------------------------------------------------------------

function ProgressBar({ step }: { step: Step }) {
  const labels = [
    'Cliente',
    'Cattura',
    'Voci',
    'Riepilogo',
    'Nome',
    'Conferma',
    'Fatto',
  ];
  return (
    <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        const current = n === step;
        return (
          <React.Fragment key={l}>
            <div
              className={
                done
                  ? 'flex items-center gap-1 text-stato-aperta'
                  : current
                    ? 'flex items-center gap-1 text-primary'
                    : 'flex items-center gap-1 text-muted-foreground'
              }
            >
              <span
                className={
                  'inline-flex h-5 w-5 items-center justify-center rounded-full border ' +
                  (done
                    ? 'border-stato-aperta bg-stato-aperta/10'
                    : current
                      ? 'border-primary bg-primary/10'
                      : 'border-border')
                }
              >
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : n}
              </span>
              <span className="hidden sm:inline">{l}</span>
            </div>
            {i < labels.length - 1 ? (
              <div className="h-px flex-1 bg-border" />
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Step1Cliente({
  state,
  setState,
  clienti,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  clienti: ClienteOption[];
}) {
  const [query, setQuery] = React.useState('');
  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clienti.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 5);
  }, [query, clienti]);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">1 · Anagrafica cliente</h2>

      <div className="space-y-2">
        <Label htmlFor="cli-nome">Nome / Ragione sociale</Label>
        <Input
          id="cli-nome"
          autoComplete="off"
          className="h-12 text-base"
          value={state.cliente.nome}
          onChange={(e) => {
            setQuery(e.target.value);
            setState((s) => ({
              ...s,
              cliente: { ...s.cliente, id: undefined, nome: e.target.value },
            }));
          }}
        />
        {matches.length > 0 ? (
          <ul className="rounded-md border border-border bg-card text-sm shadow-sm">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      cliente: {
                        ...s.cliente,
                        id: m.id,
                        nome: m.nome,
                        indirizzo: m.indirizzo ?? s.cliente.indirizzo,
                        citta: m.citta ?? s.cliente.citta,
                      },
                    }));
                    setQuery('');
                  }}
                >
                  <span className="font-medium">{m.nome}</span>
                  {m.citta ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.citta}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!state.cliente.id ? (
        <div className="space-y-2">
          <Label htmlFor="cli-tipo">Tipo</Label>
          <select
            id="cli-tipo"
            className="block h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={state.cliente.tipo}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                cliente: {
                  ...s.cliente,
                  tipo: e.target.value as 'persona_fisica' | 'azienda',
                },
              }))
            }
          >
            <option value="persona_fisica">Persona fisica</option>
            <option value="azienda">Azienda / Ente</option>
          </select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="cli-indir">Indirizzo intervento</Label>
        <Input
          id="cli-indir"
          className="h-12 text-base"
          value={state.cliente.indirizzo}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              cliente: { ...s.cliente, indirizzo: e.target.value },
            }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cli-citta">Città</Label>
        <Input
          id="cli-citta"
          className="h-12 text-base"
          value={state.cliente.citta}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              cliente: { ...s.cliente, citta: e.target.value },
            }))
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="cli-tel">Telefono</Label>
          <Input
            id="cli-tel"
            inputMode="tel"
            className="h-12 text-base"
            value={state.cliente.telefono}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                cliente: { ...s.cliente, telefono: e.target.value },
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cli-email">Email</Label>
          <Input
            id="cli-email"
            type="email"
            inputMode="email"
            className="h-12 text-base"
            value={state.cliente.email}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                cliente: { ...s.cliente, email: e.target.value },
              }))
            }
          />
        </div>
      </div>

      {state.cliente.id ? (
        <p className="text-xs text-muted-foreground">
          Cliente esistente selezionato dall'archivio.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nuovo cliente: verrà creato in archivio alla conferma.
        </p>
      )}
    </section>
  );
}

function Step2Capture({
  state,
  setState,
  vociDefault,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  vociDefault: number[];
}) {
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [voicePending, setVoicePending] = React.useState<
    'idle' | 'transcribing' | 'extracting'
  >('idle');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [voiceResult, setVoiceResult] = React.useState<{
    transcript: string;
    suggested: VoiceSuggested;
    preview: boolean;
    previewReason?: string;
  } | null>(null);

  const handleRecorded = async (blob: Blob) => {
    setVoiceError(null);
    setVoicePending('transcribing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voicenote.webm');
      fd.append('mode', 'full');
      const res = await fetch('/api/voice/extract', {
        method: 'POST',
        body: fd,
      });
      setVoicePending('extracting');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ??
            `Trascrizione fallita (HTTP ${res.status})`,
        );
      }
      const data = (await res.json()) as {
        transcript: string;
        suggested?: VoiceSuggested;
        _preview?: boolean;
        _previewReason?: string;
      };
      setVoiceResult({
        transcript: data.transcript,
        suggested: data.suggested ?? {},
        preview: Boolean(data._preview),
        previewReason: data._previewReason,
      });
    } catch (e) {
      setVoiceError(
        e instanceof Error ? e.message : 'Errore durante la trascrizione',
      );
    } finally {
      setVoicePending('idle');
    }
  };

  const applica = (s: VoiceSuggested) => {
    setState((prev) => {
      const next: State = { ...prev };
      // Cliente: solo se non già selezionato dall'archivio
      if (!prev.cliente.id) {
        next.cliente = {
          ...prev.cliente,
          nome: s.ragione_sociale ?? prev.cliente.nome,
          telefono: s.telefono ?? prev.cliente.telefono,
          email: s.email ?? prev.cliente.email,
          indirizzo: s.indirizzo ?? prev.cliente.indirizzo,
        };
      }
      // Voci: merge (mai rimuove)
      if (s.voci_ids && s.voci_ids.length > 0) {
        const merged = new Set([...prev.vociSelezionate, ...vociDefault]);
        for (const id of s.voci_ids) merged.add(id);
        next.vociSelezionate = merged;
      }
      // Descrizione: solo se vuota
      if (s.descrizione && !prev.descrizioneFinale.trim()) {
        next.descrizioneFinale = s.descrizione;
      }
      // Nota: append o set
      if (s.note) {
        next.capture = {
          ...prev.capture,
          nota: prev.capture.nota.trim()
            ? `${prev.capture.nota.trim()}\n\n${s.note}`
            : s.note,
        };
      }
      return next;
    });
    setVoiceOpen(false);
    setVoiceResult(null);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">2 · Cattura sul posto</h2>

      {/* CTA hero "Dettato completo" → /mobile/voice-intake */}
      <a
        href="/mobile/voice-intake"
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border-2 border-primary p-4 text-left shadow-glow-brand transition active:scale-[0.98]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,hsl(22_92%_54%/0.18),transparent_60%),radial-gradient(circle_at_85%_50%,hsl(220_80%_45%/0.18),transparent_60%)]"
        />
        <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(22_95%_60%),hsl(22_92%_45%))] text-white shadow-lg">
          <Mic className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="relative flex-1">
          <span className="block text-base font-bold text-foreground">
            Dettato vocale — più veloce
          </span>
          <span className="block text-xs text-muted-foreground">
            Parla 30-90 sec: cliente, indirizzo, lavoro. L&apos;AI compila tutto e tu rivedi.
          </span>
        </span>
        <ChevronRight
          className="relative h-5 w-5 text-primary transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </a>

      {/* Voice CTA legacy (registrazione inline + applica al wizard) */}
      <button
        type="button"
        onClick={() => setVoiceOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg border-2 border-accent bg-accent-soft/40 p-4 text-left transition active:scale-[0.98]"
      >
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg">
          <Mic className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-foreground">
            Registra descrizione vocale
          </span>
          <span className="block text-xs text-muted-foreground">
            Resta nel wizard: applica i campi estratti agli step successivi.
          </span>
        </span>
      </button>

      <p className="text-sm text-muted-foreground">
        Le foto/video le carichi dopo dalla schermata foto della commessa.
        Puoi anche prendere una nota libera scritta qui sotto, oppure saltare.
      </p>

      <div className="space-y-2">
        <Label htmlFor="nota">Note sopralluogo</Label>
        <textarea
          id="nota"
          rows={6}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          placeholder="Es. caldaia obsoleta, sostituzione bagno completa, tubi ramati visibili…"
          value={state.capture.nota}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              capture: { ...s.capture, nota: e.target.value },
            }))
          }
        />
      </div>

      <Dialog
        open={voiceOpen}
        onOpenChange={(o) => {
          if (!o) {
            setVoiceOpen(false);
            setVoiceResult(null);
            setVoiceError(null);
          } else {
            setVoiceOpen(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-accent" aria-hidden="true" />
              Descrizione vocale
            </DialogTitle>
            <DialogDescription>
              Parla per 30–90 secondi: cliente, indirizzo, intervento. L&apos;AI compila i prossimi step.
            </DialogDescription>
          </DialogHeader>

          {!voiceResult ? (
            <div className="space-y-3">
              <VoiceRecorder
                onRecorded={handleRecorded}
                disabled={voicePending !== 'idle'}
                maxDurationSec={180}
              />
              {voicePending !== 'idle' ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {voicePending === 'transcribing'
                    ? 'Trascrivo l’audio…'
                    : 'Estraggo i campi…'}
                </div>
              ) : null}
              {voiceError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {voiceError}
                </p>
              ) : null}
            </div>
          ) : (
            <MobileVoicePreview
              result={voiceResult}
              onApply={() => applica(voiceResult.suggested)}
              onRedo={() => setVoiceResult(null)}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setVoiceOpen(false);
                setVoiceResult(null);
              }}
            >
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MobileVoicePreview({
  result,
  onApply,
  onRedo,
}: {
  result: {
    transcript: string;
    suggested: VoiceSuggested;
    preview: boolean;
    previewReason?: string;
  };
  onApply: () => void;
  onRedo: () => void;
}) {
  const s = result.suggested;
  const hasAny =
    s.ragione_sociale ||
    s.telefono ||
    s.email ||
    s.indirizzo ||
    s.descrizione ||
    s.note ||
    (s.voci_ids && s.voci_ids.length > 0);

  return (
    <div className="space-y-3">
      {result.preview ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <strong>Preview.</strong>{' '}
          {result.previewReason ?? 'API key non configurata.'}
        </div>
      ) : null}

      <details className="rounded-md border border-border bg-muted/30">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trascrizione audio
        </summary>
        <p className="border-t border-border px-3 py-2 text-sm">
          {result.transcript}
        </p>
      </details>

      {hasAny ? (
        <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary-soft/30 p-3 text-sm">
          {s.ragione_sociale ? (
            <p>
              <strong>Cliente:</strong> {s.ragione_sociale}
            </p>
          ) : null}
          {s.telefono ? (
            <p>
              <strong>Telefono:</strong> {s.telefono}
            </p>
          ) : null}
          {s.email ? (
            <p>
              <strong>Email:</strong> {s.email}
            </p>
          ) : null}
          {s.indirizzo ? (
            <p>
              <strong>Indirizzo:</strong> {s.indirizzo}
            </p>
          ) : null}
          {s.voci_ids && s.voci_ids.length > 0 ? (
            <p>
              <strong>Voci suggerite:</strong> {s.voci_ids.length}
            </p>
          ) : null}
          {s.descrizione ? (
            <p>
              <strong>Descrizione:</strong> <code>{s.descrizione}</code>
            </p>
          ) : null}
          {s.note ? (
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> {s.note}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          Nessun campo riconosciuto. Ripeti indicando cliente, indirizzo e tipo di lavoro.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-[48px]"
          onClick={onRedo}
        >
          Registra di nuovo
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-h-[48px]"
          onClick={onApply}
          disabled={!hasAny}
        >
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Applica
        </Button>
      </div>
    </div>
  );
}

function Step3Voci({
  state,
  setState,
  voci,
  preset,
  vociDefault,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  voci: VoceCatalogoOption[];
  preset: PresetOption[];
  vociDefault: number[];
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, VoceCatalogoOption[]>();
    for (const v of voci) {
      if (!map.has(v.categoria)) map.set(v.categoria, []);
      map.get(v.categoria)!.push(v);
    }
    return [...map.entries()];
  }, [voci]);

  const toggle = (id: number, isDefault: boolean) => {
    if (isDefault) return;
    setState((s) => {
      const next = new Set(s.vociSelezionate);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, vociSelezionate: next };
    });
  };

  const applyPreset = (id: string) => {
    if (!id) return;
    const p = preset.find((x) => x.id === id);
    if (!p) return;
    setState((s) => ({
      ...s,
      vociSelezionate: new Set([...vociDefault, ...p.vociIds]),
    }));
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">3 · Selezione voci</h2>

      {preset.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="preset">Parti da preset…</Label>
          <select
            id="preset"
            className="block h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— nessuno —</option>
            {preset.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Sezione A (1-10, 26): sempre attive · Sezione B: selezione del capo.
      </p>

      <div className="space-y-4">
        {groups.map(([cat, items]) => (
          <fieldset key={cat} className="rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {cat.replace(/_/g, ' ')}
            </legend>
            <div className="space-y-2">
              {items.map((v) => {
                const checked = state.vociSelezionate.has(v.id);
                return (
                  <label
                    key={v.id}
                    className={
                      'flex min-h-[48px] items-center gap-3 rounded-md px-2 py-1.5 text-sm ' +
                      (v.default ? 'bg-muted/50' : 'hover:bg-muted/40')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={v.default}
                      onChange={() => toggle(v.id, v.default)}
                      className="h-5 w-5 accent-[color:hsl(var(--primary))]"
                    />
                    <span className="flex-1">{v.nome}</span>
                    {v.default ? (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        sempre
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function Step4Riepilogo({
  state,
  voci,
}: {
  state: State;
  voci: VoceCatalogoOption[];
}) {
  const sel = voci.filter((v) => state.vociSelezionate.has(v.id));
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">4 · Riepilogo</h2>

      <div className="rounded-md border bg-card p-3 text-sm">
        <p className="font-semibold">{state.cliente.nome || '(senza nome)'}</p>
        {state.cliente.indirizzo ? (
          <p className="text-muted-foreground">
            {state.cliente.indirizzo}
            {state.cliente.citta ? `, ${state.cliente.citta}` : ''}
          </p>
        ) : null}
        {state.cliente.telefono ? (
          <p className="text-xs text-muted-foreground">
            Telefono: {state.cliente.telefono}
          </p>
        ) : null}
        {state.cliente.email ? (
          <p className="text-xs text-muted-foreground">
            Email: {state.cliente.email}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {sel.length} voci selezionate
        </p>
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {sel.map((v) => (
            <li
              key={v.id}
              className="rounded-full border border-border bg-muted/50 px-2 py-0.5"
            >
              {v.nome}
            </li>
          ))}
        </ul>
      </div>

      {state.capture.nota ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Note
          </p>
          <p className="whitespace-pre-wrap rounded-md border bg-card p-3 text-sm">
            {state.capture.nota}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Step5Nome({
  state,
  setState,
  aiPending,
  onRegen,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  aiPending: boolean;
  onRegen: () => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">5 · Nome cartella</h2>

      <p className="text-sm text-muted-foreground">
        Proposto automaticamente in base a voci, cliente e note. Modificabile.
      </p>

      <div className="space-y-2">
        <Label htmlFor="desc">Descrizione (CamelCase, max 30 caratteri)</Label>
        <Input
          id="desc"
          maxLength={30}
          className="h-12 text-base"
          value={state.descrizioneFinale}
          onChange={(e) =>
            setState((s) => ({ ...s, descrizioneFinale: e.target.value }))
          }
          disabled={aiPending}
        />
        {state.descrizioneAlternative.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Alternative:{' '}
            {state.descrizioneAlternative.map((alt, i) => (
              <React.Fragment key={alt}>
                {i > 0 ? ' · ' : null}
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setState((s) => ({ ...s, descrizioneFinale: alt }))
                  }
                >
                  {alt}
                </button>
              </React.Fragment>
            ))}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="min-h-[48px] w-full"
        onClick={onRegen}
        disabled={aiPending}
      >
        {aiPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        )}
        {aiPending ? 'Genero proposta…' : 'Rigenera proposta'}
      </Button>

      <div className="rounded-md border bg-muted/30 p-3 text-xs">
        <p className="text-muted-foreground">
          Cartella prevista:{' '}
          <code className="break-all">
            /{anteprimaCartella(state.cliente.nome, state.cliente.tipo, state.descrizioneFinale)}/
          </code>
        </p>
      </div>
    </section>
  );
}

function Step6Conferma({
  state,
  submitting,
  onSubmit,
}: {
  state: State;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">6 · Conferma e crea</h2>

      <p className="text-sm text-muted-foreground">
        Creo la commessa in archivio. La cartella su cloud non viene creata
        ora (storage in fase di scelta) ma il nome viene salvato e mostrato.
      </p>

      <ul className="space-y-1 text-sm">
        <li>
          <strong>Cliente:</strong> {state.cliente.nome}
        </li>
        <li>
          <strong>Voci:</strong> {state.vociSelezionate.size}
        </li>
        <li>
          <strong>Descrizione:</strong>{' '}
          <code>{state.descrizioneFinale}</code>
        </li>
      </ul>

      <Button
        size="lg"
        className="min-h-[52px] w-full text-base"
        onClick={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Creazione in corso…
          </>
        ) : (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Crea commessa
          </>
        )}
      </Button>
    </section>
  );
}

function Step7Success({
  result,
  onOpen,
}: {
  result: {
    commessaId: string;
    codiceInterno: string;
    nomeCartella: string;
    cloudFolderPath: string;
  };
  onOpen: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-stato-aperta/40 bg-stato-aperta/10 px-3 py-3 text-sm text-stato-aperta">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <span>Commessa creata.</span>
      </div>

      <div className="space-y-2 rounded-md border bg-card p-3 text-sm">
        <p>
          <span className="text-muted-foreground">Codice:</span>{' '}
          <strong className="font-mono">{result.codiceInterno}</strong>
        </p>
        <p>
          <span className="text-muted-foreground">Cartella:</span>{' '}
          <code className="break-all">{result.nomeCartella}</code>
        </p>
        <p className="text-xs text-muted-foreground">
          Percorso teorico: <code className="break-all">{result.cloudFolderPath}</code>
        </p>
        <p className="pt-1">
          <StatoBadge stato="aperta" />
        </p>
      </div>

      <Button size="lg" className="min-h-[48px] w-full" onClick={onOpen}>
        Vedi commessa
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function anteprimaCartella(
  rag: string,
  tipo: 'persona_fisica' | 'azienda',
  desc: string,
): string {
  const seg1 = sanitize(
    tipo === 'persona_fisica'
      ? rag.trim().split(/\s+/).slice(-1)[0] ?? rag
      : rag,
  );
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
