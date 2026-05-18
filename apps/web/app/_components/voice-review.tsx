'use client';

import * as React from 'react';
import {
  Check,
  Edit3,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  User,
  FileText,
  Tag,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { Button, Input, Label } from '@impiantixplus/ui';

/**
 * Voice Review (Schermo 2 del voice-intake flow).
 *
 * Dopo Whisper+extraction, il capo deve poter:
 *  - vedere cosa l'AI ha estratto, campo per campo,
 *  - confermare quello che è giusto (un tap),
 *  - modificare in-place quello che è sbagliato,
 *  - aggiungere/togliere voci dalla proposta,
 *  - rigenerare il nome cartella se la prima proposta non convince,
 *  - confermare in massa con "Conferma tutto" se è tutto ok.
 *
 * UX (decision log):
 *  - **Card-per-field**, non form lungo: ogni dato è un'unità auto-contenuta
 *    con stato proprio (pending / confirmed / edited). Le carte
 *    "confirmed" diventano verdi con check icon → feedback dopaminico ai
 *    50 anni del capo cantiere.
 *  - **Modifica inline** anziché modal: la modal su mobile è un labyrinth
 *    di chiusure accidentali. Inline = niente friction.
 *  - **Transcript collassato di default**: il capo non legge mai il
 *    transcript pieno, gli interessa solo verificare i campi. Però resta
 *    accessibile per il caso "uhm, l'AI ha capito 'doccia' invece di 'cucina'?".
 *  - **Stagger animation** sull'entry: 3-4 cards entrano fade-up
 *    intervallate, dà senso di "AI ha appena trovato N cose".
 */

export interface VoiceReviewData {
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

export interface VoceOption {
  id: number;
  nome: string;
}

export interface VoiceReviewProps {
  transcript: string;
  data: VoiceReviewData;
  voci: VoceOption[];
  /** Quando l'utente "Conferma e crea". */
  onConfirm: (data: VoiceReviewData) => void;
  /** Torna alla registrazione. */
  onRedo: () => void;
  /** Banner preview (key non configurata, fallback locale, ecc.). */
  previewReason?: string;
  /**
   * Rigenera la descrizione cartella via /api/suggerisci-nome.
   * Ritorna la nuova proposta o lancia errore.
   */
  onRegenerateName?: (input: {
    voci: number[];
    cliente?: string;
    note?: string;
  }) => Promise<{ proposta: string; alternatives: string[] }>;
}

type FieldStatus = 'pending' | 'confirmed' | 'editing';

interface FieldState<T> {
  status: FieldStatus;
  value: T;
}

export function VoiceReview({
  transcript,
  data,
  voci,
  onConfirm,
  onRedo,
  previewReason,
  onRegenerateName,
}: VoiceReviewProps) {
  const [transcriptOpen, setTranscriptOpen] = React.useState(false);

  // Stato per ogni campo "confermabile". Inizializzato come pending con
  // il valore proposto dall'AI.
  const [cliente, setCliente] = React.useState<FieldState<{
    ragione_sociale: string;
    tipo: 'persona_fisica' | 'azienda';
    telefono: string;
    email: string;
    indirizzo: string;
    citta: string;
  }>>({
    status: 'pending',
    value: {
      ragione_sociale: data.ragione_sociale ?? '',
      tipo: data.tipo ?? 'persona_fisica',
      telefono: data.telefono ?? '',
      email: data.email ?? '',
      indirizzo: data.indirizzo ?? '',
      citta: data.citta ?? '',
    },
  });

  const [vociState, setVociState] = React.useState<FieldState<number[]>>({
    status: 'pending',
    value: data.voci_ids ?? [],
  });

  const [descrizione, setDescrizione] = React.useState<FieldState<string>>({
    status: 'pending',
    value: data.descrizione ?? '',
  });
  const [descrAlternatives, setDescrAlternatives] = React.useState<string[]>([]);
  const [regenPending, setRegenPending] = React.useState(false);

  const [note, setNote] = React.useState<FieldState<string>>({
    status: 'pending',
    value: data.note ?? '',
  });

  const allConfirmed =
    cliente.status === 'confirmed' &&
    vociState.status === 'confirmed' &&
    descrizione.status === 'confirmed' &&
    note.status === 'confirmed';

  const handleConfirmAll = () => {
    setCliente((s) => ({ ...s, status: 'confirmed' }));
    setVociState((s) => ({ ...s, status: 'confirmed' }));
    setDescrizione((s) => ({ ...s, status: 'confirmed' }));
    setNote((s) => ({ ...s, status: 'confirmed' }));
  };

  const handleSubmit = () => {
    onConfirm({
      ragione_sociale: cliente.value.ragione_sociale.trim() || undefined,
      tipo: cliente.value.tipo,
      telefono: cliente.value.telefono.trim() || undefined,
      email: cliente.value.email.trim() || undefined,
      indirizzo: cliente.value.indirizzo.trim() || undefined,
      citta: cliente.value.citta.trim() || undefined,
      voci_ids: vociState.value.length > 0 ? vociState.value : undefined,
      descrizione: descrizione.value.trim() || undefined,
      note: note.value.trim() || undefined,
      tag_suggeriti: data.tag_suggeriti,
    });
  };

  const handleRegen = async () => {
    if (!onRegenerateName) return;
    setRegenPending(true);
    try {
      const r = await onRegenerateName({
        voci: vociState.value,
        cliente: cliente.value.ragione_sociale || undefined,
        note: note.value || undefined,
      });
      setDescrizione({ status: 'pending', value: r.proposta });
      setDescrAlternatives(r.alternatives ?? []);
    } catch {
      // Silenzio: il bottone resta cliccabile, l'utente può riprovare
    } finally {
      setRegenPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {previewReason ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <strong>Preview.</strong> {previewReason}
        </div>
      ) : null}

      {/* Transcript collassato */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setTranscriptOpen((o) => !o)}
          aria-expanded={transcriptOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Trascrizione completa
          </span>
          {transcriptOpen ? (
            <ChevronUp
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </button>
        {transcriptOpen ? (
          <p className="border-t border-border px-3 py-3 text-sm leading-relaxed">
            {transcript}
          </p>
        ) : null}
      </div>

      {/* Cards stagger */}
      <div className="stagger space-y-3">
        {/* Cliente */}
        <ReviewCard
          title="Cliente"
          icon={<User className="h-4 w-4" aria-hidden="true" />}
          status={cliente.status}
          onConfirm={() =>
            setCliente((s) => ({ ...s, status: 'confirmed' }))
          }
          onEdit={() =>
            setCliente((s) => ({ ...s, status: 'editing' }))
          }
        >
          {cliente.status === 'editing' ? (
            <div className="space-y-2 pt-1">
              <FieldRow
                label="Ragione sociale"
                value={cliente.value.ragione_sociale}
                onChange={(v) =>
                  setCliente((s) => ({
                    ...s,
                    value: { ...s.value, ragione_sociale: v },
                  }))
                }
              />
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-medium text-muted-foreground">Tipo:</span>
                <div className="inline-flex rounded-md border border-border p-0.5">
                  {(['persona_fisica', 'azienda'] as const).map((opt) => {
                    const active = cliente.value.tipo === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setCliente((s) => ({
                            ...s,
                            value: { ...s.value, tipo: opt },
                          }))
                        }
                        className={
                          'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                          (active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground')
                        }
                      >
                        {opt === 'persona_fisica' ? 'Persona' : 'Azienda'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <FieldRow
                label="Telefono"
                value={cliente.value.telefono}
                inputMode="tel"
                onChange={(v) =>
                  setCliente((s) => ({
                    ...s,
                    value: { ...s.value, telefono: v },
                  }))
                }
              />
              <FieldRow
                label="Email"
                value={cliente.value.email}
                inputMode="email"
                onChange={(v) =>
                  setCliente((s) => ({
                    ...s,
                    value: { ...s.value, email: v },
                  }))
                }
              />
              <FieldRow
                label="Indirizzo"
                value={cliente.value.indirizzo}
                onChange={(v) =>
                  setCliente((s) => ({
                    ...s,
                    value: { ...s.value, indirizzo: v },
                  }))
                }
              />
              <FieldRow
                label="Città"
                value={cliente.value.citta}
                onChange={(v) =>
                  setCliente((s) => ({
                    ...s,
                    value: { ...s.value, citta: v },
                  }))
                }
              />
              <Button
                type="button"
                size="sm"
                className="min-h-[40px] w-full"
                onClick={() =>
                  setCliente((s) => ({ ...s, status: 'confirmed' }))
                }
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Salva modifiche
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 text-sm">
              {cliente.value.ragione_sociale ? (
                <p className="flex items-center gap-2">
                  <User
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="font-medium">
                    {cliente.value.ragione_sociale}
                  </span>
                  <span
                    className={
                      'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider ' +
                      (cliente.value.tipo === 'azienda'
                        ? 'bg-accent/15 text-accent-soft-foreground'
                        : 'bg-primary-soft text-primary')
                    }
                  >
                    {cliente.value.tipo === 'azienda' ? 'Azienda' : 'Persona'}
                  </span>
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Nome cliente non riconosciuto. Tocca Modifica per inserirlo.
                </p>
              )}
              {cliente.value.telefono ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{cliente.value.telefono}</span>
                </p>
              ) : null}
              {cliente.value.email ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{cliente.value.email}</span>
                </p>
              ) : null}
              {cliente.value.indirizzo || cliente.value.citta ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {[cliente.value.indirizzo, cliente.value.citta]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </p>
              ) : null}
            </div>
          )}
        </ReviewCard>

        {/* Voci */}
        <ReviewCard
          title="Tipo intervento"
          icon={<Tag className="h-4 w-4" aria-hidden="true" />}
          status={vociState.status}
          onConfirm={() =>
            setVociState((s) => ({ ...s, status: 'confirmed' }))
          }
          onEdit={() => setVociState((s) => ({ ...s, status: 'editing' }))}
        >
          {vociState.status === 'editing' ? (
            <VociPicker
              voci={voci}
              selected={vociState.value}
              onChange={(next) =>
                setVociState({ status: 'editing', value: next })
              }
              onDone={() => setVociState((s) => ({ ...s, status: 'confirmed' }))}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {vociState.value.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">
                  Nessuna voce riconosciuta. Tocca Modifica per selezionarle.
                </p>
              ) : (
                vociState.value.map((id) => {
                  const v = voci.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft/40 px-2 py-0.5 text-primary-soft-foreground"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {v?.nome ?? `Voce ${id}`}
                    </span>
                  );
                })
              )}
            </div>
          )}
        </ReviewCard>

        {/* Descrizione */}
        <ReviewCard
          title="Descrizione cartella"
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          status={descrizione.status}
          onConfirm={() =>
            setDescrizione((s) => ({ ...s, status: 'confirmed' }))
          }
          onEdit={() => setDescrizione((s) => ({ ...s, status: 'editing' }))}
        >
          {descrizione.status === 'editing' ? (
            <div className="space-y-2 pt-1">
              <Input
                value={descrizione.value}
                maxLength={30}
                className="h-11 font-mono text-base"
                onChange={(e) =>
                  setDescrizione({ status: 'editing', value: e.target.value })
                }
                aria-label="Descrizione cartella CamelCase"
              />
              {descrAlternatives.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="text-muted-foreground">Alternative:</span>
                  {descrAlternatives.map((alt) => (
                    <button
                      key={alt}
                      type="button"
                      onClick={() =>
                        setDescrizione({ status: 'editing', value: alt })
                      }
                      className="rounded-full border border-border bg-muted/60 px-2 py-0.5 hover:bg-muted"
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                {onRegenerateName ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] flex-1"
                    onClick={handleRegen}
                    disabled={regenPending}
                  >
                    {regenPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Rigenera AI
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[40px] flex-1"
                  onClick={() =>
                    setDescrizione((s) => ({ ...s, status: 'confirmed' }))
                  }
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Salva
                </Button>
              </div>
            </div>
          ) : (
            <code className="block break-all rounded-md bg-muted/50 px-2 py-1 font-mono text-sm">
              {descrizione.value || '(da generare)'}
            </code>
          )}
        </ReviewCard>

        {/* Note */}
        <ReviewCard
          title="Note"
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          status={note.status}
          onConfirm={() => setNote((s) => ({ ...s, status: 'confirmed' }))}
          onEdit={() => setNote((s) => ({ ...s, status: 'editing' }))}
        >
          {note.status === 'editing' ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={note.value}
                rows={4}
                onChange={(e) =>
                  setNote({ status: 'editing', value: e.target.value })
                }
                aria-label="Note sopralluogo"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              />
              <Button
                type="button"
                size="sm"
                className="min-h-[40px] w-full"
                onClick={() =>
                  setNote((s) => ({ ...s, status: 'confirmed' }))
                }
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Salva
              </Button>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {note.value || (
                <span className="italic">
                  Nessuna nota libera estratta dall&apos;audio.
                </span>
              )}
            </p>
          )}
        </ReviewCard>
      </div>

      {/* Footer actions */}
      <div className="space-y-2 pt-2">
        {!allConfirmed ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-[48px] w-full"
            onClick={handleConfirmAll}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Conferma tutto
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="min-h-[52px] w-full text-base"
          onClick={handleSubmit}
        >
          Prosegui alla conferma
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={onRedo}
        >
          Registra di nuovo
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function ReviewCard({
  title,
  icon,
  status,
  children,
  onConfirm,
  onEdit,
}: {
  title: string;
  icon: React.ReactNode;
  status: FieldStatus;
  children: React.ReactNode;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const isConfirmed = status === 'confirmed';
  return (
    <div
      className={[
        'rounded-lg border-2 p-3 transition-colors',
        isConfirmed
          ? 'border-success/50 bg-success/5'
          : status === 'editing'
            ? 'border-primary/50 bg-primary-soft/20'
            : 'border-border bg-card',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h3>
        {isConfirmed ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success"
            aria-label="Confermato"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Ok
          </span>
        ) : null}
      </div>

      {children}

      {status !== 'editing' ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={isConfirmed ? 'ghost' : 'default'}
            className="min-h-[40px]"
            onClick={onConfirm}
            disabled={isConfirmed}
            aria-label={`Conferma ${title}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Conferma
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-[40px]"
            onClick={onEdit}
            aria-label={`Modifica ${title}`}
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            Modifica
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 text-base"
      />
    </div>
  );
}

function VociPicker({
  voci,
  selected,
  onChange,
  onDone,
}: {
  voci: VoceOption[];
  selected: number[];
  onChange: (next: number[]) => void;
  onDone: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const selectedSet = new Set(selected);

  // Mostra prima le selezionate, poi le altre se "expanded"
  const visibleNotSelected = expanded
    ? voci.filter((v) => !selectedSet.has(v.id))
    : [];

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {selected.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            Nessuna voce selezionata.
          </p>
        ) : (
          selected.map((id) => {
            const v = voci.find((x) => x.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== id))}
                className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2 py-1 text-primary-soft-foreground"
                aria-label={`Rimuovi voce ${v?.nome ?? id}`}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                {v?.nome ?? `Voce ${id}`}
                <span aria-hidden="true">×</span>
              </button>
            );
          })
        )}
      </div>

      {expanded ? (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2">
          {visibleNotSelected.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Tutte le voci sono già selezionate.
            </p>
          ) : (
            visibleNotSelected.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange([...selected, v.id])}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Plus
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                {v.nome}
              </button>
            ))
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[40px] flex-1"
          onClick={() => setExpanded((e) => !e)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {expanded ? 'Chiudi catalogo' : 'Aggiungi voce'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-[40px] flex-1"
          onClick={onDone}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Conferma voci
        </Button>
      </div>
    </div>
  );
}
