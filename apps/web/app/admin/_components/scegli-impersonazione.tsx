'use client';

import * as React from 'react';
import { Eye, Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { etichettaRuolo, RUOLI_VIVI } from '@kommessa/api/identita';
import {
  contaImpersonabili,
  motivoNonImpersonabile,
  nomeLeggibile,
  opzioniImpersonazione,
  type PersonaImpersonabile,
} from '@kommessa/api/impersonazione';

import { Scelta } from '@/app/_components/scelta';
import { elencaImpersonabili, impersonateUser } from '../_actions/tenants';

/**
 * «Entra come chi?» — un posto solo per i due punti d'ingresso.
 *
 * ⭐ **Si sceglie sempre una persona.** La vecchia strada pescava un
 * amministratore con `.limit(1)` senza ordinamento: su Bertaiola, che ne ha
 * due, chi diventavi era un caso, e in tre mesi 56 impersonazioni su 56 sono
 * finite su un amministratore — mai l'ufficio, mai un tecnico, cioè mai i due
 * mestieri per cui l'assistenza serve davvero. Le pastiglie dei mestieri
 * servono a **trovare** la persona, non a sceglierla al posto tuo.
 *
 * ⚠️ **Lo stato di apertura sta FUORI da questo componente.** Si apre anche da
 * una voce di menu, e un menu Radix si smonta al click portandosi via lo stato
 * che aveva dentro — è il difetto che per settimane ha reso inservibile il
 * tasto «condividi il lavoro». Nel menu sta il tasto, lo stato sta sopra.
 *
 * ⚠️ La tendina sta dentro un dialog modale: funziona perché `Scelta` porta il
 * suo pannello su `document.body` **marcato**, con i puntatori riaccesi e un
 * `FocusScope` attorno. Non sostituirla con un `<select>` o con un elenco in
 * linea: verrebbe tagliato dal riquadro che scorre.
 */
export function SceltaImpersonazione({
  tenantId,
  tenantNome,
  aperto,
  onChiudi,
}: {
  tenantId: string;
  tenantNome: string;
  aperto: boolean;
  onChiudi: () => void;
}) {
  const [persone, setPersone] = React.useState<PersonaImpersonabile[] | null>(null);
  const [attore, setAttore] = React.useState<string | null>(null);
  const [errore, setErrore] = React.useState<string | null>(null);
  const [scelta, setScelta] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Le persone si leggono all'apertura: l'elenco dei clienti non le ha in mano
  // e non deve pagarle a ogni render per un menu che forse nessuno apre.
  React.useEffect(() => {
    if (!aperto) return;
    let vivo = true;
    setErrore(null);
    void (async () => {
      const res = await elencaImpersonabili(tenantId);
      if (!vivo) return;
      if (!res.ok) {
        setErrore(res.error);
        return;
      }
      setPersone(res.persone);
      setAttore(res.attoreUserId);
    })();
    return () => {
      vivo = false;
    };
  }, [aperto, tenantId]);

  // Quali mestieri ci sono davvero in questo cliente, nell'ordine del
  // vocabolario. Niente pastiglie che filtrano su un insieme vuoto.
  const mestieri = React.useMemo(() => {
    const presenti = new Set((persone ?? []).map((p) => p.ruolo));
    return RUOLI_VIVI.filter((r) => presenti.has(r));
  }, [persone]);

  const opzioni = React.useMemo(() => {
    const dentro = (persone ?? []).filter((p) => filtro === null || p.ruolo === filtro);
    return opzioniImpersonazione(dentro, attore);
  }, [persone, filtro, attore]);

  const sceltoOk = React.useMemo(() => {
    const p = (persone ?? []).find((x) => x.id === scelta);
    return p ? motivoNonImpersonabile(p, attore) === null : false;
  }, [persone, scelta, attore]);

  const sceltoNome = React.useMemo(() => {
    const p = (persone ?? []).find((x) => x.id === scelta);
    return p ? nomeLeggibile(p) : null;
  }, [persone, scelta]);

  function chiudi() {
    setScelta(null);
    setFiltro(null);
    onChiudi();
  }

  return (
    <Dialog open={aperto} onOpenChange={(v) => (v ? undefined : chiudi())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entra come una persona di {tenantNome}</DialogTitle>
          <DialogDescription>
            Vedrai l&apos;app con i suoi poteri e i suoi dati. Tutto quello che fai resta
            registrato a tuo nome.
          </DialogDescription>
        </DialogHeader>

        {errore ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errore}
          </p>
        ) : persone === null ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Sto leggendo le persone…
          </p>
        ) : contaImpersonabili(persone, attore) === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Qui non c&apos;è nessuno in cui entrare: il cliente non ha account attivi.
          </p>
        ) : (
          <div className="space-y-3">
            {mestieri.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <PastigliaMestiere
                  attiva={filtro === null}
                  onClick={() => {
                    setFiltro(null);
                    setScelta(null);
                  }}
                >
                  Tutti
                </PastigliaMestiere>
                {mestieri.map((r) => (
                  <PastigliaMestiere
                    key={r}
                    attiva={filtro === r}
                    onClick={() => {
                      setFiltro(r);
                      setScelta(null);
                    }}
                  >
                    {etichettaRuolo(r, 'plurale')}
                  </PastigliaMestiere>
                ))}
              </div>
            ) : null}

            <Scelta
              opzioni={opzioni}
              valore={scelta}
              onCambia={setScelta}
              segnaposto="Scegli la persona…"
              segnapostoRicerca="Nome o nome utente…"
              nessunRisultato="Nessuno con questo nome."
              larghezzaElenco="auto"
              aria-label="Persona da impersonare"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={chiudi} disabled={pending}>
            Annulla
          </Button>
          <Button
            size="sm"
            disabled={!sceltoOk || pending}
            onClick={() =>
              start(async () => {
                const res = await impersonateUser({ tenantId, targetUserId: scelta! });
                // Se è andata, `impersonateUser` fa un rimando e qui non si
                // arriva. Se torna, è un rifiuto da mostrare dove si è scelto.
                if (res && 'ok' in res && !res.ok) setErrore(res.error);
              })
            }
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {sceltoNome ? `Entra come ${sceltoNome}` : 'Entra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Una pastiglia di filtro: stessa resa dei filtri selezionati dell'ufficio. */
function PastigliaMestiere({
  attiva,
  onClick,
  children,
}: {
  attiva: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={
        attiva
          ? 'rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground'
          : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  );
}
