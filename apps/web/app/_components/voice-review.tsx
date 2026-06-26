'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
  X,
  Search,
  Users,
  UserCheck,
} from 'lucide-react';

import { Button, Input, Label, cn } from '@kommessa/ui';
import { ContactPickerButton } from './contact-picker-button';
import {
  creaVoceCustom,
  vociSimili,
  type VoceSimile as NuovaVoceSimile,
} from '../office/impostazioni/voci/_actions/voci';
import {
  cercaClientiPerNome,
  type ClienteSimile,
} from '../office/_actions/clienti';

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

export interface VoiceReferente {
  nome: string;
  ruolo?: string;
  telefono?: string;
  email?: string;
}

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
  referenti?: VoiceReferente[];
  /**
   * Se valorizzato, l'utente ha associato la commessa a un cliente già
   * esistente in anagrafica (match proposto dal nome rilevato dall'AI):
   * la finalizzazione userà QUESTO cliente invece di crearne uno nuovo.
   */
  clienteId?: string;
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

  // Referenti: state locale editabile per consentire all'utente di
  // aggiungere/correggere i telefoni dei referenti estratti dall'AI
  // (compatto e veloce — niente dialog, solo input inline).
  const [referenti, setReferenti] = React.useState<VoiceReferente[]>(
    () => (data.referenti ?? []).map((r) => ({ ...r })),
  );
  const updateReferenteTel = (idx: number, telefono: string) => {
    setReferenti((rs) => {
      const next = rs.slice();
      const trimmed = telefono.trim();
      next[idx] = {
        ...next[idx]!,
        telefono: trimmed.length > 0 ? trimmed : undefined,
      };
      return next;
    });
  };

  // ─── Match anagrafica clienti (evita duplicati) ────────────────────
  // L'AI legge benissimo il nome cliente dal dettato, ma finora creava
  // SEMPRE un cliente nuovo → duplicati (es. più commesse "Mirco Favini").
  // Qui, quando un nome è rilevato, cerchiamo i clienti già in anagrafica:
  // se ne troviamo, chiediamo all'utente se intende uno di quelli.
  const ragioneSociale = cliente.value.ragione_sociale;
  const [matchCandidates, setMatchCandidates] = React.useState<ClienteSimile[]>(
    [],
  );
  const [clienteEsistente, setClienteEsistente] =
    React.useState<ClienteSimile | null>(null);
  // Nome per cui l'utente ha scelto "è un nuovo cliente": nascondiamo il match
  // solo per QUEL nome. Se poi cambia nome (magari in uno già esistente) il
  // match riappare → evitiamo davvero i duplicati.
  const [dismissedForName, setDismissedForName] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    const term = ragioneSociale.trim();
    // Già associato a un esistente e il nome combacia → nessuna ricerca.
    if (
      clienteEsistente &&
      clienteEsistente.ragione_sociale.toLowerCase() === term.toLowerCase()
    ) {
      return;
    }
    // Nome cambiato rispetto al cliente associato → annulla l'associazione.
    if (clienteEsistente) {
      setClienteEsistente(null);
    }
    if (term.length < 3) {
      setMatchCandidates([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      void cercaClientiPerNome({ nome: term })
        .then((res) => {
          if (active) setMatchCandidates(res);
        })
        .catch(() => {
          if (active) setMatchCandidates([]);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [ragioneSociale, clienteEsistente]);

  const associaClienteEsistente = (c: ClienteSimile) => {
    setClienteEsistente(c);
    setDismissedForName(null);
    setMatchCandidates([]);
    // Allinea i campi mostrati al cliente reale (la panoramica li userà).
    setCliente((s) => ({
      status: 'confirmed',
      value: {
        ...s.value,
        ragione_sociale: c.ragione_sociale,
        tipo: c.tipo === 'azienda' ? 'azienda' : 'persona_fisica',
        telefono: c.telefoni?.[0] ?? s.value.telefono,
        email: c.email?.[0] ?? s.value.email,
        citta: c.citta ?? s.value.citta,
      },
    }));
  };

  const mostraMatch =
    !clienteEsistente &&
    dismissedForName !== ragioneSociale.trim() &&
    ragioneSociale.trim().length >= 3 &&
    matchCandidates.length > 0;

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
      // Referenti: usa lo state locale (potenzialmente editato — l'utente
      // può aggiungere/correggere il telefono di un referente dalla
      // sezione "Referenti rilevati" qui sotto).
      referenti: referenti.length > 0 ? referenti : undefined,
      // Se l'utente ha confermato un cliente già in anagrafica, la commessa
      // verrà associata a quello invece di crearne uno nuovo.
      clienteId: clienteEsistente?.id,
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
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs text-muted-foreground">Modifica i campi o importa dalla rubrica</span>
                <ContactPickerButton
                  onSelect={(c) =>
                    setCliente((s) => ({
                      ...s,
                      value: {
                        ...s.value,
                        ragione_sociale: c.name ?? s.value.ragione_sociale,
                        telefono: c.tel ?? s.value.telefono,
                        email: c.email ?? s.value.email,
                      },
                    }))
                  }
                />
              </div>
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

        {/* Match anagrafica: cliente già esistente con lo stesso nome. */}
        {mostraMatch ? (
          <div className="rounded-lg border-2 border-amber-400/60 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/25">
            <div className="flex items-start gap-2">
              <Users
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Cliente già in anagrafica?
                </p>
                <p className="mt-0.5 text-xs leading-snug text-amber-900/80 dark:text-amber-200/80">
                  Ho rilevato &laquo;{ragioneSociale.trim()}&raquo;.{' '}
                  {matchCandidates.length === 1
                    ? 'Esiste già questo cliente. Intendi lui?'
                    : 'Esistono già clienti simili. Intendi uno di questi?'}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {matchCandidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => associaClienteEsistente(c)}
                        className="flex w-full items-center gap-2 rounded-md border border-amber-300 bg-card px-2.5 py-2 text-left transition-colors hover:bg-amber-100/60 active:scale-[0.99] dark:border-amber-500/40 dark:hover:bg-amber-900/30"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {c.ragione_sociale}
                          </span>
                          {(c.citta || c.telefoni?.[0]) ? (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[c.citta, c.telefoni?.[0]]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          ) : null}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Usa
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setDismissedForName(ragioneSociale.trim())}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
                >
                  No, è un nuovo cliente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Cliente esistente associato: conferma + possibilità di annullare. */}
        {clienteEsistente ? (
          <div className="flex items-center gap-2 rounded-lg border-2 border-emerald-400/60 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-950/25">
            <UserCheck
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Cliente esistente associato
              </p>
              <p className="truncate text-xs text-emerald-900/80 dark:text-emerald-200/80">
                {clienteEsistente.ragione_sociale}
                {clienteEsistente.citta ? ` · ${clienteEsistente.citta}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setClienteEsistente(null);
                setDismissedForName(null);
              }}
              className="shrink-0 text-xs font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
            >
              Cambia
            </button>
          </div>
        ) : null}

        {/* Referenti rilevati dall'AI. Telefono editable inline (quick-add):
            se manca, l'utente lo aggiunge subito senza tornare dopo.
            Nome/ruolo/email restano read-only qui — modifica completa dalla
            scheda cliente post-creazione. */}
        {referenti.length > 0 ? (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-4 py-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80">
              Referenti rilevati ({referenti.length})
            </p>
            <ul className="space-y-2">
              {referenti.map((r, i) => (
                <ReferenteRow
                  key={i}
                  referente={r}
                  onTelChange={(tel) => updateReferenteTel(i, tel)}
                />
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Salvati come referenti di questa commessa. Modifica completa
              dalla scheda commessa.
            </p>
          </div>
        ) : null}

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
            className={cn('min-h-[40px]', !isConfirmed && '!bg-emerald-600 !text-white hover:!bg-emerald-700 active:!bg-emerald-800')}
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
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [showNuova, setShowNuova] = React.useState(false);
  const selectedSet = new Set(selected);

  // Filtra + ordina alfabeticamente. La ricerca normalizza accenti.
  const visibleNotSelected = React.useMemo(() => {
    if (!expanded) return [];
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const q = norm(search.trim());
    return voci
      .filter((v) => !selectedSet.has(v.id))
      .filter((v) => (q.length > 0 ? norm(v.nome).includes(q) : true))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voci, selected, expanded, search]);

  return (
    <div className="space-y-2 pt-1">
      {/* Selezionate (chip rimovibili) */}
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
        <div className="rounded-md border border-border bg-background p-2">
          {/* Search compatta sticky in alto */}
          <div className="sticky top-0 z-10 mb-1.5 flex items-center gap-1.5 bg-background pb-1.5">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca voce…"
                className="h-9 pl-8 pr-7 text-sm"
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
            <button
              type="button"
              onClick={() => setShowNuova(true)}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.04] px-2.5 text-[11px] font-medium text-primary hover:bg-primary/10 active:scale-[0.97]"
              title="Aggiungi una voce custom al catalogo"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Nuova
            </button>
          </div>
          {/* Lista alta ~55vh con scroll interno */}
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {visibleNotSelected.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {search
                  ? `Nessuna voce per "${search}". Prova "Nuova" qui sopra.`
                  : 'Tutte le voci sono già selezionate.'}
              </p>
            ) : (
              visibleNotSelected.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange([...selected, v.id])}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted active:bg-muted/70"
                >
                  <Plus
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {v.nome}
                </button>
              ))
            )}
          </div>
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

      {showNuova ? (
        <NuovaVoceQuickDialog
          initialNome={search.trim()}
          onClose={() => setShowNuova(false)}
          onCreated={() => {
            // Ricarica i dati server (la nuova voce arriverà al prossimo
            // render del parent) e riapre la lista per selezionarla.
            router.refresh();
            setSearch('');
          }}
        />
      ) : null}
    </div>
  );
}

/** Dialog mobile-friendly per aggiungere una voce custom al catalogo
 *  direttamente dal review AI. Stesso pattern del wizard 8-step. */
function NuovaVoceQuickDialog({
  initialNome,
  onClose,
  onCreated,
}: {
  initialNome: string;
  onClose: () => void;
  onCreated: () => void;
}) {
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
  const [similar, setSimilar] = React.useState<NuovaVoceSimile[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-check fuzzy on blur (non bloccante, solo warning).
  const checkSimilar = async () => {
    if (nome.trim().length < 2) return;
    try {
      const sim = await vociSimili({ nome: nome.trim() });
      if (sim.length > 0) setSimilar(sim);
    } catch {
      /* silent */
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
      setError('message' in res ? res.message : 'Errore creazione voce');
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
            <h3 className="text-base font-semibold">Nuova voce</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Prima di aggiungerla, controlla se esiste già con un nome
              simile.
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
            <label className="text-xs" htmlFor="voci-review-nuova-nome">
              Nome voce
            </label>
            <Input
              id="voci-review-nuova-nome"
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
            <label className="text-xs" htmlFor="voci-review-nuova-cat">
              Categoria
            </label>
            <select
              id="voci-review-nuova-cat"
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

/**
 * Riga referente nel review: nome + ruolo + email sono read-only (vengono
 * dall'AI). Il TELEFONO è editabile in un panel che si apre SOTTO la riga
 * (non inline), per dare spazio a tap target grande su mobile.
 *
 * Filosofia: feedback Bertaiola — "compatto ed efficace, no dialog, il
 * referente lo confermo qui e gli aggiungo il numero al volo".
 */
function ReferenteRow({
  referente,
  onTelChange,
}: {
  referente: VoiceReferente;
  onTelChange: (tel: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(referente.telefono ?? '');

  const open = () => {
    setDraft(referente.telefono ?? '');
    setEditing(true);
  };
  const commit = () => {
    onTelChange(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(referente.telefono ?? '');
    setEditing(false);
  };

  return (
    <li className="space-y-1.5 text-xs text-foreground/90">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-medium">{referente.nome}</span>
        {referente.ruolo ? (
          <span className="text-muted-foreground">· {referente.ruolo}</span>
        ) : null}
        {referente.email ? (
          <span className="break-all text-muted-foreground">
            · {referente.email}
          </span>
        ) : null}
        {referente.telefono && !editing ? (
          <button
            type="button"
            onClick={open}
            className="ml-auto inline-flex items-center gap-1 font-mono text-primary hover:underline"
            title="Modifica telefono"
          >
            <Phone className="h-3 w-3" aria-hidden="true" />
            {referente.telefono}
          </button>
        ) : null}
      </div>

      {!referente.telefono && !editing ? (
        <button
          type="button"
          onClick={open}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/40 bg-primary/[0.06] px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.97]"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          Aggiungi telefono
        </button>
      ) : null}

      {editing ? (
        <div className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-card p-1.5">
          <Phone className="ml-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <input
            type="tel"
            inputMode="tel"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                cancel();
              }
            }}
            placeholder="es. 333 1234567"
            maxLength={40}
            className="h-8 flex-1 rounded bg-transparent px-1 text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={commit}
            disabled={draft.trim().length < 3}
            aria-label="Salva telefono"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={cancel}
            aria-label="Annulla"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </li>
  );
}
