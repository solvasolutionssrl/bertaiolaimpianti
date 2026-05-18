'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  User,
  ListChecks,
  PenLine,
  FolderTree,
  Mic,
  ChevronDown,
  Wand2,
} from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

import { creaCommessa } from '../../../../_actions/crea-commessa';
import type { CreaCommessaServerData } from '../../../../_actions/crea-commessa.schemas';
import { VoiceRecorder } from '../../../../_components/voice-recorder';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface VoceItem {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
}

export interface PresetItem {
  id: string;
  nome: string;
  vociIds: number[];
}

interface ClienteSuggest {
  id: string;
  ragione_sociale: string;
  citta: string | null;
  tipo: 'persona_fisica' | 'azienda';
}

interface VoiceSuggested {
  ragione_sociale?: string;
  tipo?: 'persona_fisica' | 'azienda';
  telefono?: string;
  email?: string;
  indirizzo?: string;
  citta?: string;
  voci_ids?: number[];
  descrizione?: string;
  note?: string;
  tag_suggeriti?: string[];
}

interface FormState {
  cliente: {
    id?: string;
    ragione_sociale: string;
    tipo: 'persona_fisica' | 'azienda';
    indirizzo: string;
    citta: string;
    telefono: string;
    email: string;
  };
  voci: Set<number>;
  presetId: string;
  descrizione: string;
  note: string;
  indirizzoCantiere: string;
}

function initialState(vociDefault: number[]): FormState {
  return {
    cliente: {
      ragione_sociale: '',
      tipo: 'persona_fisica',
      indirizzo: '',
      citta: '',
      telefono: '',
      email: '',
    },
    voci: new Set(vociDefault),
    presetId: '',
    descrizione: '',
    note: '',
    indirizzoCantiere: '',
  };
}

const CATEGORIA_LABEL: Record<string, string> = {
  sempre_attiva: 'Sempre attiva (base)',
  impiantistica: 'Impiantistica',
  ventilazione: 'Ventilazione & Collaudi',
  documentazione: 'Documentazione',
  tubazioni: 'Tubazioni & Idraulica',
  montaggi: 'Montaggi',
  allacci: 'Allacci & Tecnici',
  supporto: 'Supporto tecnico',
  alimentazione: 'Alimentazione',
};

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export function NuovaCommessaForm({
  voci,
  preset,
}: {
  voci: VoceItem[];
  preset: PresetItem[];
}) {
  const router = useRouter();
  const vociDefault = React.useMemo(
    () => voci.filter((v) => v.default).map((v) => v.id),
    [voci],
  );
  const [state, setState] = React.useState<FormState>(() => initialState(vociDefault));
  const [submitting, setSubmitting] = React.useState(false);
  const [genPending, setGenPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<CreaCommessaServerData | null>(null);

  // Errori per-field (mostrati inline accanto al campo, niente solo banner)
  type FieldErrors = {
    ragione_sociale?: string;
    descrizione?: string;
  };
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const ragioneRef = React.useRef<HTMLInputElement>(null);
  const descrizioneRef = React.useRef<HTMLInputElement>(null);
  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Voice → pre-fill state
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
    model?: string;
  } | null>(null);
  const [showTranscript, setShowTranscript] = React.useState(false);

  // Divisione: Sezione A (sempre attive) + Sezione B (selezionabili)
  const { sezioneA, sezioneB } = React.useMemo(() => {
    const a = voci.filter((v) => v.default);
    const bMap = new Map<string, VoceItem[]>();
    for (const v of voci) {
      if (v.default) continue;
      if (!bMap.has(v.categoria)) bMap.set(v.categoria, []);
      bMap.get(v.categoria)!.push(v);
    }
    return { sezioneA: a, sezioneB: [...bMap.entries()] };
  }, [voci]);

  // -------- Cliente autocomplete --------
  const [clientiSugg, setClientiSugg] = React.useState<ClienteSuggest[]>([]);
  const [searchPending, setSearchPending] = React.useState(false);

  const cercaClienti = React.useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 2) {
      setClientiSugg([]);
      return;
    }
    setSearchPending(true);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase
        .from('clienti')
        .select('id, ragione_sociale, citta, tipo')
        .ilike('ragione_sociale', `%${term}%`)
        .order('ragione_sociale')
        .limit(8);
      setClientiSugg((data ?? []) as ClienteSuggest[]);
    } finally {
      setSearchPending(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (!state.cliente.id) {
        void cercaClienti(state.cliente.ragione_sociale);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [state.cliente.ragione_sociale, state.cliente.id, cercaClienti]);

  const selezionaCliente = (c: ClienteSuggest) => {
    setState((s) => ({
      ...s,
      cliente: {
        ...s.cliente,
        id: c.id,
        ragione_sociale: c.ragione_sociale,
        tipo: c.tipo,
      },
    }));
    setClientiSugg([]);
  };

  const applicaPreset = (presetId: string) => {
    setState((s) => {
      const next: FormState = { ...s, presetId };
      if (!presetId) return next;
      const p = preset.find((x) => x.id === presetId);
      if (!p) return next;
      next.voci = new Set([...vociDefault, ...p.vociIds]);
      return next;
    });
  };

  const toggleVoce = (id: number) => {
    setState((s) => {
      const next = new Set(s.voci);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, voci: next };
    });
  };

  const suggerisci = async () => {
    setGenPending(true);
    setError(null);
    try {
      const res = await fetch('/api/suggerisci-nome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voci: [...state.voci],
          cliente: state.cliente.ragione_sociale,
          note: state.note,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { proposta } = (await res.json()) as { proposta: string };
      setState((s) => ({ ...s, descrizione: proposta }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggerimento fallito');
    } finally {
      setGenPending(false);
    }
  };

  // -------- Voice → pre-fill --------
  const handleVoiceRecorded = React.useCallback(
    async (blob: Blob, durationSec: number) => {
      setVoiceError(null);
      setVoicePending('transcribing');
      try {
        const fd = new FormData();
        fd.append('audio', blob, 'voicenote.webm');
        fd.append('mode', 'full');
        // breve pausa visiva tra transcribe e extract per UX
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
          _model?: string;
        };
        setVoiceResult({
          transcript: data.transcript,
          suggested: data.suggested ?? {},
          preview: Boolean(data._preview),
          previewReason: data._previewReason,
          model: data._model,
        });
      } catch (e) {
        setVoiceError(
          e instanceof Error ? e.message : 'Errore durante la trascrizione',
        );
      } finally {
        setVoicePending('idle');
        // marca rapida per il developer (non visualizzata)
        void durationSec;
      }
    },
    [],
  );

  const applicaSuggerimenti = (s: VoiceSuggested) => {
    setState((prev) => {
      const next: FormState = { ...prev };
      // Solo se l'utente non ha già scelto un cliente esistente, popoliamo
      // l'anagrafica con i campi suggeriti.
      if (!prev.cliente.id) {
        next.cliente = {
          ...prev.cliente,
          ragione_sociale: s.ragione_sociale ?? prev.cliente.ragione_sociale,
          tipo: s.tipo ?? prev.cliente.tipo,
          telefono: s.telefono ?? prev.cliente.telefono,
          email: s.email ?? prev.cliente.email,
          // L'indirizzo del transcript va nell'indirizzo cliente se vuoto,
          // altrimenti nell'indirizzo cantiere.
          indirizzo: prev.cliente.indirizzo || (s.indirizzo ?? prev.cliente.indirizzo),
          citta: prev.cliente.citta || (s.citta ?? prev.cliente.citta),
        };
      }
      if (s.indirizzo && !next.indirizzoCantiere && prev.cliente.indirizzo) {
        next.indirizzoCantiere = s.indirizzo;
      } else if (s.indirizzo && !prev.cliente.indirizzo && !prev.cliente.id) {
        // già messo sopra
      } else if (s.indirizzo && !prev.indirizzoCantiere) {
        next.indirizzoCantiere = s.indirizzo;
      }
      // Voci suggerite: aggiunge alle attuali (mai rimuove)
      if (s.voci_ids && s.voci_ids.length > 0) {
        const merged = new Set(prev.voci);
        for (const id of s.voci_ids) merged.add(id);
        next.voci = merged;
      }
      // Descrizione: solo se vuota
      if (s.descrizione && !prev.descrizione.trim()) {
        next.descrizione = s.descrizione;
      }
      // Note: append se già presenti, altrimenti set
      if (s.note) {
        next.note = prev.note.trim()
          ? `${prev.note.trim()}\n\n${s.note}`
          : s.note;
      }
      return next;
    });
    setVoiceOpen(false);
    setVoiceResult(null);
    setShowTranscript(false);
  };

  const closeVoiceDialog = () => {
    setVoiceOpen(false);
    setVoiceResult(null);
    setVoiceError(null);
    setShowTranscript(false);
    setVoicePending('idle');
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);

    // Valida tutti i campi insieme, raccogli errori per-field
    const newFieldErrors: FieldErrors = {};
    if (!state.cliente.id && state.cliente.ragione_sociale.trim().length < 2) {
      newFieldErrors.ragione_sociale = 'Indica un cliente esistente o un nuovo nominativo';
    }
    if (state.descrizione.trim().length === 0) {
      newFieldErrors.descrizione = 'Aggiungi una descrizione (puoi usare "Suggerisci")';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setError('Mancano dei campi obbligatori — controlla i campi evidenziati');
      // Focus + scroll al primo errore
      const firstError = newFieldErrors.ragione_sociale ? ragioneRef : descrizioneRef;
      requestAnimationFrame(() => {
        firstError.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstError.current?.focus();
      });
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const result = await creaCommessa({
        clienteId: state.cliente.id,
        clienteNew: state.cliente.id
          ? undefined
          : {
              ragione_sociale: state.cliente.ragione_sociale,
              tipo: state.cliente.tipo,
              indirizzo: state.cliente.indirizzo || null,
              citta: state.cliente.citta || null,
              telefoni: state.cliente.telefono ? [state.cliente.telefono] : [],
              email: state.cliente.email ? [state.cliente.email] : [],
              note: null,
            },
        voci: [...state.voci].filter((id) => !vociDefault.includes(id)),
        descrizioneFinale: state.descrizione.trim(),
        note: state.note || null,
        indirizzoCantiere: state.indirizzoCantiere || null,
        presetId: state.presetId || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creazione commessa fallita');
    } finally {
      setSubmitting(false);
    }
  };

  // -------- Render: success --------
  if (success) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-lg">Commessa creata</CardTitle>
              <CardDescription>I metadata sono salvati in database.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 rounded-lg border border-border bg-muted/40 p-5 text-sm">
            <Row label="Codice">
              <code className="font-mono text-base font-semibold text-primary">
                {success.codiceInterno}
              </code>
            </Row>
            <Row label="Nome cartella">
              <code className="break-all">{success.nomeCartella}</code>
            </Row>
            <Row label="Percorso teorico">
              <code className="break-all text-muted-foreground">
                {success.cloudFolderPath}
              </code>
            </Row>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            La cartella su cloud non è stata creata: lo storage definitivo è in
            fase di scelta. Per ora teniamo solo i metadata in database.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href={`/office/commesse/${success.commessaId}`}>
                Apri commessa
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setSuccess(null)}>
              Crea un&apos;altra commessa
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const anteprima = anteprimaCartella(
    state.cliente.ragione_sociale,
    state.cliente.tipo,
    state.descrizione,
  );
  const vociBSel = [...state.voci].filter((id) => !vociDefault.includes(id)).length;
  const totalVoci = vociDefault.length + vociBSel;

  // -------- Render: form 2-pane (main + right rail) --------
  return (
    <form onSubmit={submit} className="pb-32">
      {/* === Voce: bottone "Componi a voce" === */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-accent/30 bg-accent-soft/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-soft">
            <Mic className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Compila a voce in 30 secondi
            </p>
            <p className="text-xs text-muted-foreground">
              Parla: cliente, indirizzo, tipo di lavoro. L&apos;AI riempie il form per te.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="default"
          onClick={() => setVoiceOpen(true)}
          className="border-2 border-accent bg-accent text-white shadow-soft hover:bg-accent/90"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          Registra nota vocale
        </Button>
      </div>

      <Dialog
        open={voiceOpen}
        onOpenChange={(o) => {
          if (!o) closeVoiceDialog();
          else setVoiceOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-accent" aria-hidden="true" />
              Componi commessa a voce
            </DialogTitle>
            <DialogDescription>
              Parla per 30–90 secondi descrivendo cliente, indirizzo, tipo di intervento e note. L&apos;AI estrarrà i campi e te li proporrà come pre-compilazione del form.
            </DialogDescription>
          </DialogHeader>

          {!voiceResult ? (
            <div className="space-y-3">
              <VoiceRecorder
                onRecorded={handleVoiceRecorded}
                disabled={voicePending !== 'idle'}
                maxDurationSec={180}
              />
              {voicePending !== 'idle' ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {voicePending === 'transcribing'
                    ? 'Trascrivo l’audio…'
                    : 'Estraggo i campi dal testo…'}
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
            <VoiceSuggestionPreview
              result={voiceResult}
              voci={voci}
              showTranscript={showTranscript}
              setShowTranscript={setShowTranscript}
              onApply={() => applicaSuggerimenti(voiceResult.suggested)}
              onRedo={() => {
                setVoiceResult(null);
                setShowTranscript(false);
              }}
            />
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={closeVoiceDialog}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* ============================ MAIN (col 8) ============================ */}
        <div className="space-y-6 lg:col-span-8">
          {/* ------- Cliente ------- */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle className="text-base">Cliente</CardTitle>
                  <CardDescription>Cerca un cliente esistente o inserisci un nuovo nominativo</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="cli-nome" className="flex items-center gap-1">
                  Nome / Ragione sociale
                  <span aria-hidden="true" className="text-destructive">*</span>
                  <span className="sr-only">campo obbligatorio</span>
                </Label>
                <Input
                  id="cli-nome"
                  ref={ragioneRef}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldErrors.ragione_sociale)}
                  aria-describedby={fieldErrors.ragione_sociale ? 'cli-nome-error' : undefined}
                  className={
                    fieldErrors.ragione_sociale
                      ? 'border-destructive bg-destructive/5 ring-2 ring-destructive/30 focus-visible:ring-destructive/40'
                      : undefined
                  }
                  value={state.cliente.ragione_sociale}
                  onChange={(e) => {
                    clearFieldError('ragione_sociale');
                    setState((s) => ({
                      ...s,
                      cliente: {
                        ...s.cliente,
                        id: undefined,
                        ragione_sociale: e.target.value,
                      },
                    }));
                  }}
                  placeholder="Es. Rossi Mario · Comune di Castagnole · Impresa XYZ S.r.l."
                />
                {fieldErrors.ragione_sociale ? (
                  <p
                    id="cli-nome-error"
                    role="alert"
                    className="flex items-center gap-1.5 text-sm font-medium text-destructive"
                  >
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {fieldErrors.ragione_sociale}
                  </p>
                ) : null}
                {state.cliente.id ? (
                  <p className="text-xs text-muted-foreground">
                    Cliente esistente.{' '}
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          cliente: { ...s.cliente, id: undefined },
                        }))
                      }
                    >
                      Sgancia
                    </button>
                  </p>
                ) : clientiSugg.length > 0 ? (
                  <ul className="overflow-hidden rounded-md border border-border bg-card text-sm shadow-soft">
                    {clientiSugg.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left transition hover:bg-primary-soft"
                          onClick={() => selezionaCliente(c)}
                        >
                          <span className="font-medium">{c.ragione_sociale}</span>
                          {c.citta ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {c.citta}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : searchPending ? (
                  <p className="text-xs text-muted-foreground">Ricerca…</p>
                ) : state.cliente.ragione_sociale.trim().length >= 2 ? (
                  <p className="rounded-md border border-dashed border-accent/40 bg-accent-soft px-3 py-2 text-xs text-accent-soft-foreground">
                    Nessun match: verrà creato un nuovo nominativo.
                  </p>
                ) : null}
              </div>

              {!state.cliente.id ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cli-tipo">Tipo</Label>
                    <select
                      id="cli-tipo"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-soft"
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
                  <div className="space-y-1.5">
                    <Label htmlFor="cli-indirizzo">Indirizzo</Label>
                    <Input
                      id="cli-indirizzo"
                      value={state.cliente.indirizzo}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          cliente: { ...s.cliente, indirizzo: e.target.value },
                        }))
                      }
                      placeholder="via, viale, piazza + civico"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cli-citta">Città</Label>
                    <Input
                      id="cli-citta"
                      value={state.cliente.citta}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          cliente: { ...s.cliente, citta: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cli-tel">Telefono</Label>
                    <Input
                      id="cli-tel"
                      inputMode="tel"
                      value={state.cliente.telefono}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          cliente: { ...s.cliente, telefono: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cli-mail">Email</Label>
                    <Input
                      id="cli-mail"
                      type="email"
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
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="ind-cantiere" className="flex items-baseline gap-2">
                  Indirizzo cantiere
                  <span className="text-xs font-normal text-muted-foreground">
                    se diverso dall'indirizzo cliente
                  </span>
                </Label>
                <Input
                  id="ind-cantiere"
                  value={state.indirizzoCantiere}
                  onChange={(e) =>
                    setState((s) => ({ ...s, indirizzoCantiere: e.target.value }))
                  }
                  placeholder="via, civico, città"
                />
              </div>
            </CardContent>
          </Card>

          {/* ------- Voci / Tipo intervento ------- */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle className="text-base">Tipo intervento</CardTitle>
                    <CardDescription>
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {vociDefault.length}
                      </span>{' '}
                      voci sempre attive ·{' '}
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {vociBSel}
                      </span>{' '}
                      selezionate dal capo
                    </CardDescription>
                  </div>
                </div>
                {preset.length > 0 ? (
                  <select
                    className="h-9 rounded-md border border-input bg-card px-3 text-xs shadow-soft"
                    value={state.presetId}
                    onChange={(e) => applicaPreset(e.target.value)}
                  >
                    <option value="">Parti da preset…</option>
                    {preset.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sezione A — read-only summary chips */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    Sezione A · sempre attiva
                  </span>
                  <span className="inline-flex h-5 items-center rounded-full bg-primary-soft px-2 font-mono text-[10px] font-semibold text-primary">
                    {sezioneA.length} voci
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sezioneA.map((v) => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground/80"
                    >
                      <span className="h-1 w-1 rounded-full bg-primary" aria-hidden />
                      {v.nome}
                    </span>
                  ))}
                </div>
              </section>

              {/* Sezione B — selezione */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-soft-foreground">
                    Sezione B · da scegliere
                  </span>
                </div>
                {sezioneB.map(([cat, items]) => (
                  <div key={cat} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {CATEGORIA_LABEL[cat] ?? cat.replace(/_/g, ' ')}
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {items.map((v) => {
                        const checked = state.voci.has(v.id);
                        return (
                          <label
                            key={v.id}
                            className={
                              'group flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition ' +
                              (checked
                                ? 'border-primary/40 bg-primary-soft text-primary-soft-foreground shadow-soft'
                                : 'border-border bg-card hover:border-primary/20 hover:bg-primary-soft/40')
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVoce(v.id)}
                              className="h-4 w-4 accent-[color:hsl(var(--primary))]"
                            />
                            <span className="flex-1">{v.nome}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </CardContent>
          </Card>
        </div>

        {/* ============================ RIGHT RAIL (col 4) ============================ */}
        <aside className="lg:col-span-4">
          <div className="space-y-5 lg:sticky lg:top-24">
            {/* Descrizione */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <PenLine className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle className="text-base">Descrizione</CardTitle>
                    <CardDescription>Sintesi del lavoro + AI naming</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="note">Note iniziali (facoltative)</Label>
                  <textarea
                    id="note"
                    rows={3}
                    className="block w-full rounded-md border border-input bg-card p-3 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    value={state.note}
                    onChange={(e) =>
                      setState((s) => ({ ...s, note: e.target.value }))
                    }
                    placeholder="Es. caldaia da sostituire, refurbishment bagno…"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="desc" className="flex items-center gap-1">
                    Descrizione (max 30, CamelCase)
                    <span aria-hidden="true" className="text-destructive">*</span>
                    <span className="sr-only">campo obbligatorio</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="desc"
                      ref={descrizioneRef}
                      maxLength={30}
                      aria-invalid={Boolean(fieldErrors.descrizione)}
                      aria-describedby={fieldErrors.descrizione ? 'desc-error' : undefined}
                      className={
                        fieldErrors.descrizione
                          ? 'border-destructive bg-destructive/5 ring-2 ring-destructive/30 focus-visible:ring-destructive/40'
                          : undefined
                      }
                      value={state.descrizione}
                      onChange={(e) => {
                        clearFieldError('descrizione');
                        setState((s) => ({ ...s, descrizione: e.target.value }));
                      }}
                      placeholder="SistemazioneBagno"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={suggerisci}
                      disabled={genPending}
                      aria-label="Suggerisci descrizione"
                      title="Genera suggerimento AI"
                    >
                      {genPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                  {fieldErrors.descrizione ? (
                    <p
                      id="desc-error"
                      role="alert"
                      className="flex items-center gap-1.5 text-sm font-medium text-destructive"
                    >
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {fieldErrors.descrizione}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* Anteprima cartella */}
            <Card className="border-dashed">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                    <FolderTree className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
                      Anteprima cartella
                    </CardTitle>
                    <CardDescription>Verrà registrata in database</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <code className="block break-all rounded-md bg-muted/60 p-3 font-mono text-xs text-foreground">
                  /{anteprima}/
                </code>
                <p className="mt-3 text-xs text-muted-foreground">
                  La cartella fisica verrà creata quando lo storage cloud sarà
                  attivato.
                </p>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-soft"
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 mt-px"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Impossibile creare la commessa</p>
            <p className="mt-0.5 text-destructive/85">{error}</p>
          </div>
        </div>
      ) : null}

      {/* Action bar sticky in basso */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-6 py-4 md:px-10">
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {totalVoci}
            </span>{' '}
            voci totali · cartella registrata solo in DB
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild type="button" variant="ghost" disabled={submitting}>
              <Link href="/office/commesse">Annulla</Link>
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[160px]">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creazione…
                </>
              ) : (
                <>Crea commessa</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground sm:w-40">
        {label}
      </dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

function anteprimaCartella(
  rag: string,
  tipo: 'persona_fisica' | 'azienda',
  desc: string,
): string {
  const seg1 = sanitizeClient(
    tipo === 'persona_fisica'
      ? rag.trim().split(/\s+/).slice(-1)[0] ?? rag
      : rag,
  );
  const seg2 = new Date().toISOString().slice(0, 10);
  const seg3 = sanitizeClient(desc);
  return `${seg1 || 'Cliente'}_${seg2}_${seg3 || 'Commessa'}`;
}

function sanitizeClient(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 30);
}

// ---------------------------------------------------------------------
// Voice suggestion preview
// ---------------------------------------------------------------------

function VoiceSuggestionPreview({
  result,
  voci,
  showTranscript,
  setShowTranscript,
  onApply,
  onRedo,
}: {
  result: {
    transcript: string;
    suggested: VoiceSuggested;
    preview: boolean;
    previewReason?: string;
    model?: string;
  };
  voci: VoceItem[];
  showTranscript: boolean;
  setShowTranscript: (v: boolean) => void;
  onApply: () => void;
  onRedo: () => void;
}) {
  const { suggested } = result;
  const vociNames = React.useMemo(() => {
    const map = new Map(voci.map((v) => [v.id, v.nome]));
    return (suggested.voci_ids ?? [])
      .map((id) => map.get(id))
      .filter(Boolean) as string[];
  }, [voci, suggested.voci_ids]);

  const hasAny =
    suggested.ragione_sociale ||
    suggested.telefono ||
    suggested.email ||
    suggested.indirizzo ||
    suggested.citta ||
    suggested.descrizione ||
    suggested.note ||
    (suggested.voci_ids && suggested.voci_ids.length > 0) ||
    (suggested.tag_suggeriti && suggested.tag_suggeriti.length > 0);

  return (
    <div className="space-y-3">
      {result.preview ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <strong>Modalità preview.</strong>{' '}
          {result.previewReason ??
            'API key Whisper/Claude non configurate, suggerimenti basati su pattern locali.'}
        </div>
      ) : null}

      {/* Transcript (collapsable) */}
      <div className="rounded-md border border-border bg-muted/40">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          onClick={() => setShowTranscript(!showTranscript)}
        >
          <span>Trascrizione audio</span>
          <ChevronDown
            className={
              'h-4 w-4 transition ' + (showTranscript ? 'rotate-180' : '')
            }
            aria-hidden="true"
          />
        </button>
        {showTranscript ? (
          <p className="border-t border-border px-3 py-3 text-sm leading-relaxed text-foreground">
            {result.transcript}
          </p>
        ) : null}
      </div>

      {/* Suggerimenti */}
      {hasAny ? (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary-soft/40 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Suggerimenti AI
          </p>
          <dl className="space-y-1.5 text-sm">
            {suggested.ragione_sociale ? (
              <SuggRow label="Cliente">{suggested.ragione_sociale}</SuggRow>
            ) : null}
            {suggested.telefono ? (
              <SuggRow label="Telefono">{suggested.telefono}</SuggRow>
            ) : null}
            {suggested.email ? (
              <SuggRow label="Email">{suggested.email}</SuggRow>
            ) : null}
            {suggested.indirizzo ? (
              <SuggRow label="Indirizzo">{suggested.indirizzo}</SuggRow>
            ) : null}
            {suggested.citta ? (
              <SuggRow label="Città">{suggested.citta}</SuggRow>
            ) : null}
            {vociNames.length > 0 ? (
              <SuggRow label="Voci">
                <span className="flex flex-wrap gap-1">
                  {vociNames.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center rounded-full bg-card px-2 py-0.5 text-xs"
                    >
                      {n}
                    </span>
                  ))}
                </span>
              </SuggRow>
            ) : null}
            {suggested.descrizione ? (
              <SuggRow label="Descrizione">
                <code className="font-mono text-xs">{suggested.descrizione}</code>
              </SuggRow>
            ) : null}
            {suggested.tag_suggeriti && suggested.tag_suggeriti.length > 0 ? (
              <SuggRow label="Tag">
                <span className="flex flex-wrap gap-1">
                  {suggested.tag_suggeriti.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </SuggRow>
            ) : null}
            {suggested.note ? (
              <SuggRow label="Note">
                <span className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {suggested.note}
                </span>
              </SuggRow>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          Nessun campo riconoscibile nel transcript. Prova a ripetere indicando esplicitamente cliente, indirizzo e tipo di lavoro.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onRedo}>
          Registra di nuovo
        </Button>
        <Button type="button" onClick={onApply} disabled={!hasAny}>
          <Wand2 className="h-4 w-4" aria-hidden="true" />
          Applica al form
        </Button>
      </div>
    </div>
  );
}

function SuggRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:w-24">
        {label}
      </dt>
      <dd className="flex-1 text-foreground">{children}</dd>
    </div>
  );
}
