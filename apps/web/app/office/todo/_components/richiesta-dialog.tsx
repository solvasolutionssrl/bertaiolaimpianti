'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Phone, Save, Users } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kommessa/ui';

import {
  creaTodo,
  aggiornaTodo,
  affidaSquadraTodo,
} from '../../../_actions/commessa-todo';
import {
  SceltaCliente,
  CLIENTE_VUOTO,
  type ValoreCliente,
} from '@/app/_components/scelta-cliente';
import { creaCliente } from '../../_actions/clienti';
import { useAlert } from '@/app/_components/confirm-provider';
import { normalizzaPriorita, type Priorita } from '@kommessa/api/priorita';
import { PrioritaSelect } from '@/app/_components/priorita-ui';
import { Scelta, SceltaMultipla } from '@/app/_components/scelta';
import { etichettaRuolo } from '@kommessa/api/identita';

/**
 * La telefonata, in un modulo.
 *
 * L'ufficio ha la cornetta in mano: i campi stanno nell'ordine in cui le cose
 * vengono dette — cosa serve, chi è, come si richiama, i dettagli — e l'unico
 * obbligatorio è il primo.
 *
 * Lo stesso modulo serve a modificare una richiesta già registrata: è lì che si
 * assegna a qualcuno, se al telefono non si sapeva ancora a chi darla, ed è lì
 * che il caposquadra manda i suoi.
 *
 * ## ⭐ Chi ne risponde e chi ci va
 *
 * Due campi, due domande. **Chi se ne occupa** è la persona a cui l'ufficio
 * affida la richiesta — spesso un caposquadra, che qui è un account d'ufficio.
 * **Chi ci va** sono i tecnici che quella persona manda: compaiono accanto,
 * non al posto suo, così si legge tutta la catena e l'ufficio sa sempre a chi
 * chiedere come sta andando.
 *
 * ## Il cliente si può registrare adesso
 *
 * ⚠️ Prima qui c'era il selettore ridotto, che del cliente prendeva **solo il
 * nome** e non lo salvava in anagrafica: se chi chiamava era nuovo, il nome
 * restava testo libero e il numero finiva in un campo a parte. Misurato sui
 * dati veri: «Lago Maria Rosanna», solo testo, col telefono nel contatto, e la
 * stessa richiesta scritta **due volte** a quattro minuti di distanza — perché
 * una richiesta registrata non si poteva nemmeno correggere.
 *
 * Ora si usa `SceltaCliente`, lo stesso componente del sopralluogo e del
 * dettato: cerca, e se non c'è chiede il resto (persona o azienda, contatti,
 * indirizzo coi comuni suggeriti). Alla registrazione la scheda cliente si
 * **crea davvero**. Secondo motivo per preferirlo: mostra i risultati in linea
 * invece che in un riquadro sovrapposto, e un riquadro sovrapposto dentro un
 * dialog viene tagliato.
 */

// ⚠️ Qui c'erano etichette tutte mie — «Quando capita / Normale / Presto» —
// sugli stessi identici valori che la pagina Task accanto chiamava
// «Bassa / Media / Alta». Due vocabolari per la stessa colonna, nella stessa
// schermata. Ora la scala e' una sola: `@kommessa/api/priorita`.

export interface RichiestaEsistente {
  id: string;
  titolo: string;
  descrizione: string | null;
  contatto: string | null;
  priorita: Priorita;
  assegnatoA: string | null;
  scadenzaAt: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  /** Dove bisogna andare, se diverso dall'indirizzo del cliente. */
  indirizzo: string | null;
  /** Chi ci va: gli id di chi e' stato mandato. */
  squadra?: string[];
}

export function RichiestaDialog({
  assegnabili,
  esistente,
  onClose,
}: {
  assegnabili: Array<{ id: string; display_name: string | null; role: string }>;
  /** Se presente si modifica, altrimenti si registra una telefonata nuova. */
  esistente?: RichiestaEsistente;
  onClose: () => void;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [salvando, setSalvando] = React.useState(false);

  const [titolo, setTitolo] = React.useState(esistente?.titolo ?? '');
  const [cliente, setCliente] = React.useState<ValoreCliente>({
    ...CLIENTE_VUOTO,
    id: esistente?.clienteId ?? null,
    ragione_sociale: esistente?.clienteNome ?? '',
  });
  const [contatto, setContatto] = React.useState(esistente?.contatto ?? '');
  const [dove, setDove] = React.useState(esistente?.indirizzo ?? '');
  const [dettagli, setDettagli] = React.useState(esistente?.descrizione ?? '');
  const [urgenza, setUrgenza] = React.useState<Priorita>(
    normalizzaPriorita(esistente?.priorita),
  );
  const [assegnatoA, setAssegnatoA] = React.useState(esistente?.assegnatoA ?? '');
  const [squadra, setSquadra] = React.useState<string[]>(esistente?.squadra ?? []);
  const [scadenza, setScadenza] = React.useState(
    esistente?.scadenzaAt ? esistente.scadenzaAt.slice(0, 10) : '',
  );

  // L'elenco raggruppato per ruolo: con dieci nomi di fila non si capisce
  // chi è l'ufficio e chi va in cantiere.
  const gruppi = React.useMemo(() => {
    const ordine = ['owner', 'admin', 'office', 'capo', 'tecnico'];
    const per = new Map<string, typeof assegnabili>();
    for (const u of assegnabili) {
      const k = u.role;
      if (!per.has(k)) per.set(k, []);
      per.get(k)!.push(u);
    }
    // ⚠️ Un ruolo fuori da `ordine` sparirebbe dalla tendina **in silenzio**.
    // Quelli che non sono previsti vanno in fondo invece di non esistere.
    const noti = new Set(ordine);
    const altri = [...per.keys()].filter((r) => !noti.has(r)).sort();
    return [...ordine, ...altri]
      .filter((r) => per.has(r))
      .map((r) => ({ ruolo: r, utenti: per.get(r)! }));
  }, [assegnabili]);

  const opzioniPersone = React.useMemo(
    () =>
      gruppi.flatMap((g) =>
        g.utenti.map((u) => ({
          valore: u.id,
          etichetta: u.display_name ?? u.id.slice(0, 8),
          gruppo: etichettaRuolo(g.ruolo, 'plurale'),
        })),
      ),
    [gruppi],
  );

  /**
   * Il cliente, pronto da agganciare alla richiesta.
   *
   * Tre casi: era in anagrafica (si usa l'id), è nuovo e si è compilata la
   * scheda (si crea, e si usa l'id nuovo), oppure del nome non si sa altro (
   * resta testo libero, come prima).
   */
  async function risolviCliente(): Promise<
    { clienteId: string | null; clienteTesto: string | null } | 'errore'
  > {
    const nome = cliente.ragione_sociale.trim();
    if (cliente.id) return { clienteId: cliente.id, clienteTesto: null };
    if (!nome) return { clienteId: null, clienteTesto: null };

    // Si crea la scheda solo se si è detto qualcosa in più del nome:
    // altrimenti si riempirebbe l'anagrafica di righe con un nome e niente.
    const qualcosaInPiu =
      Boolean(cliente.telefono.trim()) ||
      Boolean(cliente.email.trim()) ||
      Boolean(cliente.indirizzo.trim()) ||
      Boolean(cliente.citta.trim());
    if (!qualcosaInPiu) return { clienteId: null, clienteTesto: nome };

    try {
      const { id } = await creaCliente({
        ragioneSociale: nome,
        tipo: cliente.tipo,
        indirizzo: cliente.indirizzo.trim() || null,
        citta: cliente.citta.trim() || null,
        cap: null,
        provincia: null,
        partitaIva: null,
        codiceFiscale: null,
        telefoni: [cliente.telefono.trim()].filter(Boolean),
        email: [cliente.email.trim()].filter(Boolean),
        note: null,
      });
      return { clienteId: id, clienteTesto: null };
    } catch (e) {
      await showAlert({
        title: 'Scheda cliente non creata',
        body:
          (e instanceof Error ? e.message : 'Riprova') +
          '\n\nLa richiesta non è stata registrata: correggi e riprova.',
      });
      return 'errore';
    }
  }

  const salva = async () => {
    if (titolo.trim().length === 0) {
      await showAlert({
        title: 'Manca cosa serve',
        body: 'Scrivi in una riga la richiesta: è l’unica cosa indispensabile.',
      });
      return;
    }
    setSalvando(true);

    const chi = await risolviCliente();
    if (chi === 'errore') {
      setSalvando(false);
      return;
    }

    // Se il numero non è stato scritto a parte ma il cliente ce l'ha, quello
    // vale: chi risponde al telefono lo batte una volta sola.
    const comeRichiamare = contatto.trim() || cliente.telefono.trim() || null;

    const comuni = {
      titolo: titolo.trim(),
      descrizione: dettagli.trim() || undefined,
      priorita: urgenza,
      assegnatoA: assegnatoA || null,
      // La data nuda vale «entro quel giorno»: si fissa a fine giornata.
      scadenzaAt: scadenza ? new Date(`${scadenza}T18:00:00`).toISOString() : null,
      clienteId: chi.clienteId,
      clienteTesto: chi.clienteTesto,
      contatto: comeRichiamare,
      indirizzo: dove.trim() || null,
    };

    const res = esistente
      ? await aggiornaTodo({ id: esistente.id, ...comuni })
      : await creaTodo({ ...comuni, metadata: { fonte: 'telefono' } });

    if (!res.ok) {
      setSalvando(false);
      await showAlert({ title: 'Non salvata', body: res.error });
      return;
    }

    // La squadra si scrive dopo, perché prima serve l'id della richiesta.
    // ⚠️ `creaTodo` torna l'id, `aggiornaTodo` no: i due rami sono due tipi
    // diversi, e la differenza va letta qui invece di forzarla con un cast.
    const todoId = esistente
      ? esistente.id
      : (res as { ok: true; data: { id: string } }).data.id;
    const squadraPrima = (esistente?.squadra ?? []).slice().sort().join(',');
    if (squadra.slice().sort().join(',') !== squadraPrima) {
      const r2 = await affidaSquadraTodo({ todoId, userIds: squadra });
      if (!r2.ok) {
        setSalvando(false);
        // ⚠️ La richiesta **è** salvata: dirlo, altrimenti si riprova da capo
        // e si creano doppioni. È il difetto che ha prodotto due «Lago Maria
        // Rosanna» a quattro minuti di distanza.
        await showAlert({
          title: 'Salvata, ma non ho mandato nessuno',
          body: `${r2.error}\n\nLa richiesta è registrata: riapri e riprova a mandarli.`,
        });
        router.refresh();
        onClose();
        return;
      }
    }

    setSalvando(false);
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {esistente ? 'Modifica richiesta' : 'Richiesta al telefono'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-4">
          <div>
            <Label htmlFor="r_titolo">Cosa serve *</Label>
            <Input
              id="r_titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Cambio caldaia"
              className="mt-1.5 h-10"
              autoFocus
            />
          </div>

          {/* Anche in modifica: un nome battuto male o un numero sbagliato si
              correggono qui. Prima erano in sola lettura, e l'unica strada era
              registrare la telefonata una seconda volta. */}
          <SceltaCliente
            valore={cliente}
            onCambia={setCliente}
            etichetta="Chi ha chiamato"
          />

          <div>
            <Label htmlFor="r_contatto">Come richiamare</Label>
            <Input
              id="r_contatto"
              value={contatto}
              onChange={(e) => setContatto(e.target.value)}
              placeholder={
                cliente.telefono.trim()
                  ? `Vuoto: si usa ${cliente.telefono.trim()}`
                  : 'Numero di telefono o email'
              }
              className="mt-1.5 h-10"
            />
          </div>

          <div>
            <Label htmlFor="r_dove" className="flex items-baseline gap-2">
              Dove bisogna andare
              <span className="text-xs font-normal text-muted-foreground">
                se diverso dall’indirizzo del cliente
              </span>
            </Label>
            {/* ⭐ Vuoto non vuol dire «non si sa»: vuol dire «quello del
                cliente», e chi legge ripiega lì. Copiarci dentro l'indirizzo
                dell'anagrafica farebbe una seconda verità che non si aggiorna
                più. Per questo il segnaposto dice cosa succede lasciandolo
                vuoto, invece di precompilarlo. */}
            <Input
              id="r_dove"
              value={dove}
              onChange={(e) => setDove(e.target.value)}
              placeholder={
                cliente.indirizzo.trim()
                  ? `Vuoto: si usa ${[cliente.indirizzo.trim(), cliente.citta.trim()].filter(Boolean).join(', ')}`
                  : 'via, civico, città'
              }
              className="mt-1.5 h-10"
            />
          </div>

          <div>
            <Label htmlFor="r_dettagli">Dettagli</Label>
            <textarea
              id="r_dettagli"
              value={dettagli}
              onChange={(e) => setDettagli(e.target.value)}
              rows={3}
              placeholder="Marca e modello, cosa succede, quando sono in casa…"
              className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <Label id="r_prio_label">Priorità</Label>
            <PrioritaSelect
              idEtichetta="r_prio_label"
              valore={urgenza}
              onCambia={setUrgenza}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="r_assegna">Chi se ne occupa</Label>
              {/* Qui le persone sono raggruppate per mestiere: la tendina
                  con ricerca tiene i gruppi e in più si può filtrare. */}
              <Scelta
                id="r_assegna"
                className="mt-1.5"
                opzioni={opzioniPersone}
                valore={assegnatoA || null}
                onCambia={(v) => setAssegnatoA(v ?? '')}
                etichettaNessuno="Nessuno, per ora"
                segnaposto="Nessuno, per ora"
                segnapostoRicerca="Cerca una persona…"
                aria-label="Chi se ne occupa"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ne risponde lui. Riceve una notifica sul telefono.
              </p>
            </div>
            <div className="min-w-0">
              <Label htmlFor="r_scadenza">Entro il</Label>
              <input
                id="r_scadenza"
                type="date"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>

          {/* ⭐ La seconda mano. Il caposquadra riapre la richiesta che
              l'ufficio gli ha dato e manda i suoi: «in mano a» resta lui. */}
          <div className="min-w-0 rounded-md border border-border bg-muted/20 p-3">
            <Label htmlFor="r_squadra" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Chi ci va
            </Label>
            <SceltaMultipla
              id="r_squadra"
              className="mt-1.5"
              opzioni={opzioniPersone}
              valori={squadra}
              onCambia={setSquadra}
              segnaposto="Nessuno, per ora"
              segnapostoRicerca="Cerca una persona…"
              aria-label="Chi ci va"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Uno o più tecnici. La vedono sul telefono e possono spuntarla; chi
              se ne occupa resta chi l’ha in mano.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button size="sm" variant="outline" onClick={onClose} disabled={salvando}>
            Annulla
          </Button>
          <Button size="sm" onClick={salva} disabled={salvando}>
            {salvando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {esistente ? 'Salva' : 'Registra richiesta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
