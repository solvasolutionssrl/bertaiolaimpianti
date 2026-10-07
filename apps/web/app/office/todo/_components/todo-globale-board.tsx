'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Filter,
  Pencil,
  Phone,
  UserPlus,
  Users,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import {
  aggiornaTodo,
  affidaSquadraTodo,
  eliminaTodo,
  cambiaTodoStato,
} from '../../../_actions/commessa-todo';
import { convertiRichiestaInBozza } from '../../../_actions/richieste';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { CreaTodoGlobaleDialog } from './crea-todo-globale-dialog';
import { RichiestaDialog, type RichiestaEsistente } from './richiesta-dialog';
import { type Priorita } from '@kommessa/api/priorita';
import { Scelta, SceltaMultipla } from '@/app/_components/scelta';
import { etichettaRuolo } from '@kommessa/api/identita';
import {
  descriviAssegnazione,
  etichettaNonAssegnato,
  etichettaTecnici,
} from '@kommessa/api/assegnazione';
import {
  IconaPriorita,
  PrioritaChip,
  VOCI_FILTRO_PRIORITA,
} from '@/app/_components/priorita-ui';

type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';

interface Row {
  id: string;
  titolo: string;
  descrizione: string | null;
  stato: Stato;
  priorita: Priorita;
  /** Chi ne RISPONDE: la persona a cui l'ufficio l'ha affidata. */
  assegnato_a: string | null;
  assegnato_nome: string | null;
  /**
   * Chi ci VA: mandati da chi l'ha in mano. Due domande, due posti.
   * ⚠️ **Solo sulle richieste**: su una cosa da fare di commessa e' sempre
   * vuoto, perche' li' la squadra e' quella della commessa.
   */
  squadra: Array<{ id: string; nome: string }>;
  scadenza_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  /** null = richiesta arrivata al telefono, non ancora un lavoro. */
  commessa_id: string | null;
  codice_interno: string | null;
  cliente_nome: string | null;
  contatto: string | null;
  /** Dove bisogna andare, se diverso dall'indirizzo del cliente. */
  indirizzo: string | null;
  cliente_id: string | null;
  /** Chi l'ha scritta. Su una richiesta: chi ha risposto al telefono. */
  created_at: string;
  autore_nome: string | null;
  eRichiesta: boolean;
  isScaduto: boolean;
  fonteRiunione: boolean;
}

interface Filtri {
  stato: string | null;
  priorita: Priorita | null;
  assegnato: string | null;
  commessa: string | null;
  q: string;
}

interface Props {
  todos: Row[];
  currentUserId: string;
  canWrite: boolean;
  /**
   * Tutta la squadra. Un task o una richiesta si dà a CHIUNQUE: «ordina la
   * pompa» è roba d'ufficio, «passa a vedere la caldaia» è roba da capo. Prima
   * qui arrivavano solo i `role='tecnico'`, e nel filtro un task assegnato a un
   * collega d'ufficio non si poteva nemmeno cercare.
   */
  assegnabili: Array<{ id: string; display_name: string | null; role: string }>;
  /** Titolo gia' composto a monte: `nome_cartella` non si mostra mai grezza. */
  commesseAttive: Array<{ id: string; codice: string; titolo: string; cliente: string | null }>;
  filtri: Filtri;
}

/**
 * **Due colonne, perché sono due mucchi.**
 *
 * Prima era un elenco solo, con le richieste in cima perché ordinate prima.
 * Il risultato era che sembravano la stessa cosa messa in fila — e nessuno
 * poteva dire se le richieste stessero sopra per una regola o per caso.
 *
 * Non sono la stessa cosa e non si lavorano allo stesso modo: una **richiesta**
 * è una telefonata che aspetta una decisione (chi ci va, oppure diventa una
 * commessa), un **task** è lavoro già deciso dentro un lavoro che esiste.
 * Mucchi diversi, colonne diverse, e il colore che le distingue è lo stesso
 * che hanno già sul telefono e nei badge.
 *
 * ⚠️ **Con due colonne sempre visibili il filtro «Tipo» non ha più senso**: era
 * «mostrami solo le richieste», cioè lo stesso lavoro che adesso fa la colonna.
 * Tenerlo vorrebbe dire poter svuotare una delle due colonne da un filtro che
 * sta altrove, e chi la trova vuota non saprebbe perché. Tolto.
 *
 * La larghezza: le colonne si affiancano da `xl` in su. Sotto, con i 220px
 * della barra dei filtri, la colonna delle richieste scenderebbe sotto i 300px
 * e le sue due tendine non ci starebbero.
 */
export function TodoGlobaleBoard({
  todos,
  currentUserId,
  canWrite,
  assegnabili,
  commesseAttive,
  filtri,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [creaOpen, setCreaOpen] = React.useState(false);
  const [richiestaOpen, setRichiestaOpen] = React.useState(false);
  const [richiestaInModifica, setRichiestaInModifica] =
    React.useState<RichiestaEsistente | null>(null);
  const chiediConferma = useConfirm();

  // Search input client-side (commit con debounce sul URL)
  const [qDraft, setQDraft] = React.useState(filtri.q);
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (qDraft !== filtri.q) updateFiltro('q', qDraft || null);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  function updateFiltro(key: keyof Filtri, value: string | null) {
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.push(`/office/todo?${params.toString()}`);
  }

  function clearAll() {
    router.push('/office/todo');
    setQDraft('');
  }

  /**
   * Spuntare qualcosa si chiede.
   *
   * ⚠️ `chiediConferma` **fuori** da `start`: la transizione puo' abortire la
   * callback prima che la persona abbia risposto.
   */
  const onComplete = async (row: Row) => {
    const ok = await chiediConferma({
      title: 'Segnare come fatta?',
      description: `"${row.titolo}"\n\nPassa fra le cose fatte. Si puo' riaprire.`,
      confirmLabel: 'Sì, è fatta',
    });
    if (!ok) return;
    start(async () => {
      const res = await cambiaTodoStato({ id: row.id, stato: 'completato' });
      if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
      router.refresh();
    });
  };

  /**
   * Buttare via una richiesta o un task.
   *
   * ⚠️ Da questa pagina non si poteva: `eliminaTodo` esisteva ed era
   * collegata solo dentro una commessa, quindi l'unica uscita era segnare
   * come fatta una cosa che non era stata fatta. Sulla board di Bertaiola
   * sono rimaste righe di prova — «aaaaaa», «ghugugyuguvb» — che nessuno
   * poteva togliere.
   *
   * Non si confonde con «annullata»: quella e' una cosa che era vera e non si
   * fa piu', e resta nello storico. Questa non doveva esistere.
   */
  const onElimina = async (row: Row) => {
    const ok = await chiediConferma({
      title: row.eRichiesta ? 'Eliminare la richiesta?' : 'Eliminare il task?',
      description:
        `"${row.titolo}"\n\n` +
        'Si cancellano anche le note e gli allegati. Non si torna indietro.\n\n' +
        'Se invece la cosa era vera e non si fa più, meglio segnarla come fatta: resta nello storico.',
      destructive: true,
      confirmLabel: 'Elimina',
    });
    if (!ok) return;
    start(async () => {
      const res = await eliminaTodo({ id: row.id });
      if (!res.ok) {
        await showAlert({ title: 'Non eliminata', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  // Assegnare dalla riga, senza aprire niente: è il gesto che l'ufficio fa a
  // raffica quando smaltisce il mucchio delle cose non assegnate. La notifica
  // a chi la riceve parte da `aggiornaTodo`.
  const assegnaDallaRiga = (id: string, userId: string) =>
    start(async () => {
      const res = await aggiornaTodo({ id, assegnatoA: userId || null });
      if (!res.ok) {
        await showAlert({ title: 'Non assegnato', body: res.error });
        return;
      }
      router.refresh();
    });

  // Mandare i tecnici dalla riga. ⭐ Il responsabile non si tocca: chi l'ha
  // ricevuta dall'ufficio ne risponde comunque, e l'ufficio deve sapere a chi
  // chiedere come sta andando.
  const mandaDallaRiga = (id: string, userIds: string[]) =>
    start(async () => {
      const res = await affidaSquadraTodo({ todoId: id, userIds });
      if (!res.ok) {
        await showAlert({ title: 'Non sono riuscito a mandarli', body: res.error });
        return;
      }
      router.refresh();
    });

  const creaCommessaDaRichiesta = (row: Row) =>
    start(async () => {
      const ok = await chiediConferma({
        title: 'Creare la commessa?',
        description:
          `«${row.titolo}»\n\nSi apre il form di creazione già compilato con quello che sai. ` +
          'Il codice interno e le cartelle su Nextcloud si creano solo quando confermi lì: ' +
          'da qui non si fa ancora niente di definitivo.',
        confirmLabel: 'Continua',
      });
      if (!ok) return;
      const res = await convertiRichiestaInBozza({ todoId: row.id });
      if (!res.ok) {
        await showAlert({ title: 'Non riesco a continuare', body: res.error });
        return;
      }
      router.push(`/office/commesse/nuova?bozza=${res.data.bozzaId}`);
    });

  const activeFiltri =
    (filtri.stato ? 1 : 0) +
    (filtri.priorita ? 1 : 0) +
    (filtri.assegnato ? 1 : 0) +
    (filtri.commessa ? 1 : 0) +
    (filtri.q ? 1 : 0);

  // La divisione e' un filtro sui dati che sono gia' qui: la query resta una.
  const richieste = React.useMemo(() => todos.filter((t) => t.eRichiesta), [todos]);
  const task = React.useMemo(() => todos.filter((t) => !t.eRichiesta), [todos]);

  const rigaDi = (t: Row, compatta: boolean) => (
    <TodoRow
      key={t.id}
      row={t}
      compatta={compatta}
      isMine={t.assegnato_a === currentUserId}
      currentUserId={currentUserId}
      pending={pending}
      canWrite={canWrite}
      assegnabili={assegnabili}
      onComplete={() => onComplete(t)}
      onAssegna={(userId) => assegnaDallaRiga(t.id, userId)}
      onManda={(userIds) => mandaDallaRiga(t.id, userIds)}
      onElimina={() => onElimina(t)}
      onCreaCommessa={() => creaCommessaDaRichiesta(t)}
      onModifica={() =>
        setRichiestaInModifica({
          id: t.id,
          titolo: t.titolo,
          descrizione: t.descrizione,
          contatto: t.contatto,
          priorita: t.priorita,
          assegnatoA: t.assegnato_a,
          scadenzaAt: t.scadenza_at,
          clienteId: t.cliente_id,
          clienteNome: t.cliente_nome,
          indirizzo: t.indirizzo,
          squadra: t.squadra.map((p) => p.id),
        })
      }
    />
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
      {/* ─── SIDEBAR FILTRI (sticky desktop) ─────────────────────── */}
      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <FiltroGroup label="Stato">
          <FiltroRadio
            label="Aperti + in corso"
            active={!filtri.stato}
            onClick={() => updateFiltro('stato', null)}
          />
          <FiltroRadio
            label="Solo aperti"
            active={filtri.stato === 'aperto'}
            onClick={() => updateFiltro('stato', 'aperto')}
          />
          <FiltroRadio
            label="In corso"
            active={filtri.stato === 'in_corso'}
            onClick={() => updateFiltro('stato', 'in_corso')}
          />
          <FiltroRadio
            label="Completati"
            active={filtri.stato === 'completato'}
            onClick={() => updateFiltro('stato', 'completato')}
          />
        </FiltroGroup>

        <FiltroGroup label="Priorità">
          <FiltroRadio
            label="Tutte"
            active={!filtri.priorita}
            onClick={() => updateFiltro('priorita', null)}
          />
          {VOCI_FILTRO_PRIORITA.map((v) => (
            <FiltroRadio
              key={v.valore}
              label={v.etichetta}
              icon={<IconaPriorita priorita={v.valore} className="h-3 w-3" />}
              active={filtri.priorita === v.valore}
              onClick={() => updateFiltro('priorita', v.valore)}
            />
          ))}
        </FiltroGroup>

        <FiltroGroup label="Commessa">
          {/* Duecento commesse non si scorrono a occhio: si cercano.
              ⚠️ Filtrare per commessa svuota per forza la colonna delle
              richieste, che di commessa non ne ha: la colonna lo dice. */}
          <Scelta
            opzioni={commesseAttive.map((c) => ({
              valore: c.id,
              etichetta: c.codice,
              dettaglio: [c.cliente, c.titolo].filter(Boolean).join(' — ') || undefined,
              cerca: [c.codice, c.cliente, c.titolo].filter(Boolean).join(' '),
            }))}
            valore={filtri.commessa ?? null}
            onCambia={(v) => updateFiltro('commessa', v)}
            etichettaNessuno="Tutte"
            segnaposto="Tutte"
            segnapostoRicerca="Cerca una commessa…"
            larghezzaElenco="auto"
            aria-label="Filtra per commessa"
          />
        </FiltroGroup>

        <FiltroGroup label="Assegnato">
          <FiltroRadio
            label="Da assegnare"
            icon={<UserPlus className="h-3 w-3" />}
            active={filtri.assegnato === 'nessuno'}
            onClick={() =>
              updateFiltro('assegnato', filtri.assegnato === 'nessuno' ? null : 'nessuno')
            }
          />
          <select
            value={filtri.assegnato ?? ''}
            onChange={(e) => updateFiltro('assegnato', e.target.value || null)}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs"
          >
            <option value="">Chiunque</option>
            <option value="nessuno">Non assegnato</option>
            <option value={currentUserId}>A me</option>
            {assegnabili
              .filter((t) => t.id !== currentUserId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name ?? t.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </FiltroGroup>

        {activeFiltri > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Reset filtri ({activeFiltri})
          </button>
        ) : null}
      </aside>

      {/* ─── LE DUE COLONNE ──────────────────────────────────────── */}
      <div className="min-w-0 space-y-3">
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Cerca fra task e richieste…"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[65fr_35fr]">
          <Colonna
            tono="task"
            icona={<CircleDot className="h-3.5 w-3.5" />}
            titolo="Task"
            spiegazione="Lavori dentro una commessa"
            quante={task.length}
            azione={
              canWrite ? (
                <Button size="sm" variant="outline" onClick={() => setCreaOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Nuovo task
                </Button>
              ) : null
            }
            vuoto={
              <VuotoColonna
                icona={<CheckCircle2 className="h-7 w-7 opacity-40" />}
                testo={
                  filtri.commessa
                    ? 'Nessun task su questa commessa.'
                    : activeFiltri > 0
                      ? 'Nessun task con questi filtri.'
                      : 'Nessun task aperto.'
                }
                suggerimento={
                  activeFiltri > 0 ? (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Rimuovi tutti i filtri
                    </button>
                  ) : canWrite ? (
                    <span>Si creano col pulsante «Nuovo task» qui sopra.</span>
                  ) : null
                }
              />
            }
          >
            {task.map((t) => rigaDi(t, false))}
          </Colonna>

          <Colonna
            tono="richiesta"
            icona={<Phone className="h-3.5 w-3.5" />}
            titolo="Richieste"
            spiegazione="Arrivate al telefono, non ancora un lavoro"
            quante={richieste.length}
            azione={
              canWrite ? (
                <Button size="sm" onClick={() => setRichiestaOpen(true)}>
                  <Phone className="h-3.5 w-3.5" />
                  Al telefono
                </Button>
              ) : null
            }
            vuoto={
              <VuotoColonna
                icona={<Phone className="h-7 w-7 opacity-40" />}
                testo={
                  filtri.commessa
                    ? 'Le richieste non hanno una commessa.'
                    : activeFiltri > 0
                      ? 'Nessuna richiesta con questi filtri.'
                      : 'Nessuna richiesta da smistare.'
                }
                suggerimento={
                  filtri.commessa ? (
                    <span>
                      Il filtro per commessa le esclude tutte: diventano un lavoro solo
                      quando si crea la commessa.
                    </span>
                  ) : activeFiltri > 0 ? (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Rimuovi tutti i filtri
                    </button>
                  ) : canWrite ? (
                    <span>
                      Si registrano col pulsante «Al telefono»: chi chiama, cosa serve, e a
                      chi la passi.
                    </span>
                  ) : null
                }
              />
            }
          >
            {richieste.map((t) => rigaDi(t, true))}
          </Colonna>
        </div>
      </div>

      {creaOpen ? (
        <CreaTodoGlobaleDialog
          commesseAttive={commesseAttive}
          tecnici={assegnabili}
          onClose={() => setCreaOpen(false)}
        />
      ) : null}

      {richiestaOpen ? (
        <RichiestaDialog
          assegnabili={assegnabili}
          onClose={() => setRichiestaOpen(false)}
        />
      ) : null}

      {richiestaInModifica ? (
        <RichiestaDialog
          assegnabili={assegnabili}
          esistente={richiestaInModifica}
          onClose={() => setRichiestaInModifica(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Una delle due colonne: intestazione con il nome, il conto e il suo tasto, e
 * sotto le righe. La tinta e' **della colonna**, non delle righe: prima ogni
 * riga-richiesta portava il proprio bordo ambra, che adesso sarebbe la stessa
 * cosa detta due volte.
 */
function Colonna({
  tono,
  icona,
  titolo,
  spiegazione,
  quante,
  azione,
  vuoto,
  children,
}: {
  tono: 'task' | 'richiesta';
  icona: React.ReactNode;
  titolo: string;
  spiegazione: string;
  quante: number;
  azione: React.ReactNode;
  vuoto: React.ReactNode;
  children: React.ReactNode;
}) {
  const eRichiesta = tono === 'richiesta';
  return (
    <section className="min-w-0">
      <Card
        className={cn(
          'overflow-hidden',
          eRichiesta
            ? 'border-amber-500/25 bg-amber-500/[0.035]'
            : 'border-primary/20 bg-primary/[0.025]',
        )}
      >
        <header
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5',
            eRichiesta ? 'border-amber-500/20' : 'border-primary/15',
          )}
        >
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
              eRichiesta
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-primary/10 text-primary',
            )}
          >
            {icona}
          </span>
          <div className="min-w-0">
            <h2 className="flex items-baseline gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
              {titolo}
              <span className="font-sans text-xs font-normal tabular-nums text-muted-foreground">
                {quante}
              </span>
            </h2>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {spiegazione}
            </p>
          </div>
          {azione ? <div className="ml-auto shrink-0">{azione}</div> : null}
        </header>

        <CardContent className="divide-y divide-border/60 p-0">
          {quante === 0 ? vuoto : children}
        </CardContent>
      </Card>
    </section>
  );
}

function VuotoColonna({
  icona,
  testo,
  suggerimento,
}: {
  icona: React.ReactNode;
  testo: string;
  suggerimento: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      {icona}
      <p className="font-medium">{testo}</p>
      {suggerimento ? <p className="max-w-xs text-xs">{suggerimento}</p> : null}
    </div>
  );
}

function FiltroGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FiltroRadio({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
          : 'border-transparent bg-transparent text-foreground hover:bg-muted',
      )}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** L'etichetta del cestino dice cosa si butta: cambia la parola, non l'icona. */
function eRichiestaOTask(row: Row): string {
  return row.eRichiesta ? 'Elimina la richiesta' : 'Elimina il task';
}

// ─── Sub components ───────────────────────────────────────────────────

function TodoRow({
  row,
  compatta,
  isMine,
  currentUserId,
  pending,
  canWrite,
  assegnabili,
  onComplete,
  onCreaCommessa,
  onModifica,
  onAssegna,
  onManda,
  onElimina,
}: {
  row: Row;
  /**
   * La colonna stretta. ⚠️ Non e' un vezzo: a 35% di larghezza le due tendine
   * («Assegna a…» e «Manda…») piu' la matita e «Crea commessa» non stanno
   * sulla stessa riga del titolo. Qui vanno su una riga loro, sotto.
   */
  compatta: boolean;
  isMine: boolean;
  currentUserId: string;
  pending: boolean;
  canWrite: boolean;
  assegnabili: Array<{ id: string; display_name: string | null; role: string }>;
  onComplete: () => void;
  onCreaCommessa: () => void;
  onModifica: () => void;
  onAssegna: (userId: string) => void;
  onManda: (userIds: string[]) => void;
  onElimina: () => void;
}) {
  const completed = row.stato === 'completato' || row.stato === 'annullato';

  const opzioniPersone = assegnabili.map((u) => ({
    valore: u.id,
    etichetta: u.display_name ?? u.id.slice(0, 8),
    gruppo: etichettaRuolo(u.role, 'plurale'),
  }));

  const azioni = (
    <>
      {/* Non assegnato: si assegna da qui, senza aprire niente. È il gesto
          che l'ufficio ripete a raffica smaltendo il mucchio. */}
      {canWrite && !completed && !row.assegnato_a ? (
        <Scelta
          opzioni={opzioniPersone}
          valore={null}
          onCambia={(v) => {
            if (v) onAssegna(v);
          }}
          segnaposto="Assegna a…"
          segnapostoRicerca="Cerca…"
          disabilitato={pending}
          larghezzaElenco="auto"
          className="max-w-[9rem]"
          aria-label={`Assegna «${row.titolo}» a una persona`}
        />
      ) : null}

      {/* ⭐ Mandare i suoi e' il gesto del caposquadra, e si fa dalla riga
          come si assegna: aprire un modulo per girare un lavoro che si e'
          appena letto e' un passaggio in piu' ripetuto venti volte al
          giorno. Il responsabile resta lui.
          ⚠️ **Solo sulle richieste.** Dentro una commessa il lavoro ha gia'
          la sua squadra e la cosa da fare ha un assegnatario solo: una
          seconda tendina qui sarebbe un campo da compilare che non decide
          niente, e un secondo posto dove guardare per sapere chi ci pensa. */}
      {canWrite && !completed && row.eRichiesta ? (
        <SceltaMultipla
          opzioni={opzioniPersone}
          valori={row.squadra.map((p) => p.id)}
          onCambia={onManda}
          segnaposto="Manda…"
          segnapostoRicerca="Cerca una persona…"
          disabilitato={pending}
          larghezzaElenco="auto"
          className="max-w-[11rem]"
          aria-label={`Manda qualcuno su «${row.titolo}»`}
        />
      ) : null}

      {row.eRichiesta ? (
        canWrite && !completed ? (
          <>
            <button
              type="button"
              onClick={onModifica}
              disabled={pending}
              title="Modifica la richiesta"
              aria-label="Modifica la richiesta"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <Button size="sm" variant="outline" onClick={onCreaCommessa} disabled={pending}>
              Crea commessa
            </Button>
          </>
        ) : null
      ) : (
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
      )}

      {/* Il cestino sta per ultimo, lontano dal cerchietto che spunta: due
          gesti opposti vicini si sbagliano. */}
      {canWrite ? (
        <button
          type="button"
          onClick={onElimina}
          disabled={pending}
          title={eRichiestaOTask(row)}
          aria-label={eRichiestaOTask(row)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );

  return (
    <div className={cn('px-4 py-3 transition-colors hover:bg-background/60')}>
      <div className="flex items-start gap-3">
        {!completed ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={pending}
            aria-label={
              row.eRichiesta
                ? `Segna come fatta la richiesta «${row.titolo}»`
                : `Segna come fatto il task «${row.titolo}»`
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 disabled:opacity-50"
          >
            <Circle className="h-4 w-4" />
          </button>
        ) : (
          <CheckCircle2 className="mt-2.5 h-4 w-4 shrink-0 text-emerald-600" />
        )}

        <Contenitore commessaId={row.commessa_id}>
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'min-w-0 flex-1 truncate text-sm font-medium',
                completed && 'text-muted-foreground line-through',
              )}
            >
              {row.titolo}
            </p>
            <PrioritaChip priorita={row.priorita} />
            {row.stato === 'in_corso' ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                In corso
              </Badge>
            ) : null}
            {/* ⚠️ Il badge «Richiesta» non c'e' piu': lo dice la colonna, e
                dirlo due volte nello stesso sguardo non aggiunge niente. */}
            {row.fonteRiunione ? (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 text-[10px] uppercase text-primary"
                title="Nato dal report di una riunione"
              >
                <Sparkles className="mr-0.5 h-2.5 w-2.5" />
                Da riunione
              </Badge>
            ) : null}
          </div>
          <MetaRiga row={row} isMine={isMine} currentUserId={currentUserId} />
        </Contenitore>

        {!compatta ? (
          <div className="flex shrink-0 items-center gap-1.5">{azioni}</div>
        ) : null}
      </div>

      {compatta ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 pl-12">
          {azioni}
        </div>
      ) : null}
    </div>
  );
}

/**
 * La riga sotto il titolo: codice, cliente, contatto, chi se ne occupa, chi
 * l'ha scritta, entro quando.
 *
 * ⭐ **Chi se ne occupa sono due fatti, non due verita' sulla stessa cosa.**
 * Qui si leggeva «In mano a nessuno» accanto a «Ci va Mario» — due modi di
 * dire casalinghi che sembravano smentirsi. Le parole stanno in
 * `@kommessa/api/assegnazione`, le stesse che si leggono sul telefono, e la
 * riga vuota non si scrive: in un elenco fitto le icone distinguono le due
 * cose e il nome per esteso sta nel suggerimento al passaggio del mouse.
 */
function MetaRiga({
  row,
  isMine,
  currentUserId,
}: {
  row: Row;
  isMine: boolean;
  currentUserId: string;
}) {
  const nomeDi = (id: string, nome: string) => (id === currentUserId ? 'Tu' : nome);
  const responsabile = row.assegnato_nome
    ? isMine
      ? 'Tu'
      : row.assegnato_nome
    : null;
  const tecnici = row.squadra.map((p) => nomeDi(p.id, p.nome));

  const righe = descriviAssegnazione(
    { responsabile, tecnici },
    row.eRichiesta ? 'richiesta' : 'task',
  );
  const perEsteso = righe.map((r) => `${r.etichetta}: ${r.valore}`).join(' · ');

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {row.codice_interno ? <span className="font-mono">{row.codice_interno}</span> : null}
      {row.cliente_nome ? (
        <span className={row.eRichiesta ? 'font-medium text-foreground' : undefined}>
          {row.cliente_nome}
        </span>
      ) : null}
      {row.eRichiesta && row.contatto ? (
        <span className="font-mono">{row.contatto}</span>
      ) : null}

      {responsabile ? (
        <span className={isMine ? 'text-primary' : ''} title={perEsteso}>
          <User className="mr-0.5 inline h-3 w-3" />
          {responsabile}
        </span>
      ) : tecnici.length === 0 ? (
        <span className="italic">
          {etichettaNonAssegnato(row.eRichiesta ? 'richiesta' : 'task')}
        </span>
      ) : null}

      {tecnici.length > 0 ? (
        <span
          className="text-foreground"
          title={`${etichettaTecnici(tecnici.length)}: ${tecnici.join(', ')}`}
        >
          <Users className="mr-0.5 inline h-3 w-3" />
          {tecnici.slice(0, 2).join(', ')}
          {tecnici.length > 2 ? ` +${tecnici.length - 2}` : ''}
        </span>
      ) : null}

      {/* Chi l'ha scritta. Su una richiesta e' chi ha risposto al telefono, ed
          e' la prima cosa che si chiede quando una riga non si capisce. */}
      {row.autore_nome ? (
        <span title={`${row.eRichiesta ? 'Registrata' : 'Creato'} da ${row.autore_nome} il ${fmtDataBreve(row.created_at)}`}>
          <Pencil className="mr-0.5 inline h-2.5 w-2.5" />
          {row.autore_nome}
        </span>
      ) : null}

      {row.scadenza_at ? (
        <span className={row.isScaduto ? 'font-semibold text-destructive' : ''}>
          <Calendar className="mr-0.5 inline h-3 w-3" />
          {fmtDataBreve(row.scadenza_at)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Il corpo della riga è un link alla commessa — ma una richiesta non ce l'ha
 * ancora, e `/office/commesse/null/lavori` è una pagina che non esiste: lì il
 * contenuto resta testo, e si agisce coi pulsanti accanto.
 */
function Contenitore({
  commessaId,
  children,
}: {
  commessaId: string | null;
  children: React.ReactNode;
}) {
  if (!commessaId) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <Link href={`/office/commesse/${commessaId}/lavori`} className="min-w-0 flex-1">
      {children}
    </Link>
  );
}

function fmtDataBreve(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: 'short',
      year: sameYear ? undefined : '2-digit',
    });
  } catch {
    return iso;
  }
}
