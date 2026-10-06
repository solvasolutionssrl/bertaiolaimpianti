'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import { PASSWORD_MIN, validaPassword } from '@kommessa/api/identita';

import { confermaCambioPassword } from '../_actions';

/**
 * Scegliere la propria password.
 *
 * Due usi, stesso modulo: obbligato al primo ingresso, oppure spontaneo dal
 * profilo. Cambia solo il testo e la presenza del tasto per tornare indietro —
 * perché quando è obbligato, un tasto «annulla» sarebbe una bugia.
 *
 * ⚠️ L'ordine delle due chiamate non è indifferente: prima si cambia davvero
 * la password, poi si spegne il cancello. Al contrario, un errore nel cambio
 * lascerebbe un account senza cancello e con la password vecchia.
 */
export function CambiaPasswordForm({
  nomeAccesso,
  obbligato,
  casa,
}: {
  nomeAccesso: string;
  obbligato: boolean;
  casa: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [conferma, setConferma] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [inCorso, avvia] = React.useTransition();

  const invia = (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);

    // La stessa regola che applica il server, applicata subito: così chi sbaglia
    // lo sa prima di aspettare la rete.
    const v = validaPassword(password, { username: nomeAccesso });
    if (!v.ok) {
      setErrore(v.motivo);
      return;
    }
    if (password !== conferma) {
      setErrore('Le due password non sono uguali.');
      return;
    }

    avvia(async () => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrore(error.message);
        return;
      }
      const esito = await confermaCambioPassword();
      if (!esito.ok) {
        setErrore(
          `Password cambiata, ma non è stato possibile registrarlo: ${esito.error}. Riprova fra poco.`,
        );
        return;
      }
      router.replace(casa);
    });
  };

  return (
    <form onSubmit={invia} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="cp_accesso">Entri come</Label>
        <Input id="cp_accesso" value={nomeAccesso} readOnly disabled aria-readonly="true" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp_password">Password nuova</Label>
        <Input
          id="cp_password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Almeno ${PASSWORD_MIN} caratteri`}
          minLength={PASSWORD_MIN}
          required
          autoComplete="new-password"
          autoFocus
          className="text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp_conferma">Ripetila</Label>
        <Input
          id="cp_conferma"
          type="password"
          value={conferma}
          onChange={(e) => setConferma(e.target.value)}
          placeholder="La stessa di sopra"
          minLength={PASSWORD_MIN}
          required
          autoComplete="new-password"
          className="text-base"
        />
      </div>

      {errore ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {errore}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {inCorso ? 'Un momento…' : 'Salva la password'}
      </Button>

      {obbligato ? null : (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={inCorso}
          onClick={() => router.back()}
        >
          Lascia stare
        </Button>
      )}
    </form>
  );
}
