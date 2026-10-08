'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownUp,
  Calendar,
  ChevronRight,
  Circle,
  Loader2,
  MapPin,
  Phone,
  Search,
  X,
} from 'lucide-react';

import { StatoLed } from '@kommessa/ui';
import type { StatoCommessa } from '@kommessa/api/types';
import type { Priorita } from '@kommessa/api/priorita';
import { metaPriorita } from '@kommessa/api/priorita';
import {
  FILTRI_ELENCO,
  ORDINI_ELENCO,
  componiElenco,
  contaPerFiltro,
  raggruppaElenco,
  type FiltroElenco,
  type OrdineElenco,
  type VoceElenco,
} from '@kommessa/api/elenco-lavoro';

import { IconaPriorita } from '@/app/_components/priorita-ui';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { cambiaTodoStato } from '@/app/_actions/commessa-todo';
import { titoloCase } from '../_lib/display-case';
import { Stagger } from './blueprint';
import { Evidenziabile } from './evidenzia';

/**
 * **L'elenco di cosa ha in mano un tecnico: un elenco solo, cercabile.**
 *
 * ## Com'era, e perché non bastava
 *
 * Due sezioni separate e mute: «Cosa fare», tagliata a otto voci, e «In
 * carico», tagliata a trenta. Nessuna ricerca, nessun filtro, nessun ordine
 * dichiarato. Con due commesse funziona. Il problema è che non c'era nessun
 * modo di **arrivare** a una voce: la si scorreva fino a trovarla, e le cose
 * da fare oltre l'ottava non esistevano affatto.
 *
 * ## Le scelte
 *
 * **Un elenco, non due.** La domanda di chi apre l'app al mattino è «cosa
 * faccio adesso», e la risposta non sta tutta nelle commesse né tutta nelle
 * cose da fare. Chi vuole separarle ha le pastiglie.
 *
 * **L'ordine è dichiarato a schermo**, non implicito: il tasto dice quale
 * criterio è attivo. Un elenco ordinato per una regola che non si vede è un
 * elenco di cui non ti fidi.
 *
 * **Il conteggio delle pastiglie segue la ricerca.** Se cerco «caldaia» e la
 * pastiglia dice ancora 12 mentre a schermo ne vedo 2, quel numero ha smesso
 * di voler dire qualcosa.
 *
 * ⚠️ Filtro, ricerca e ordine stanno in un modulo puro
 * (`@kommessa/api/elenco-lavoro`), con le prove. Qui dentro c'è soltanto come
 * si disegna: il momento in cui una regola di ordinamento vive in un
 * componente è il momento in cui nessuno può più verificarla.
 */

// ─────────────────────── Cosa arriva dal server ───────────────────────

interface Base extends VoceElenco {
  id: string;
  titolo: string;
}

export type VoceLavoro =
  | (Base & {
      tipo: 'commessa';
      codice: string;
      stato: StatoCommessa;
      critica: boolean;
      cliente: string | null;
      lavoro: string | null;
      indirizzo: string | null;
    })
  | (Base & {
      tipo: 'todo';
      priorita: Priorita;
      commessaId: string;
      codiceCommessa: string | null;
    })
  | (Base & {
      tipo: 'richiesta';
      priorita: Priorita;
      cliente: string | null;
      contatto: string | null;
    });

export function ElencoLavoro({ voci }: { voci: VoceLavoro[] }) {
  const [query, setQuery] = React.useState('');
  const [filtro, setFiltro] = React.useState<FiltroElenco>('tutto');
  const [ordine, setOrdine] = React.useState<OrdineElenco>('urgenza');

  const conteggi = React.useMemo(() => contaPerFiltro(voci, query), [voci, query]);
  const visibili = React.useMemo(
    () => componiElenco(voci, { filtro, query, ordine }) as VoceLavoro[],
    [voci, filtro, query, ordine],
  );

  /**
   * Le voci messe sotto il loro lavoro.
   *
   * ⚠️ Si raggruppa **dopo** filtro e ricerca, mai prima: cercando «pompa»
   * deve restare la cosa da fare che si chiama così, anche se la sua commessa
   * non corrisponde. Quel gruppo resta senza capofila e sopra ci va
   * un'intestazione leggera col codice — che la voce porta con sé.
   */
  const gruppi = React.useMemo(
    () => raggruppaElenco(visibili, ordine),
    [visibili, ordine],
  );

  // «Adesso» si fissa una volta per ridisegno e si passa giù: calcolarlo
  // dentro ogni scheda darebbe a schede diverse istanti diversi, e una
  // scadenza al limite comparirebbe scaduta in una riga e non nell'altra.
  const adesso = Date.now();

  const etichettaOrdine =
    ORDINI_ELENCO.find((o) => o.valore === ordine)?.etichetta ?? '';
  const altroOrdine = ORDINI_ELENCO.find((o) => o.valore !== ordine)!;

  return (
    <div className="flex flex-col gap-3">
      {/* Ricerca */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          /* ⚠️ `text-base` non è estetica: sotto i 16px WebKit ingrandisce la
             pagina quando il campo prende il fuoco, e l'elenco salta via. */
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-base shadow-soft outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Cerca cliente, codice, indirizzo…"
          aria-label="Cerca fra le commesse e le cose da fare"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Cancella la ricerca"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Pastiglie + ordine */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {FILTRI_ELENCO.map((f) => (
            <Pastiglia
              key={f.valore}
              attiva={filtro === f.valore}
              etichetta={f.etichetta}
              quante={conteggi[f.valore]}
              onClick={() => setFiltro(f.valore)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOrdine(altroOrdine.valore)}
          /* Il nome del criterio ATTIVO, non di quello che si otterrebbe
             premendo: un tasto che annuncia l'altro stato si legge al
             contrario e si preme per sbaglio. */
          aria-label={`Ordine: ${etichettaOrdine}. Tocca per ${altroOrdine.etichetta.toLowerCase()}`}
          title={`Ordine: ${etichettaOrdine}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors active:bg-muted"
        >
          <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {visibili.length === 0
          ? 'Nessun risultato'
          : `${visibili.length} ${visibili.length === 1 ? 'voce' : 'voci'} · ${etichettaOrdine}`}
      </p>

      {visibili.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm font-medium text-foreground">Niente che corrisponda</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {query ? 'Prova con un’altra parola, oppure togli il filtro.' : 'Prova a togliere il filtro.'}
          </p>
        </div>
      ) : (
        <Stagger className="flex flex-col gap-5">
          {gruppi.map((g, i) => (
            <Blocco
              key={g.chiave ?? '—senza-commessa—'}
              gruppo={g as GruppoLavoro}
              indice={i + 1}
              adesso={adesso}
            />
          ))}
        </Stagger>
      )}
    </div>
  );
}

function Pastiglia({
  attiva,
  etichetta,
  quante,
  onClick,
}: {
  attiva: boolean;
  etichetta: string;
  quante: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={
        'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 transition-all active:scale-[0.96] ' +
        (attiva
          ? 'border-primary bg-primary text-primary-foreground shadow-soft'
          : 'border-border bg-card text-foreground')
      }
    >
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
        {etichetta}
      </span>
      <span
        className={
          'rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums ' +
          (attiva
            ? 'bg-primary-foreground/20 text-primary-foreground'
            : 'bg-muted text-muted-foreground')
        }
      >
        {String(quante).padStart(2, '0')}
      </span>
    </button>
  );
}

// ─────────────────────────── I blocchi ───────────────────────────

/**
 * Restringe una voce a «cosa da fare».
 *
 * ⚠️ Dentro un gruppo la capofila e' stata tolta a monte, quindi cio' che
 * resta e' per costruzione un todo o una richiesta — ma il tipo non lo sa.
 * Una funzione che **controlla** invece di un `as never` che spegne il
 * controllo: se un domani un gruppo contenesse due commesse, qui si sente.
 */
function soloDaFare(v: VoceLavoro): Extract<VoceLavoro, { tipo: 'todo' | 'richiesta' }> {
  if (v.tipo === 'commessa') {
    throw new Error(`Voce di tipo commessa dentro un gruppo: ${v.id}`);
  }
  return v;
}

/** Un gruppo, coi tipi di questa pagina. */
interface GruppoLavoro {
  chiave: string | null;
  capofila: Extract<VoceLavoro, { tipo: 'commessa' }> | null;
  dentro: VoceLavoro[];
}

/**
 * Un lavoro e le sue cose da fare, in un blocco solo.
 *
 * ## Perché un blocco e non due schede di fila
 *
 * ⚠️ Prima l'elenco era una colonna piatta: commesse e cose da fare,
 * mescolate per urgenza, con `gap-1.5` uguale fra tutte e la differenza
 * affidata al peso di un'ombra. A colpo d'occhio erano schede dello stesso
 * rango, e una cosa da fare poteva stare dieci righe sopra la commessa a cui
 * apparteneva. L'unico filo era il codice scritto in dieci pixel.
 *
 * Qui il filo si **vede**: le cose da fare sono rientrate sotto la loro
 * commessa, legate da una linea verticale, e fra un blocco e il successivo c'è
 * il doppio dello spazio che c'è dentro il blocco. La gerarchia la fa la
 * distanza, non il colore: si legge anche di sbieco, con il telefono in mano e
 * i guanti.
 *
 * ## I due casi che non sono un lavoro
 *
 * **Senza capofila** (`chiave` c'è, `capofila` no): la ricerca ha trovato la
 * cosa da fare e non la commessa. Intestazione leggera col codice, così si sa
 * di cosa si tratta.
 *
 * **Senza chiave**: richieste al telefono e cose da fare senza lavoro. Una
 * fascia che le separa, in fondo. Prima stavano in mezzo alle commesse.
 */
function Blocco({
  gruppo,
  indice,
  adesso,
}: {
  gruppo: GruppoLavoro;
  indice: number;
  adesso: number;
}) {
  // Niente lavoro: le cose sciolte, con una fascia che lo dice.
  if (gruppo.chiave === null) {
    return (
      <section data-blocco-lavoro="senza-commessa" className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          Senza commessa
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </h3>
        {/* Anche qui: chi arriva da un avviso vecchio atterra sulla home, e la
            riga giusta si accende invece di nascondersi fra le altre. */}
        {gruppo.dentro.map((v) => (
          <Evidenziabile key={`${v.tipo}:${v.id}`} id={v.id}>
            <SchedaDaFare voce={soloDaFare(v)} adesso={adesso} />
          </Evidenziabile>
        ))}
      </section>
    );
  }

  // Senza capofila il codice si prende da una delle cose da fare, che lo
  // porta con sé: è l'unico modo di dire di quale lavoro si tratta quando la
  // ricerca ha tenuto la riga e scartato la commessa.
  const codice =
    gruppo.capofila?.codice ??
    gruppo.dentro.reduce<string | null>(
      (trovato, v) => trovato ?? (v.tipo === 'todo' ? v.codiceCommessa : null),
      null,
    );

  return (
    // ⚠️ `data-blocco-lavoro` non e' decorazione: e' l'aggancio con cui il
    // banco misura rientro e spazi. Senza, raccoglieva tutte le <section>
    // della pagina e riportava «-3208px fra un blocco e l'altro».
    <section data-blocco-lavoro={gruppo.chiave} className="flex flex-col">
      {gruppo.capofila ? (
        <SchedaCommessa voce={gruppo.capofila} indice={indice} />
      ) : (
        <h3 className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {codice ?? 'Altro lavoro'}
        </h3>
      )}

      {gruppo.dentro.length > 0 ? (
        /* Il rientro e la linea: il legame fra il lavoro e le sue cose da fare
           si vede, invece di stare scritto in dieci pixel di codice.
           ⚠️ La linea parte **sotto la card** (`-mt-1`) e non un filo più giù:
           staccata di sei pixel sembrava il bordo di un'altra cosa. E il
           colore è quello del marchio al 30%, non un grigio al 70%: su fondo
           chiaro il grigio spariva, misurato guardando la schermata. */
        <ul className="-mt-1 ml-4 flex flex-col gap-1.5 border-l-2 border-primary/30 pl-3 pt-2.5">
          {gruppo.dentro.map((v) => (
            <li key={`${v.tipo}:${v.id}`}>
              <Evidenziabile id={v.id}>
                <SchedaDaFare voce={soloDaFare(v)} adesso={adesso} dentroUnBlocco />
              </Evidenziabile>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ─────────────────────────── Le schede ───────────────────────────


function SchedaCommessa({
  voce,
  indice,
}: {
  voce: Extract<VoceLavoro, { tipo: 'commessa' }>;
  indice: number;
}) {
  const cliente = (voce.cliente ?? '').trim();
  const lavoro = (voce.lavoro ?? '').trim();
  const entrambi = cliente && lavoro && cliente.toLowerCase() !== lavoro.toLowerCase();

  return (
    <Link
      href={`/mobile/commessa/${voce.id}`}
      /* Il giro guidato aggancia questo selettore sulla prima scheda: se
         sparisce, il primo passo del tour punta al vuoto. */
      data-tour={indice === 1 ? 'commessa-card' : undefined}
      className="group relative flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-gradient-to-br from-card via-card to-primary-soft/40 p-3 shadow-soft-md transition-all active:scale-[0.99] active:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatoLed stato={voce.stato} />
          <span className="font-mono text-[10px] font-semibold uppercase tabular-nums tracking-wider text-muted-foreground">
            {voce.codice}
          </span>
          {voce.critica ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-px font-mono text-[9px] font-bold uppercase leading-none tracking-wider text-destructive">
              <span aria-hidden="true">●</span> Critica
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-[15px] leading-snug tracking-tight text-foreground">
          <span className="font-semibold">
            {titoloCase(cliente) || titoloCase(lavoro) || '—'}
          </span>
          {entrambi ? (
            <>
              <span className="text-muted-foreground/60"> — </span>
              <span className="font-normal text-muted-foreground">{titoloCase(lavoro)}</span>
            </>
          ) : null}
        </p>
        {voce.indirizzo ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{titoloCase(voce.indirizzo)}</span>
          </p>
        ) : null}
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-active:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Una cosa da fare, o una richiesta arrivata al telefono in ufficio.
 *
 * Le due si comportano diversamente di proposito. La cosa da fare porta alla
 * commessa. La richiesta no — non ce l'ha ancora — e la prima cosa che serve a
 * chi la riceve è **richiamare la persona**: se c'è un numero, il tasto lo
 * chiama.
 */
/**
 * Il cerchietto che chiude una richiesta, dal telefono.
 *
 * Stessa domanda dei tre punti dell'ufficio e della scheda commessa: spuntare
 * si chiede. Qui il bersaglio e' 44px, il minimo sotto un dito con i guanti, e
 * sta a sinistra come su ogni altra cosa da fare dell'app.
 */
function SpuntaRichiesta({ id, titolo }: { id: string; titolo: string }) {
  const router = useRouter();
  const chiediConferma = useConfirm();
  const mostraAvviso = useAlert();
  const [inCorso, setInCorso] = React.useState(false);

  const spunta = async () => {
    const ok = await chiediConferma({
      title: 'Segnare come fatta?',
      description: `"${titolo}"\n\nL'ufficio la vede chiusa. Si puo' riaprire da li'.`,
      confirmLabel: 'Sì, è fatta',
    });
    if (!ok) return;
    setInCorso(true);
    const res = await cambiaTodoStato({ id, stato: 'completato' });
    setInCorso(false);
    if (!res.ok) {
      await mostraAvviso({ title: 'Non sono riuscito a chiuderla', body: res.error });
      return;
    }
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={spunta}
      disabled={inCorso}
      aria-label="Segna la richiesta come fatta"
      className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-emerald-500/10 active:text-emerald-600 disabled:opacity-50"
    >
      {inCorso ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <Circle className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}

function SchedaDaFare({
  voce,
  adesso,
  dentroUnBlocco,
}: {
  voce: Extract<VoceLavoro, { tipo: 'todo' | 'richiesta' }>;
  adesso: number;
  /**
   * Dentro il blocco della sua commessa il codice non si ripete: sta
   * nell'intestazione due righe sopra, e ripeterlo su ogni riga riempie di
   * rumore proprio lo spazio che il raggruppamento ha liberato.
   */
  dentroUnBlocco?: boolean;
}) {
  const meta = metaPriorita(voce.priorita);
  const scaduta = voce.scadenza ? new Date(voce.scadenza).getTime() < adesso : false;
  const eRichiesta = voce.tipo === 'richiesta';

  // Un contatto senza chiocciola e con abbastanza cifre è un numero: si può
  // chiamare. Altrimenti è una email e resta scritta.
  const grezzo = eRichiesta ? voce.contatto : null;
  const numero = grezzo && !grezzo.includes('@') ? grezzo.replace(/[^+\d]/g, '') : null;
  const chiamabile = numero && numero.replace(/\D/g, '').length >= 6 ? numero : null;

  const dentro = (
    <>
      <span
        className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', meta.chip].join(' ')}
        title={meta.etichetta}
      >
        <IconaPriorita priorita={voce.priorita} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{voce.titolo}</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {eRichiesta ? (
            <span className="font-semibold text-amber-700 dark:text-amber-400">Richiesta</span>
          ) : null}
          {!eRichiesta && !dentroUnBlocco && voce.codiceCommessa ? (
            <span className="tabular-nums">{voce.codiceCommessa}</span>
          ) : null}
          {eRichiesta && voce.cliente ? (
            <span className="truncate normal-case tracking-normal">{voce.cliente}</span>
          ) : null}
          {voce.scadenza ? (
            <span className={scaduta ? 'font-semibold text-destructive' : ''}>
              <Calendar className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />
              {fmtScadenza(voce.scadenza)}
            </span>
          ) : null}
        </p>
      </div>
    </>
  );

  if (eRichiesta) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-l-2 border-border border-l-amber-500/70 bg-card p-2.5 shadow-soft">
        {/* Il cerchietto per chiuderla senza aprirla: in un elenco si spunta
            di corsa, ed e' il gesto piu' frequente. */}
        <SpuntaRichiesta id={voce.id} titolo={voce.titolo} />
        {/* ⚠️ Il corpo e' un collegamento, il cerchietto e il telefono no:
            tre bersagli diversi sulla stessa riga, e un tasto dentro un
            collegamento non si annida. Prima era tutto un `<div>` e la
            richiesta era l'unica cosa dell'elenco che non si potesse aprire:
            si vedeva il titolo, si poteva chiamare, e basta — niente
            indirizzo, niente di cio' che era stato detto al telefono. */}
        <Link
          href={`/mobile/richiesta/${voce.id}`}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          {dentro}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        {chiamabile ? (
          <a
            href={`tel:${chiamabile}`}
            aria-label={`Chiama ${voce.cliente ?? 'chi ha chiamato'}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors active:bg-primary/20"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={`/mobile/commessa/${voce.commessaId}?evidenzia=${voce.id}`}
      className={[
        'flex items-center gap-2 rounded-lg border p-2.5 transition-colors active:bg-muted',
        // Dentro un blocco la riga è subordinata alla commessa sopra: niente
        // ombra e fondo più tenue, così la card del lavoro resta la testa e
        // queste si leggono come il suo contenuto. Fuori da un blocco (le
        // cose senza lavoro) resta una scheda a sé.
        dentroUnBlocco
          ? 'border-border/60 bg-card/60'
          : 'border-border bg-card shadow-soft',
      ].join(' ')}
    >
      {dentro}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function fmtScadenza(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
}
