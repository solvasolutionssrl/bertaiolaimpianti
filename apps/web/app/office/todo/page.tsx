import { AlertCircle, CircleDot, Clock, Flame, UserPlus } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { cn } from '@kommessa/ui';

import { elencaAssegnabiliTenant } from '../../_actions/commessa-tecnici';
import { TodoGlobaleBoard, type Row } from './_components/todo-globale-board';
import { confrontaPriorita, type Priorita } from '@kommessa/api/priorita';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';
import { normalizzaTesto, testoCorrisponde } from '@kommessa/api/scelta-opzioni';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

/** Una commessa come serve a chi la deve scegliere da una tendina. */
type CommessaPicker = {
  id: string;
  codice_interno: string;
  nome_cartella: string | null;
  descrizione_ai_finale: string | null;
  descrizione_ai_proposta: string | null;
  note_iniziali: string | null;
  cliente: { ragione_sociale: string | null } | null;
};

export const metadata = { title: 'Task e Richieste' };
export const dynamic = 'force-dynamic';

type Stato = 'aperto' | 'in_corso' | 'completato' | 'annullato';


/**
 * ⚠️ `string | string[]`, perché è quello che Next consegna davvero:
 * `?stato=a&stato=b` arriva come array. Dichiararlo `string` non lo impedisce,
 * nasconde solo che va normalizzato.
 */
interface SearchParams {
  stato?: string | string[];
  priorita?: string | string[];
  assegnato?: string | string[];
  commessa?: string | string[];
  q?: string | string[];
}

const STATI_DEFAULT: Stato[] = ['aperto', 'in_corso'];
/** Cio' che l'indirizzo puo' chiedere: tutto il resto si ignora. */
const STATI_AMMESSI = ['aperto', 'in_corso', 'completato', 'annullato'] as const;
const PRIORITA_AMMESSE = ['urgente', 'alta', 'media', 'bassa'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vista globale TODO cross-commessa.
 *
 * Sostituisce concettualmente la vecchia tab "Tickets". Mostra tutti i
 * TODO del tenant con filtri: stato, priorità, assegnatario, commessa,
 * testo. Default = aperti + in_corso ordinati per priorità+scadenza.
 *
 * Click su un TODO → atterra in /office/commesse/<id>/lavori per
 * gestirlo nel contesto della commessa (completa, note, etc).
 *
 * "Nuovo TODO" qui apre dialog con commessa picker → crea via server
 * action commessa-todo.
 */
export default async function TodoGlobalePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // ─── parse filtri ──────────────────────────────────────────────────
  //
  // ⚠️ **Cio' che arriva dall'indirizzo non e' un dato, e' un'ipotesi.** Next
  // consegna un `string | string[]`, e la persona (o un segnalibro vecchio, o
  // un collegamento condiviso) puo' metterci quello che vuole. Infilato dritto
  // in `.in()` su una colonna enum o in `.eq()` su una colonna uuid, un valore
  // storto non torna «nessun risultato»: fa fallire la query. E da quando si
  // legge a pagine, una query che fallisce **solleva**, quindi non e' piu' una
  // board vuota — e' la pagina d'errore, guscio dell'ufficio compreso.
  const uno = (v: string | string[] | undefined): string | null =>
    (Array.isArray(v) ? v[0] : v) ?? null;

  const statoChiesto = uno(searchParams.stato);
  const statoFiltro: Stato | null =
    statoChiesto && (STATI_AMMESSI as readonly string[]).includes(statoChiesto)
      ? (statoChiesto as Stato)
      : null;
  const statiFiltro: Stato[] = statoFiltro ? [statoFiltro] : STATI_DEFAULT;

  const prioritaChiesta = uno(searchParams.priorita);
  const prioritaFiltro =
    prioritaChiesta && (PRIORITA_AMMESSE as readonly string[]).includes(prioritaChiesta)
      ? (prioritaChiesta as Priorita)
      : null;

  // `nessuno` e' una parola convenzionale; tutto il resto deve essere un uuid,
  // o non e' un assegnatario.
  const assegnatoChiesto = uno(searchParams.assegnato);
  const assegnatoFiltro =
    assegnatoChiesto === 'nessuno' || (assegnatoChiesto && UUID.test(assegnatoChiesto))
      ? assegnatoChiesto
      : null;

  const commessaChiesta = uno(searchParams.commessa);
  const commessaFiltro = commessaChiesta && UUID.test(commessaChiesta) ? commessaChiesta : null;

  // ⭐ **La ricerca non passa più dal database, e non è una scorciatoia.**
  // Si cerca anche per **nome cliente**, e il cliente non è una colonna di
  // `commessa_todo`: su una richiesta sta in anagrafica (`cliente_id`) oppure
  // nel testo di come è stato detto al telefono, su un task sta sul cliente
  // della commessa. Per filtrarlo lato server servirebbero due letture in più
  // per raccogliere gli id e poi infilarli in un `in.(…)` — centinaia di UUID
  // nell'indirizzo, che per giunta cresce a ogni pagina.
  //
  // Qui si cerca su **ciò che si vede a schermo**, con la stessa meccanica a
  // token delle tendine (`@kommessa/api/scelta-opzioni`): accenti piegati,
  // tutte le parole devono comparire, in qualunque campo. E il costo non
  // cambia: anche senza ricerca questa pagina legge **tutte** le righe aperte,
  // perché le due colonne le mostrano tutte. (I conteggi in alto si fanno
  // invece sul risultato filtrato, ed è voluto: cercando, i numeri devono
  // parlare di quello che si sta guardando.)
  //
  // ⚠️ **Non rimettere un `or=(…)` con dentro il testo digitato.** PostgREST
  // spezza il corpo di `or` sulle virgole di primo livello: «Rossi, via Verdi»
  // diventa quattro termini, due dei quali non sono filtri, e la richiesta
  // torna 400 — che da quando si legge a pagine vuol dire pagina d'errore, non
  // elenco vuoto.
  const qFiltro = (uno(searchParams.q) ?? '').trim();

  // ─── query principale ──────────────────────────────────────────────
  //
  // ⚠️ **Una query nuova per ogni pagina, non la stessa riusata.** Il
  // costruttore di postgrest-js e' mutabile e `order()` **accoda**: riusando lo
  // stesso oggetto, la seconda pagina chiederebbe
  // `order=priorita,id,priorita,id` e la terza sei termini. Oggi non si vede
  // (una pagina sola basta), e si vedrebbe esattamente il giorno in cui i dati
  // crescono — cioe' il difetto che questa lettura a pagine doveva togliere.
  const pagina = (da: number, a: number) => {
    let q = supabase
      .from('commessa_todo' as never)
      .select(
        `id, titolo, descrizione, stato, priorita, assegnato_a, scadenza_at,
       sort_order, metadata, created_at, completato_at, commessa_id,
       cliente_id, cliente_testo, contatto, indirizzo,
       richiedente:clienti!commessa_todo_cliente_id_fkey ( ragione_sociale ),
       commessa:commesse!commessa_todo_commessa_id_fkey (
         id, codice_interno, nome_cartella,
         cliente:clienti ( ragione_sociale )
       ),
       assegnato:users!commessa_todo_assegnato_a_fkey ( id, display_name ),
       autore:users!commessa_todo_created_by_fkey ( id, display_name ),
       squadra:commessa_todo_squadra (
         user_id,
         persona:users!commessa_todo_squadra_user_id_fkey ( id, display_name )
       )`,
      )
      .in('stato', statiFiltro);

    if (prioritaFiltro) q = q.eq('priorita', prioritaFiltro);
    if (assegnatoFiltro === 'nessuno') {
      q = q.is('assegnato_a', null);
    } else if (assegnatoFiltro) {
      q = q.eq('assegnato_a', assegnatoFiltro);
    }
    if (commessaFiltro) q = q.eq('commessa_id', commessaFiltro);
    // Il terzo ordinamento chiude su una colonna unica: senza, fra una pagina e
    // l'altra una riga puo' perdersi o ripetersi.
    return q.order('priorita').order('id').range(da, a) as unknown as PromiseLike<
      EsitoPagina<any>
    >;
  };

  let todosRaw: any[];
  try {
    todosRaw = await leggiTutto<any>(pagina, { contesto: 'task e richieste' });
  } catch (e) {
    // Una lettura che non riesce non deve portarsi via tutta la pagina: si dice
    // cosa è successo e si lascia in piedi il resto del guscio.
    return (
      <div className="w-full space-y-4">
        <header className="border-b border-border pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Lavori
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Task e Richieste</h1>
        </header>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <p className="font-semibold text-destructive">Non riesco a leggere l’elenco</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {e instanceof Error ? e.message : String(e)}
          </p>
        </div>
      </div>
    );
  }

  // ─── liste per filtri (commesse attive + tecnici) ──────────────────
  const [commesseRighe, assegnabili] = await Promise.all([
    // ⚠️ Lettura **completa**, non `.limit(200)`: su Bertaiola le commesse
    // attive sono 202, e le ultime due non comparivano ne' nel filtro ne' nel
    // modulo — senza nessun segnale. E' lo stesso difetto dei clienti di
    // settembre: un tetto scelto a occhio diventa un dato invisibile appena i
    // dati crescono.
    leggiTutto<CommessaPicker>(
      (da, a) =>
        supabase
          .from('commesse')
          .select(
            'id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali, cliente:clienti(ragione_sociale)',
          )
          .in('stato', ['bozza', 'aperta', 'in_corso', 'collaudo'])
          .order('codice_interno', { ascending: false })
          .order('id')
          .range(da, a),
      { contesto: 'commesse per il filtro dei task' },
    ),
    // Un task o una richiesta si dà a CHIUNQUE della squadra, non solo ai
    // tecnici: «chiama il fornitore» è roba d'ufficio, «passa a vedere la
    // caldaia» è roba da capo.
    elencaAssegnabiliTenant(),
  ]);

  // ─── trasforma + ordina ────────────────────────────────────────────
  // Il tipo `Row` arriva da chi lo consuma (`TodoGlobaleBoard`): era scritto a
  // mano anche qui, ventidue campi, e divergere era questione di tempo.
  const now = Date.now();
  const tutte: Row[] = todosRaw.map((t) => {
    const comm = Array.isArray(t.commessa) ? t.commessa[0] : t.commessa;
    const cli = comm
      ? Array.isArray(comm.cliente)
        ? comm.cliente[0]
        : comm.cliente
      : null;
    const ass = Array.isArray(t.assegnato) ? t.assegnato[0] : t.assegnato;
    const aut = Array.isArray(t.autore) ? t.autore[0] : t.autore;
    const richiedente = Array.isArray(t.richiedente) ? t.richiedente[0] : t.richiedente;
    const fonte = (t.metadata as { fonte?: string } | null)?.fonte ?? '';
    const eRichiesta = (t.commessa_id ?? null) === null;
    return {
      id: t.id as string,
      titolo: t.titolo as string,
      descrizione: (t.descrizione as string | null) ?? null,
      stato: t.stato as Stato,
      priorita: t.priorita as Priorita,
      assegnato_a: (t.assegnato_a as string | null) ?? null,
      assegnato_nome: (ass?.display_name as string | undefined) ?? null,
      squadra: ((t.squadra ?? []) as Array<any>)
        .map((s) => {
          const pr = Array.isArray(s.persona) ? s.persona[0] : s.persona;
          return {
            id: (pr?.id as string | undefined) ?? (s.user_id as string),
            nome: (pr?.display_name as string | undefined) ?? '—',
          };
        })
        .sort((x, y) => x.nome.localeCompare(y.nome, 'it')),
      scadenza_at: (t.scadenza_at as string | null) ?? null,
      sort_order: t.sort_order as number,
      metadata: (t.metadata as Record<string, unknown> | null) ?? null,
      commessa_id: (t.commessa_id as string | null) ?? null,
      codice_interno: (comm?.codice_interno as string | undefined) ?? null,
      // Sulle richieste il cliente è quello della telefonata: in anagrafica se
      // c'era, altrimenti il nome così come è stato detto.
      cliente_nome: eRichiesta
        ? ((richiedente?.ragione_sociale as string | undefined) ??
          (t.cliente_testo as string | null) ??
          null)
        : ((cli?.ragione_sociale as string | undefined) ?? null),
      contatto: (t.contatto as string | null) ?? null,
      indirizzo: (t.indirizzo as string | null) ?? null,
      cliente_id: (t.cliente_id as string | null) ?? null,
      created_at: t.created_at as string,
      autore_nome: (aut?.display_name as string | undefined) ?? null,
      eRichiesta,
      isScaduto: t.scadenza_at
        ? new Date(t.scadenza_at as string).getTime() < now
        : false,
      fonteRiunione: typeof fonte === 'string' && fonte.startsWith('riunione:'),
    };
  });

  // ⭐ **La ricerca guarda quello che la riga mostra**, nome del cliente
  // compreso: era la cosa che l'ufficio cercava e l'unica che non si poteva
  // cercare. Il cliente qui è già risolto con la sua catena di ripieghi
  // (anagrafica → come è stato detto al telefono → cliente della commessa),
  // quindi si cerca esattamente la parola che si legge.
  const todos = qFiltro
    ? tutte.filter((t) =>
        testoCorrisponde(
          normalizzaTesto(
            [
              t.titolo,
              t.descrizione,
              t.cliente_nome,
              t.codice_interno,
              t.contatto,
              t.indirizzo,
              t.autore_nome,
            ]
              .filter(Boolean)
              .join(' '),
          ),
          qFiltro,
        ),
      )
    : tutte;

  // ⚠️ Non si ordina piu' per «prima le richieste»: adesso stanno in una
  // colonna loro, e dentro ciascuna colonna conta solo l'urgenza.
  todos.sort((a, b) => {
    if (a.isScaduto !== b.isScaduto) return a.isScaduto ? -1 : 1;
    const dPri = confrontaPriorita(a.priorita, b.priorita);
    if (dPri !== 0) return dPri;
    return a.titolo.localeCompare(b.titolo, 'it');
  });

  // ─── KPI sintetici ─────────────────────────────────────────────────
  // ⚠️ Il conto delle richieste non sta piu' qui: lo porta l'intestazione
  // della sua colonna, che e' il posto dove uno lo cerca.
  const kpi = {
    // Il mucchio da smistare: aperte e senza nessuno che ci stia dietro.
    daAssegnare: todos.filter(
      (t) => !t.assegnato_a && t.stato !== 'completato' && t.stato !== 'annullato',
    ).length,
    aperti: todos.filter((t) => t.stato === 'aperto').length,
    inCorso: todos.filter((t) => t.stato === 'in_corso').length,
    urgenti: todos.filter((t) => t.priorita === 'urgente').length,
    scaduti: todos.filter((t) => t.isScaduto).length,
  };

  // ⚠️ Il titolo si compone qui, non a schermo: `nome_cartella` e' la directory
  // su Nextcloud (`{codice}_{cliente}_{lavoro}`) e non si mostra mai grezza.
  // Prima la tendina del modulo e il filtro della barra la stampavano tale e
  // quale, uno dei due troncata a trenta caratteri.
  const commesseAttive = commesseRighe.map((c) => ({
    id: c.id,
    codice: c.codice_interno,
    titolo: risolviTitoloCommessa({
      descrizione_ai_finale: c.descrizione_ai_finale,
      descrizione_ai_proposta: c.descrizione_ai_proposta,
      note_iniziali: c.note_iniziali,
      nome_cartella: c.nome_cartella,
      codice_interno: c.codice_interno,
      cliente_nome: c.cliente?.ragione_sociale ?? null,
    }),
    cliente: c.cliente?.ragione_sociale ?? null,
  }));

  return (
    /* ⚠️ Nessun `mx-auto max-w-* p-*` qui: i margini li mette il guscio
       (`<main>` e' gia' `max-w-[1760px] px-3 py-4 md:px-5`). Questa pagina li
       aggiungeva una seconda volta e si stringeva di 360px — con due colonne
       affiancate quei pixel sono righe che vanno a capo. */
    <div className="w-full space-y-4">
      {/* Header compatto: titolo + KPI inline */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Lavori
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Task e Richieste</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {kpi.daAssegnare > 0 ? (
            <KpiChip
              icon={<UserPlus />}
              label="Da assegnare"
              value={kpi.daAssegnare}
              tone="amber"
            />
          ) : null}
          <KpiChip icon={<CircleDot />} label="Aperti" value={kpi.aperti} />
          <KpiChip icon={<Clock />} label="In corso" value={kpi.inCorso} tone="blue" />
          <KpiChip icon={<Flame />} label="Urgenti" value={kpi.urgenti} tone="red" />
          <KpiChip icon={<AlertCircle />} label="Scaduti" value={kpi.scaduti} tone="amber" />
        </div>
      </header>

      {/* Board: sidebar filtri + lista */}
      <TodoGlobaleBoard
        todos={todos}
        currentUserId={ctx.userId}
        canWrite={ctx.role === 'admin' || ctx.role === 'office'}
        assegnabili={assegnabili}
        commesseAttive={commesseAttive}
        filtri={{
          stato: statoFiltro,
          priorita: prioritaFiltro,
          assegnato: assegnatoFiltro,
          commessa: commessaFiltro,
          q: qFiltro,
        }}
      />
    </div>
  );
}

function KpiChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'blue' | 'red' | 'amber';
}) {
  const toneCls = {
    default: 'border-border text-foreground',
    blue: 'border-blue-500/30 text-blue-700 dark:text-blue-400',
    red: 'border-red-500/30 text-red-700 dark:text-red-400',
    amber: 'border-amber-500/30 text-amber-700 dark:text-amber-400',
  }[tone];
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1',
        toneCls,
      )}
    >
      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
        {label}
      </span>
      <span className="font-mono text-sm font-bold tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
    </div>
  );
}
