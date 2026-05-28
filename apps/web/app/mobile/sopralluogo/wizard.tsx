'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  Mic,
  Wand2,
  Camera,
  X,
} from 'lucide-react';

import {
  Button,
  Input,
  Label,
  StatoBadge,
} from '@kommessa/ui';

import { creaCommessa } from '../../_actions/crea-commessa';
import {
  creaVoceCustom,
  vociSimili,
  type VoceSimile,
} from '../../office/impostazioni/voci/_actions/voci';
import { useAlert } from '../../_components/confirm-provider';
import { ContactPickerButton } from '../../_components/contact-picker-button';
import { VoiceRecorder } from '../../_components/voice-recorder';
import {
  MediaAttachSection,
  type MediaFile,
} from '../../office/commesse/nuova/_components/media-attach-section';
import {
  uploadMediaBatch,
  type UploadProgressMap,
  type UploadMediaResult,
} from '../../office/commesse/nuova/_lib/upload-media';

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

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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
  vociSelezionate: Set<number>;
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
  const [mediaFiles, setMediaFiles] = React.useState<MediaFile[]>([]);
  const [aiPending, setAiPending] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<UploadProgressMap>(new Map());
  const [uploadResults, setUploadResults] = React.useState<UploadMediaResult[]>([]);
  const uploadAbortRef = React.useRef<AbortController | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    commessaId: string;
    codiceInterno: string;
    nomeCartella: string;
    cloudFolderPath: string;
  } | null>(null);

  const next = () => setStep((s) => Math.min(s + 1, 8) as Step);
  const back = () => setStep((s) => Math.max(s - 1, 1) as Step);

  const canGoNext = (): boolean => {
    switch (step) {
      case 1: return state.cliente.nome.trim().length >= 2;
      case 2: return true;
      case 3: return state.vociSelezionate.size > 0;
      case 4: return true;
      case 5: return state.descrizioneFinale.trim().length > 0;
      case 6: return true; // foto/video opzionali
      default: return true;
    }
  };

  // AI naming al primo ingresso su step 5
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

  React.useEffect(() => {
    if (step === 5 && state.descrizioneFinale === '' && !aiPending) {
      void handleGenAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
        voci: [...state.vociSelezionate].filter((id) => !vociDefault.includes(id)),
        descrizioneFinale: state.descrizioneFinale.trim(),
        note: state.capture.nota || null,
        indirizzoCantiere: state.cliente.indirizzo || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r = {
        commessaId: res.data.commessaId,
        codiceInterno: res.data.codiceInterno,
        nomeCartella: res.data.nomeCartella,
        cloudFolderPath: res.data.cloudFolderPath,
      };
      setResult(r);
      setSubmitting(false);

      // Upload foto/video se presenti
      if (mediaFiles.length > 0) {
        const controller = new AbortController();
        uploadAbortRef.current = controller;
        setUploading(true);
        const results = await uploadMediaBatch(
          mediaFiles,
          r.commessaId,
          (map) => setUploadProgress(new Map(map)),
          controller.signal,
        );
        uploadAbortRef.current = null;
        setUploadResults(results);
        setUploading(false);
      }

      setStep(8);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creazione commessa fallita');
      setSubmitting(false);
      setUploading(false);
    }
  };

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
        <Step2Capture state={state} setState={setState} vociDefault={vociDefault} />
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
        <Step6Media mediaFiles={mediaFiles} onChange={setMediaFiles} />
      )}
      {step === 7 && (
        <Step7Conferma
          state={state}
          mediaCount={mediaFiles.length}
          submitting={submitting}
          uploading={uploading}
          onSubmit={handleSubmit}
        />
      )}
      {step === 8 && result && (
        <Step8Success
          result={result}
          uploadResults={uploadResults}
          onOpen={() => router.push(`/mobile/commessa/${result.commessaId}`)}
          onScatta={() =>
            router.push(`/mobile/commessa/${result.commessaId}/scatto`)
          }
        />
      )}

      {step < 7 && (
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const labels = ['Cliente', 'Cattura', 'Voci', 'Riepilogo', 'Nome', 'Foto/video', 'Conferma', 'Fatto'];
  return (
    <div className="flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wider">
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
                  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ' +
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

// ─── Step 1: Cliente ─────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">1 · Anagrafica cliente</h2>
        <ContactPickerButton
          onSelect={(c) =>
            setState((s) => ({
              ...s,
              cliente: {
                ...s.cliente,
                id: undefined,
                nome: c.name ?? s.cliente.nome,
                telefono: c.tel ?? s.cliente.telefono,
                email: c.email ?? s.cliente.email,
              },
            }))
          }
        />
      </div>

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
                    <span className="ml-2 text-xs text-muted-foreground">{m.citta}</span>
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
                cliente: { ...s.cliente, tipo: e.target.value as 'persona_fisica' | 'azienda' },
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
            setState((s) => ({ ...s, cliente: { ...s.cliente, indirizzo: e.target.value } }))
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
            setState((s) => ({ ...s, cliente: { ...s.cliente, citta: e.target.value } }))
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
              setState((s) => ({ ...s, cliente: { ...s.cliente, telefono: e.target.value } }))
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
              setState((s) => ({ ...s, cliente: { ...s.cliente, email: e.target.value } }))
            }
          />
        </div>
      </div>

      {state.cliente.id ? (
        <p className="text-xs text-muted-foreground">Cliente esistente selezionato dall&apos;archivio.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Nuovo cliente: verrà creato in archivio alla conferma.</p>
      )}
    </section>
  );
}

// ─── Step 2: Cattura ─────────────────────────────────────────────────────────

function Step2Capture({
  state,
  setState,
  vociDefault,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  vociDefault: number[];
}) {
  const [voicePending, setVoicePending] = React.useState<'idle' | 'transcribing' | 'extracting'>('idle');
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [voiceResult, setVoiceResult] = React.useState<{
    transcript: string;
    suggested: VoiceSuggested;
    preview: boolean;
    previewReason?: string;
  } | null>(null);

  const handleRecorded = async (blob: Blob) => {
    setVoiceError(null);
    setVoiceResult(null);
    setVoicePending('transcribing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voicenote.webm');
      fd.append('mode', 'full');
      const res = await fetch('/api/voice/extract', { method: 'POST', body: fd });
      setVoicePending('extracting');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
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
      setVoiceError(e instanceof Error ? e.message : 'Errore durante la trascrizione');
    } finally {
      setVoicePending('idle');
    }
  };

  const applica = (s: VoiceSuggested) => {
    setState((prev) => {
      const next: State = { ...prev };
      if (!prev.cliente.id) {
        next.cliente = {
          ...prev.cliente,
          nome: s.ragione_sociale ?? prev.cliente.nome,
          telefono: s.telefono ?? prev.cliente.telefono,
          email: s.email ?? prev.cliente.email,
          indirizzo: s.indirizzo ?? prev.cliente.indirizzo,
        };
      }
      if (s.voci_ids && s.voci_ids.length > 0) {
        const merged = new Set([...prev.vociSelezionate, ...vociDefault]);
        for (const id of s.voci_ids) merged.add(id);
        next.vociSelezionate = merged;
      }
      if (s.descrizione && !prev.descrizioneFinale.trim()) {
        next.descrizioneFinale = s.descrizione;
      }
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
    setVoiceResult(null);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">2 · Descrizione vocale</h2>
      <p className="text-sm text-muted-foreground">
        Parla per 30–60 secondi: tipo di lavoro, stato dell&apos;impianto, note urgenti.
        L&apos;AI pre-compila i prossimi step.
      </p>

      {/* Registratore inline — primario */}
      {!voiceResult ? (
        <div className="rounded-xl border-2 border-primary/20 bg-primary-soft/20 p-4">
          <VoiceRecorder
            onRecorded={handleRecorded}
            disabled={voicePending !== 'idle'}
            maxDurationSec={180}
          />
          {voicePending !== 'idle' ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {voicePending === 'transcribing' ? 'Trascrivo l’audio…' : 'Estraggo i campi…'}
            </div>
          ) : null}
          {voiceError ? (
            <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {voiceError}
            </p>
          ) : null}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Puoi anche saltare questo step e compilare i campi manualmente.
          </p>
        </div>
      ) : (
        <InlineVoicePreview
          result={voiceResult}
          onApply={() => applica(voiceResult.suggested)}
          onRedo={() => setVoiceResult(null)}
        />
      )}

      {/* Note scritte */}
      <div className="space-y-2">
        <Label htmlFor="nota">Note aggiuntive (opzionale)</Label>
        <textarea
          id="nota"
          rows={4}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          placeholder="Es. caldaia obsoleta, sostituzione bagno completa, tubi ramati visibili…"
          value={state.capture.nota}
          onChange={(e) =>
            setState((s) => ({ ...s, capture: { ...s.capture, nota: e.target.value } }))
          }
        />
      </div>

      {/* Hint a cambio modalità — in basso, non in evidenza */}
      <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          Preferisci creare la commessa con un unico dettato completo?{' '}
          <a
            href="/mobile/voice-intake"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Usa il flusso vocale →
          </a>
        </p>
      </div>
    </section>
  );
}

function InlineVoicePreview({
  result,
  onApply,
  onRedo,
}: {
  result: { transcript: string; suggested: VoiceSuggested; preview: boolean; previewReason?: string };
  onApply: () => void;
  onRedo: () => void;
}) {
  const s = result.suggested;
  const hasAny =
    s.ragione_sociale || s.telefono || s.email || s.indirizzo || s.descrizione || s.note ||
    (s.voci_ids && s.voci_ids.length > 0);

  return (
    <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-primary-soft/10 p-4">
      {result.preview ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <strong>Preview.</strong> {result.previewReason ?? 'API key non configurata.'}
        </div>
      ) : null}

      <details className="rounded-md border border-border bg-background">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trascrizione audio
        </summary>
        <p className="border-t border-border px-3 py-2 text-sm">{result.transcript}</p>
      </details>

      {hasAny ? (
        <div className="space-y-1.5 rounded-md border border-primary/30 bg-background p-3 text-sm">
          {s.ragione_sociale && <p><strong>Cliente:</strong> {s.ragione_sociale}</p>}
          {s.telefono && <p><strong>Telefono:</strong> {s.telefono}</p>}
          {s.email && <p><strong>Email:</strong> {s.email}</p>}
          {s.indirizzo && <p><strong>Indirizzo:</strong> {s.indirizzo}</p>}
          {s.voci_ids && s.voci_ids.length > 0 && <p><strong>Voci suggerite:</strong> {s.voci_ids.length}</p>}
          {s.descrizione && <p><strong>Descrizione:</strong> <code className="text-xs">{s.descrizione}</code></p>}
          {s.note && <p className="text-xs text-muted-foreground"><strong>Note:</strong> {s.note}</p>}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          Nessun campo riconosciuto. Registra di nuovo indicando cliente, indirizzo e tipo di lavoro.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" className="min-h-[48px]" onClick={onRedo}>
          Registra di nuovo
        </Button>
        <Button type="button" size="lg" className="min-h-[48px]" onClick={onApply} disabled={!hasAny}>
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Applica
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Voci ─────────────────────────────────────────────────────────────

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
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [showNuova, setShowNuova] = React.useState(false);

  // Filtra + raggruppa + ordina alfabeticamente.
  // Le voci default ("sempre attive") restano sempre visibili anche durante
  // la ricerca, in cima al gruppo "sempre attive" — sono informative.
  const groups = React.useMemo(() => {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const q = norm(search.trim());
    const filtered = q
      ? voci.filter((v) => v.default || norm(v.nome).includes(q))
      : voci;
    const map = new Map<string, VoceCatalogoOption[]>();
    for (const v of filtered) {
      if (!map.has(v.categoria)) map.set(v.categoria, []);
      map.get(v.categoria)!.push(v);
    }
    // Ordina alfabeticamente dentro ogni gruppo (default prima).
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.default !== b.default) return a.default ? -1 : 1;
        return a.nome.localeCompare(b.nome, 'it');
      });
    }
    return [...map.entries()];
  }, [voci, search]);

  const matchCount = React.useMemo(
    () => groups.reduce((acc, [, items]) => acc + items.length, 0),
    [groups],
  );

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
    setState((s) => ({ ...s, vociSelezionate: new Set([...vociDefault, ...p.vociIds]) }));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">3 · Selezione voci</h2>
        <button
          type="button"
          onClick={() => setShowNuova(true)}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.04] px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 active:scale-[0.97]"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          Nuova voce
        </button>
      </div>

      {preset.length > 0 ? (
        <div className="space-y-1">
          <Label htmlFor="preset" className="text-xs">
            Parti da preset…
          </Label>
          <select
            id="preset"
            className="block h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">— nessuno —</option>
            {preset.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Search compatta sticky in alto del container scrollabile */}
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pt-1 backdrop-blur-sm">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca voce…"
            className="h-9 pl-8 pr-8 text-sm"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Pulisci ricerca"
              className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        {search ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {matchCount === 0
              ? 'Nessuna voce — prova "Nuova voce" qui sopra.'
              : `${matchCount} risultat${matchCount === 1 ? 'o' : 'i'}`}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Sezione A: sempre attive · Sezione B: selezione del capo.
          </p>
        )}
      </div>

      {/* Lista scrollabile più alta (~65vh) con search persistente sopra */}
      <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-0.5">
        {groups.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            Nessuna voce trovata per "{search}".
            <br />
            Se serve davvero, aggiungila con <span className="font-medium text-foreground">+ Nuova voce</span>.
          </div>
        ) : (
          groups.map(([cat, items]) => (
            <fieldset key={cat} className="rounded-md border border-border p-2.5">
              <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.replace(/_/g, ' ')}
              </legend>
              <div className="space-y-1.5">
                {items.map((v) => {
                  const checked = state.vociSelezionate.has(v.id);
                  return (
                    <label
                      key={v.id}
                      className={
                        'flex min-h-[44px] items-center gap-3 rounded-md px-2 py-1 text-sm ' +
                        (v.default ? 'bg-muted/50' : 'hover:bg-muted/40 active:bg-muted/60')
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
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">sempre</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))
        )}
      </div>

      {showNuova ? (
        <NuovaVoceMobileDialog
          initialNome={search.trim()}
          onClose={() => setShowNuova(false)}
          onCreated={() => {
            // Ricarica il server data per vedere la nuova voce nei selettori.
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Dialog compatto per aggiungere una nuova voce custom dalla PWA.
 * Filosofia (come da indicazione cliente): "non aggiungere mille cose a
 * caso, scrivi e verifica cosa c'è già". Il server fa il check fuzzy
 * (Levenshtein + accenti) e se trova voci simili le mostra prima di
 * insertare. L'utente può "Crea comunque" o cambiare nome.
 */
function NuovaVoceMobileDialog({
  initialNome,
  onClose,
  onCreated,
}: {
  initialNome: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const showAlert = useAlert();
  const [nome, setNome] = React.useState(initialNome);
  const [categoria, setCategoria] = React.useState<
    | 'impiantistica'
    | 'documentazione'
    | 'tubazioni'
    | 'montaggi'
    | 'allacci'
    | 'ventilazione'
    | 'supporto'
    | 'alimentazione'
  >('impiantistica');
  const [pending, start] = React.useTransition();
  const [similar, setSimilar] = React.useState<VoceSimile[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-fetch fuzzy on-blur: dà feedback "ehi c'è già X" prima del submit.
  const checkSimilar = async () => {
    if (nome.trim().length < 2) return;
    try {
      const sim = await vociSimili({ nome: nome.trim() });
      if (sim.length > 0) setSimilar(sim);
    } catch {
      /* silent: il check finale lo fa il submit */
    }
  };

  const submit = (force: boolean) => {
    if (nome.trim().length < 2) {
      setError('Almeno 2 caratteri.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await creaVoceCustom({
        nome: nome.trim(),
        categoria,
        cartellaTemplate: null,
        forceSimilar: force,
      });
      if (res.ok) {
        onCreated();
        onClose();
        return;
      }
      if (res.reason === 'similar') {
        setSimilar(res.similar);
        return;
      }
      if (res.reason === 'duplicate') {
        setError(res.message);
        return;
      }
      await showAlert({
        title: 'Creazione voce fallita',
        body: 'message' in res ? res.message : 'Errore sconosciuto',
      });
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-border bg-card p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Nuova voce custom</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Prima di aggiungere, cerca: probabilmente esiste già con un
              nome simile. Niente doppioni.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="nuova-voce-nome" className="text-xs">
              Nome voce
            </Label>
            <Input
              id="nuova-voce-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (similar) setSimilar(null);
                if (error) setError(null);
              }}
              onBlur={checkSimilar}
              placeholder="Es. Allaccio fibra ottica"
              maxLength={160}
              autoFocus
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="nuova-voce-cat" className="text-xs">
              Categoria
            </Label>
            <select
              id="nuova-voce-cat"
              value={categoria}
              onChange={(e) =>
                setCategoria(e.target.value as typeof categoria)
              }
              className="mt-1 block h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="impiantistica">Impiantistica</option>
              <option value="documentazione">Documentazione</option>
              <option value="tubazioni">Tubazioni</option>
              <option value="montaggi">Montaggi</option>
              <option value="allacci">Allacci</option>
              <option value="ventilazione">Ventilazione</option>
              <option value="supporto">Supporto</option>
              <option value="alimentazione">Alimentazione</option>
            </select>
          </div>

          {similar && similar.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30">
              <p className="mb-1 font-medium text-amber-900 dark:text-amber-200">
                Esistono già voci simili:
              </p>
              <ul className="space-y-0.5 text-[11px] text-amber-900/85 dark:text-amber-200/85">
                {similar.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span className="font-mono opacity-60">
                      #{String(s.id).padStart(2, '0')}
                    </span>
                    <span className="flex-1 font-medium">{s.nome}</span>
                    <span className="text-[9px] uppercase opacity-60">
                      {s.scope}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-amber-900/70 dark:text-amber-200/70">
                Se è davvero diversa, conferma. Altrimenti seleziona quella
                già esistente dall'elenco.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            Annulla
          </Button>
          {similar && similar.length > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => submit(true)}
            >
              {pending ? 'Creo…' : 'Crea comunque'}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={pending || nome.trim().length < 2}
              onClick={() => submit(false)}
            >
              {pending ? 'Verifica…' : 'Crea voce'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Riepilogo ───────────────────────────────────────────────────────

function Step4Riepilogo({ state, voci }: { state: State; voci: VoceCatalogoOption[] }) {
  const sel = voci.filter((v) => state.vociSelezionate.has(v.id));
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">4 · Riepilogo</h2>

      <div className="rounded-md border bg-card p-3 text-sm">
        <p className="font-semibold">{state.cliente.nome || '(senza nome)'}</p>
        {state.cliente.indirizzo ? (
          <p className="text-muted-foreground">
            {state.cliente.indirizzo}{state.cliente.citta ? `, ${state.cliente.citta}` : ''}
          </p>
        ) : null}
        {state.cliente.telefono ? <p className="text-xs text-muted-foreground">Tel: {state.cliente.telefono}</p> : null}
        {state.cliente.email ? <p className="text-xs text-muted-foreground">Email: {state.cliente.email}</p> : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {sel.length} voci selezionate
        </p>
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {sel.map((v) => (
            <li key={v.id} className="rounded-full border border-border bg-muted/50 px-2 py-0.5">{v.nome}</li>
          ))}
        </ul>
      </div>

      {state.capture.nota ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</p>
          <p className="whitespace-pre-wrap rounded-md border bg-card p-3 text-sm">{state.capture.nota}</p>
        </div>
      ) : null}
    </section>
  );
}

// ─── Step 5: Nome cartella ───────────────────────────────────────────────────

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
          onChange={(e) => setState((s) => ({ ...s, descrizioneFinale: e.target.value }))}
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
                  onClick={() => setState((s) => ({ ...s, descrizioneFinale: alt }))}
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
          Cartella Nextcloud:{' '}
          <code className="break-all">
            /{anteprimaCartella(state.cliente.nome, state.cliente.tipo, state.descrizioneFinale)}/
          </code>
        </p>
      </div>
    </section>
  );
}

// ─── Step 6: Foto / Video ────────────────────────────────────────────────────

function Step6Media({
  mediaFiles,
  onChange,
}: {
  mediaFiles: MediaFile[];
  onChange: (files: MediaFile[]) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Camera className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold">6 · Foto/video sopralluogo</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Documenta lo stato iniziale del cantiere — opzionale, puoi aggiungere altro in seguito.
      </p>
      <MediaAttachSection files={mediaFiles} onChange={onChange} />
    </section>
  );
}

// ─── Step 7: Conferma ────────────────────────────────────────────────────────

function Step7Conferma({
  state,
  mediaCount,
  submitting,
  uploading,
  onSubmit,
}: {
  state: State;
  mediaCount: number;
  submitting: boolean;
  uploading: boolean;
  onSubmit: () => void;
}) {
  const busy = submitting || uploading;
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">7 · Conferma e crea</h2>

      <ul className="space-y-1 rounded-md border bg-card p-3 text-sm">
        <li><strong>Cliente:</strong> {state.cliente.nome}</li>
        <li><strong>Voci:</strong> {state.vociSelezionate.size}</li>
        <li><strong>Descrizione:</strong> <code className="text-xs">{state.descrizioneFinale}</code></li>
        {mediaCount > 0 ? (
          <li><strong>Foto/video:</strong> {mediaCount} file da caricare</li>
        ) : null}
      </ul>

      <Button
        size="lg"
        className="min-h-[52px] w-full text-base"
        onClick={onSubmit}
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {uploading ? `Carico foto/video (${mediaCount} file)…` : 'Creo la commessa…'}
          </>
        ) : (
          <>
            <Check className="h-4 w-4" aria-hidden="true" />
            Crea commessa{mediaCount > 0 ? ` + ${mediaCount} foto/video` : ''}
          </>
        )}
      </Button>
    </section>
  );
}

// ─── Step 8: Successo ────────────────────────────────────────────────────────

function Step8Success({
  result,
  uploadResults,
  onOpen,
  onScatta,
}: {
  result: { commessaId: string; codiceInterno: string; nomeCartella: string; cloudFolderPath: string };
  uploadResults: UploadMediaResult[];
  onOpen: () => void;
  onScatta: () => void;
}) {
  const uploadOk = uploadResults.filter((r) => r.ok).length;
  const uploadErr = uploadResults.filter((r) => !r.ok).length;

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
          Percorso Nextcloud: <code className="break-all">{result.cloudFolderPath}</code>
        </p>
        {uploadResults.length > 0 ? (
          <p className="border-t border-border pt-2 text-xs">
            {uploadOk > 0 && (
              <span className="text-success">{uploadOk} foto/video caricati ✓</span>
            )}
            {uploadErr > 0 && (
              <span className="ml-2 text-destructive">{uploadErr} falliti — riprova dalla commessa</span>
            )}
          </p>
        ) : null}
        <p className="pt-1">
          <StatoBadge stato="aperta" />
        </p>
      </div>

      <Button size="lg" className="min-h-[52px] w-full" onClick={onScatta}>
        Scatta foto al cantiere
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="min-h-[48px] w-full"
        onClick={onOpen}
      >
        Apri commessa
      </Button>
    </section>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function anteprimaCartella(rag: string, tipo: 'persona_fisica' | 'azienda', desc: string): string {
  const seg1 = sanitize(
    tipo === 'persona_fisica' ? rag.trim().split(/\s+/).slice(-1)[0] ?? rag : rag,
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
