'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@kommessa/ui';
import { CAPACITA_META } from '@kommessa/api/capacita';
import { proponiUsername, validaUsername } from '@kommessa/api/identita';

import { creaAccount, type AccountCreato } from '@/app/_actions/account';
import { salvaPotere } from '../_actions/permissions';
import { invitaUtenteDaOggetto } from '../_actions/utenti';
import { RigaCredenziale, useCopia } from './riga-credenziale';

/**
 * Far entrare una persona nuova.
 *
 * ## Due strade, e quella giusta è la prima
 *
 * **Nome utente e password** è il caso normale: un tecnico non ha un indirizzo
 * aziendale, e aspettare che apra una mail per entrare in un'app che userà in
 * cantiere non ha senso. Si crea, si detta, si lavora.
 *
 * **Invito per email** resta per chi ha una casella vera — tipicamente
 * l'ufficio — e vuole scegliersi la password da sé senza che nessuno la senta.
 *
 * Prima di oggi esisteva solo la seconda, e l'email era obbligatoria: per un
 * tenant come Bertaiola, che non ha caselle per i tecnici, voleva dire
 * inventarne una finta a mano. La strada senza email c'era già nel codice, ma
 * viveva dietro una pagina riservata ai tenant con il modulo presenze.
 */
export function CreaAccessoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [modo, setModo] = React.useState<'password' | 'invito'>('password');
  const [nome, setNome] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [usernameToccato, setUsernameToccato] = React.useState(false);
  const [ruolo, setRuolo] = React.useState<'tecnico' | 'office' | 'admin'>('tecnico');
  const [capoSquadra, setCapoSquadra] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [fatto, setFatto] = React.useState<AccountCreato | null>(null);
  const [messaggio, setMessaggio] = React.useState<string | null>(null);
  const { copiato, copia } = useCopia();
  const [inCorso, avvia] = React.useTransition();

  function azzera() {
    setNome('');
    setUsername('');
    setUsernameToccato(false);
    setRuolo('tecnico');
    setCapoSquadra(false);
    setEmail('');
    setErrore(null);
    setFatto(null);
    setMessaggio(null);
  }

  function chiudi() {
    onOpenChange(false);
    router.refresh();
    // Si azzera dopo la chiusura: così l'animazione non mostra il modulo vuoto.
    setTimeout(azzera, 200);
  }

  /** Il nome utente si propone dal nome, e resta modificabile. */
  function cambiaNome(v: string) {
    setNome(v);
    if (usernameToccato) return;
    const pezzi = v.trim().split(/\s+/);
    const proposto =
      pezzi.length > 1
        ? proponiUsername(pezzi[0]!, pezzi.slice(1).join(' '))
        : proponiUsername(pezzi[0] ?? '');
    setUsername(proposto ?? '');
  }

  function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (nome.trim().length < 2) {
      setErrore('Scrivi il nome della persona.');
      return;
    }

    if (modo === 'invito') {
      avvia(async () => {
        const r = await invitaUtenteDaOggetto({ email, role: ruolo, displayName: nome });
        if (!r.ok) {
          setErrore(r.error);
          return;
        }
        setMessaggio(`Invito mandato a ${email.trim().toLowerCase()}.`);
      });
      return;
    }

    const vu = validaUsername(username);
    if (!vu.ok) {
      setErrore(vu.motivo);
      return;
    }

    avvia(async () => {
      const r = await creaAccount({ username: vu.username, displayName: nome, role: ruolo });
      if (!r.ok) {
        setErrore(r.error);
        return;
      }
      // Il potere si concede dopo: l'account deve esistere per poterglielo dare.
      if (capoSquadra && ruolo === 'tecnico') {
        const p = await salvaPotere({
          userId: r.data.userId,
          capacita: 'capo_squadra',
          acceso: true,
        });
        if (!p.ok) {
          setMessaggio(`Account creato, ma il potere di capo squadra no: ${p.error}`);
        }
      }
      setFatto(r.data);
    });
  }

  // ── Pannello delle credenziali: si vede una volta sola ──
  if (fatto) {
    return (
      <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : chiudi())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accesso creato</DialogTitle>
            <DialogDescription>
              Dettali adesso alla persona. La password non si rivede più: al primo
              accesso l&apos;app le chiederà di scegliersene una sua.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {fatto.codiceAzienda ? (
              <RigaCredenziale
                etichetta="Azienda"
                valore={fatto.codiceAzienda}
                chiave="az"
                copiato={copiato}
                onCopia={copia}
              />
            ) : (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Il primo campo del modulo di accesso (&laquo;Codice azienda&raquo;) si
                lascia vuoto.
              </p>
            )}
            <RigaCredenziale
              etichetta="Utente"
              valore={fatto.username}
              chiave="ut"
              copiato={copiato}
              onCopia={copia}
            />
            <RigaCredenziale
              etichetta="Password"
              valore={fatto.password}
              chiave="pw"
              copiato={copiato}
              onCopia={copia}
            />
          </div>

          {messaggio ? (
            <p
              role="alert"
              className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            >
              {messaggio}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" onClick={chiudi}>
              Ho annotato, chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : chiudi())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Far entrare una persona</DialogTitle>
        </DialogHeader>

        {/* La scelta della strada, prima di tutto il resto. */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Come entra">
          <TastoModo
            attivo={modo === 'password'}
            onClick={() => {
              setModo('password');
              setErrore(null);
              setMessaggio(null);
            }}
            icona={<KeyRound aria-hidden="true" className="h-4 w-4" />}
            titolo="Utente e password"
            nota="Per i tecnici. Si detta e si entra."
          />
          <TastoModo
            attivo={modo === 'invito'}
            onClick={() => {
              setModo('invito');
              setErrore(null);
              setMessaggio(null);
            }}
            icona={<Mail aria-hidden="true" className="h-4 w-4" />}
            titolo="Invito per email"
            nota="Per chi ha una casella aziendale."
          />
        </div>

        <form onSubmit={invia} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ca_nome">Nome e cognome</Label>
            <Input
              id="ca_nome"
              value={nome}
              onChange={(e) => cambiaNome(e.target.value)}
              placeholder="Mario Rossi"
              maxLength={120}
              required
              autoFocus
            />
          </div>

          {modo === 'password' ? (
            <div className="space-y-1.5">
              <Label htmlFor="ca_username">Nome utente</Label>
              <Input
                id="ca_username"
                value={username}
                onChange={(e) => {
                  setUsernameToccato(true);
                  setUsername(e.target.value.toLowerCase());
                }}
                placeholder="m.rossi"
                maxLength={40}
                required
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                È quello che la persona batte per entrare. La password la genera
                il sistema e si vede una volta sola.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="ca_email">Email</Label>
              <Input
                id="ca_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome.cognome@azienda.it"
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Riceve un messaggio con cui scegliersi la password. Serve una
                casella che funzioni davvero.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ca_ruolo">Che lavoro fa</Label>
            <select
              id="ca_ruolo"
              value={ruolo}
              onChange={(e) => setRuolo(e.target.value as typeof ruolo)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="tecnico">Tecnico — lavora in cantiere, usa il telefono</option>
              <option value="office">Ufficio — gestisce i lavori dal computer</option>
              <option value="admin">Amministratore — tutto, comprese le impostazioni</option>
            </select>
          </div>

          {/* Il potere in più, chiesto subito: è quando si crea l'account che si
              sa se quella persona è un capo squadra. */}
          {ruolo === 'tecnico' ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-2.5">
              <input
                type="checkbox"
                checked={capoSquadra}
                onChange={(e) => setCapoSquadra(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 text-xs">
                <span className="block font-semibold">{CAPACITA_META.capo_squadra.etichetta}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {CAPACITA_META.capo_squadra.descrizione}
                </span>
              </span>
            </label>
          ) : null}

          {errore ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errore}
            </p>
          ) : null}
          {messaggio ? (
            <p
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
            >
              {messaggio}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={chiudi} disabled={inCorso}>
              Annulla
            </Button>
            <Button type="submit" disabled={inCorso}>
              {inCorso
                ? 'Un momento…'
                : modo === 'password'
                  ? 'Crea l’accesso'
                  : 'Manda l’invito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TastoModo({
  attivo,
  onClick,
  icona,
  titolo,
  nota,
}: {
  attivo: boolean;
  onClick: () => void;
  icona: React.ReactNode;
  titolo: string;
  nota: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={attivo}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-2.5 text-left transition',
        attivo
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'border-border hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          attivo ? 'text-primary' : 'text-foreground',
        )}
      >
        {icona}
        {titolo}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{nota}</span>
    </button>
  );
}
