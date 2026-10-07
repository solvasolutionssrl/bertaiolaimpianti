'use client';

import * as React from 'react';
import {
  Building2,
  Check,
  Loader2,
  Pencil,
  Search,
  User,
  UserPlus,
} from 'lucide-react';
import { Button, Input, Label, cn } from '@kommessa/ui';

import { useRicercaClienti } from './cliente-picker';
import { AddressAutocomplete } from './address-autocomplete';
import {
  indirizzoDopoScelta,
  cittaDopoScelta,
} from '@kommessa/api/indirizzo-scelto';

/**
 * «Chi è il cliente?» — **una domanda alla volta**.
 *
 * ## Cosa c'era prima, e perché non funzionava
 *
 * Nel dettato vocale il cliente si inseriva in una card con **sei campi
 * aperti tutti insieme** (ragione sociale, tipo, telefono, email, indirizzo,
 * città). Chi digitava il nome nel primo campo vedeva comparire il
 * suggerimento «questo cliente esiste già» in un riquadro ambra posizionato
 * **dopo la chiusura dell'intera card** — cioè, con la tastiera aperta su un
 * telefono, fuori schermo. Per costruzione: non era un caso sfortunato, era
 * dove il riquadro stava nel documento.
 *
 * Risultato: il suggerimento non lo vedeva nessuno, e si creavano doppioni di
 * clienti che erano già in anagrafica.
 *
 * ## Come funziona adesso
 *
 * **Un campo solo.** Si scrive il nome e i clienti compaiono lì sotto, attaccati
 * a quello che si sta scrivendo. Si sceglie e si è finito: niente altri campi
 * da compilare, perché i dati ci sono già in anagrafica.
 *
 * Se non c'è, si preme «Crea «…»» e **solo allora** l'app chiede il resto.
 *
 * ## La scheda è quella del modulo «nuova commessa»
 *
 * ⚠️ Stessi campi e stesso ordine: nome a tutta riga, poi *tipo · indirizzo ·
 * città · telefono · email* su due colonne. Chi in ufficio apre un lavoro e
 * chi risponde al telefono compilano la **stessa** scheda, altrimenti si
 * finisce con due anagrafiche diverse a seconda di da dove è entrato il
 * cliente.
 *
 * ⚠️ C'era un passo in mezzo — «è una persona o un'azienda?», due tasti grossi
 * — motivato dal fatto che cambia come si chiama il campo dopo. È stato
 * tolto: il tipo ora è il secondo campo della scheda, come nel modulo della
 * commessa, e l'etichetta del nome lo segue lo stesso. Un tocco in meno su un
 * gesto che l'ufficio ripete molte volte al giorno, e un posto solo dove
 * quella scelta vive.
 *
 * ## ⚠️ La via scritta a mano non si butta via
 *
 * I suggerimenti di indirizzo servono a non avere lo stesso paese scritto in
 * quattro modi. Ma Photon e Nominatim, quando la via non la trovano,
 * restituiscono volentieri il **comune**: chi scriveva «Via Roma 12 Valeggio»
 * e sceglieva quel suggerimento si ritrovava nel campo «Valeggio sul
 * Mincio», con la via sparita. Ora l'etichetta del suggerimento sostituisce
 * il testo **solo se ha una via dentro** (`via` nella risposta dell'API);
 * altrimenti resta quello che c'è scritto e si prende solo il comune.
 */

export interface ValoreCliente {
  /** Id in anagrafica. `null` = è nuovo, lo creerà la commessa. */
  id: string | null;
  ragione_sociale: string;
  tipo: 'persona_fisica' | 'azienda';
  telefono: string;
  email: string;
  indirizzo: string;
  citta: string;
}

export const CLIENTE_VUOTO: ValoreCliente = {
  id: null,
  ragione_sociale: '',
  tipo: 'persona_fisica',
  telefono: '',
  email: '',
  indirizzo: '',
  citta: '',
};

type Fase = 'cerca' | 'dati' | 'scelto';

function faseIniziale(v: ValoreCliente): Fase {
  if (v.id) return 'scelto';
  // Un nome che arriva dal dettato vocale non è ancora una scelta: si parte
  // comunque dalla ricerca, col nome già scritto, così il match si vede.
  return v.ragione_sociale.trim() ? 'cerca' : 'cerca';
}

export function SceltaCliente({
  valore,
  onCambia,
  /** Mostrato sopra il campo. */
  etichetta = 'Cliente',
  autoFocus,
}: {
  valore: ValoreCliente;
  onCambia: (v: ValoreCliente) => void;
  etichetta?: string;
  autoFocus?: boolean;
}) {
  const [fase, setFase] = React.useState<Fase>(() => faseIniziale(valore));
  const [termine, setTermine] = React.useState(valore.ragione_sociale);
  const idCampo = React.useId();

  // Si cerca solo mentre si è nella fase di ricerca: una volta scelto il
  // cliente, continuare a interrogare il server sarebbe lavoro inutile.
  const { risultati, cercando } = useRicercaClienti(termine, fase === 'cerca');

  const abbastanza = termine.trim().length >= 2;
  const nessunRisultato = abbastanza && !cercando && risultati.length === 0;

  function scegliEsistente(c: (typeof risultati)[number]) {
    onCambia({
      id: c.id,
      ragione_sociale: c.ragione_sociale,
      tipo: c.tipo ?? 'persona_fisica',
      telefono: c.telefoni?.[0] ?? '',
      email: c.email?.[0] ?? '',
      indirizzo: c.indirizzo ?? '',
      citta: c.citta ?? '',
    });
    setTermine(c.ragione_sociale);
    setFase('scelto');
  }

  function iniziaNuovo() {
    onCambia({ ...CLIENTE_VUOTO, ragione_sociale: termine.trim() });
    setFase('dati');
  }

  function campo<K extends keyof ValoreCliente>(k: K, v: ValoreCliente[K]) {
    onCambia({ ...valore, [k]: v });
  }

  // ── già scelto ────────────────────────────────────────────────────────────
  if (fase === 'scelto') {
    const azienda = valore.tipo === 'azienda';
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            {azienda ? (
              <Building2 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <User aria-hidden="true" className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {valore.ragione_sociale || 'Cliente senza nome'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {valore.id ? 'Già in anagrafica' : 'Nuovo cliente'}
              {valore.citta ? ` · ${valore.citta}` : ''}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFase(valore.id ? 'cerca' : 'dati')}
            className="shrink-0"
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            Cambia
          </Button>
        </div>
      </div>
    );
  }

  // ── i dati del cliente nuovo ──────────────────────────────────────────────
  //
  // ⚠️ Gli stessi campi del modulo «nuova commessa», e nello stesso ordine:
  // nome a tutta riga, poi tipo · indirizzo · comune · telefono · email su due
  // colonne. Chi in ufficio apre un lavoro e chi risponde al telefono devono
  // compilare la **stessa** scheda, o si finisce con due anagrafiche diverse a
  // seconda di da dove e' entrato il cliente.
  if (fase === 'dati') {
    const azienda = valore.tipo === 'azienda';
    return (
      <div className="space-y-3">
        <div>
          <Label htmlFor={`${idCampo}-nome`}>
            {azienda ? 'Ragione sociale' : 'Nome e cognome'}
          </Label>
          <Input
            id={`${idCampo}-nome`}
            value={valore.ragione_sociale}
            onChange={(e) => campo('ragione_sociale', e.target.value)}
            placeholder={azienda ? 'Rossi Impianti srl' : 'Elena Rossi'}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor={`${idCampo}-tipo`}>Tipo</Label>
            <select
              id={`${idCampo}-tipo`}
              value={valore.tipo}
              onChange={(e) =>
                campo('tipo', e.target.value as 'persona_fisica' | 'azienda')
              }
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="persona_fisica">Persona fisica</option>
              <option value="azienda">Azienda / Ente</option>
            </select>
          </div>

          <div className="min-w-0">
            <Label htmlFor={`${idCampo}-ind`}>Indirizzo</Label>
            {/*
              Qui c'era un campo di testo libero, ed è il motivo per cui lo
              stesso paese finiva in anagrafica scritto in quattro modi
              diversi. I suggerimenti arrivano dai provider di mappe;
              scegliendone uno, il comune si compila da solo.
            */}
            <AddressAutocomplete
              id={`${idCampo}-ind`}
              value={valore.indirizzo}
              onChange={(t) => campo('indirizzo', t)}
              onSelect={(r) => {
                /**
                 * ⚠️ **Mentre si scrive, qui non si tocca niente.**
                 *
                 * `AddressAutocomplete` chiama `onSelect` a ogni carattere
                 * battuto (serve a chi tiene le coordinate, per buttarle via
                 * quando diventano stantie) e lo fa **insieme** a `onChange`,
                 * nello stesso gesto. Le due chiamate leggono lo stesso
                 * `valore` vecchio, quindi la seconda cancella la prima: con
                 * una riga che ricopiava `valore.indirizzo` il campo si
                 * bloccava sul primo carattere. Misurato: scrivendo «Via Roma
                 * 12» restava «V».
                 *
                 * Una scelta vera si riconosce dalle coordinate.
                 */
                if (r.lat === null) return;
                // La regola — «un suggerimento non rende mai il campo meno
                // preciso di com'era» — sta in `@kommessa/api/indirizzo-scelto`
                // con le sue prove: dipende da cosa risponde un servizio
                // esterno quel giorno, e non si collauda a mano.
                onCambia({
                  ...valore,
                  indirizzo: indirizzoDopoScelta({
                    scritto: valore.indirizzo,
                    etichetta: r.label,
                    via: r.via,
                  }),
                  citta: cittaDopoScelta({
                    scritta: valore.citta,
                    dalProvider: r.citta,
                  }),
                });
              }}
              placeholder="via, viale, piazza + civico"
              className="mt-1.5"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor={`${idCampo}-citta`}>Città</Label>
            <Input
              id={`${idCampo}-citta`}
              value={valore.citta}
              onChange={(e) => campo('citta', e.target.value)}
              placeholder="si compila da sola scegliendo l'indirizzo"
              className="mt-1.5"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor={`${idCampo}-tel`}>Telefono</Label>
            <Input
              id={`${idCampo}-tel`}
              value={valore.telefono}
              onChange={(e) => campo('telefono', e.target.value)}
              inputMode="tel"
              className="mt-1.5"
            />
          </div>

          <div className="min-w-0">
            <Label htmlFor={`${idCampo}-mail`}>Email</Label>
            <Input
              id={`${idCampo}-mail`}
              value={valore.email}
              onChange={(e) => campo('email', e.target.value)}
              inputMode="email"
              type="email"
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setFase('scelto')}
            disabled={valore.ragione_sociale.trim().length === 0}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Fatto
          </Button>
          <button
            type="button"
            onClick={() => setFase('cerca')}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Torna a cercare
          </button>
        </div>
      </div>
    );
  }

  // ── la ricerca: il caso normale ───────────────────────────────────────────
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idCampo}-cerca`}>{etichetta}</Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={`${idCampo}-cerca`}
          value={termine}
          onChange={(e) => setTermine(e.target.value)}
          placeholder="Scrivi il nome del cliente"
          autoFocus={autoFocus}
          autoComplete="off"
          className="pl-8"
        />
        {cercando ? (
          <Loader2
            aria-hidden="true"
            className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>

      {/*
        I risultati stanno ATTACCATI al campo, non in fondo alla schermata:
        è l'intero punto di questa riscrittura.
      */}
      {abbastanza && risultati.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {risultati.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => scegliEsistente(c)}
                className="flex min-h-[44px] w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-accent/10"
              >
                {c.tipo === 'azienda' ? (
                  <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <User aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.ragione_sociale}
                  </span>
                  {c.citta ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.citta}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {nessunRisultato ? (
        <p className="text-xs text-muted-foreground">
          Nessun cliente con questo nome.
        </p>
      ) : null}

      {abbastanza ? (
        <Button
          type="button"
          variant={risultati.length > 0 ? 'outline' : 'default'}
          size="sm"
          onClick={iniziaNuovo}
          className={cn('w-full', risultati.length > 0 && 'mt-1')}
        >
          <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
          {risultati.length > 0
            ? 'Nessuno di questi: è un cliente nuovo'
            : `Crea «${termine.trim()}»`}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Bastano due lettere. Se non c&apos;è, lo si crea da qui.
        </p>
      )}
    </div>
  );
}
