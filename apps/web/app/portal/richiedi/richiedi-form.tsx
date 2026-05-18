'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2, Send } from 'lucide-react';

import { Button, Input, Label } from '@impiantixplus/ui';

import { creaTicketDaPortale, type CreaTicketResult } from '../_actions/ticket';

const initialState: CreaTicketResult | null = null;

export interface RichiediFormProps {
  commesse: {
    id: string;
    codice_interno: string;
    nome_cartella: string;
    stato: string;
  }[];
}

export function RichiediForm({ commesse }: RichiediFormProps) {
  const [state, formAction] = useFormState(creaTicketDaPortale, initialState);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-green-600/30 bg-green-50 p-6 text-center dark:bg-green-950/30">
        <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden />
        <div>
          <p className="text-base font-semibold">Richiesta inviata</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/">Torna alla home</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="oggetto">Oggetto della richiesta</Label>
        <Input
          id="oggetto"
          name="oggetto"
          type="text"
          required
          maxLength={200}
          placeholder="Es. La caldaia non si accende"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="descrizione">Descrizione</Label>
        <textarea
          id="descrizione"
          name="descrizione"
          required
          rows={6}
          minLength={10}
          maxLength={5000}
          className="flex min-h-[140px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Spiega cosa è successo, quando, e se c'è un'urgenza particolare."
        />
        <p className="text-xs text-muted-foreground">
          Almeno 10 caratteri. Più contesto fornisci, più rapida sarà la
          risposta.
        </p>
      </div>

      {commesse.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="commessaId">Riferimento commessa (facoltativo)</Label>
          <select
            id="commessaId"
            name="commessaId"
            defaultValue=""
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">— Nessuna commessa di riferimento —</option>
            {commesse.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codice_interno} · {umanizzaNomeCartella(c.nome_cartella)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Se la richiesta riguarda un lavoro già in corso, selezionalo qui.
          </p>
        </div>
      ) : null}

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg">
      <Send className="h-4 w-4" />
      {pending ? 'Invio in corso…' : 'Invia richiesta'}
    </Button>
  );
}

function umanizzaNomeCartella(s: string): string {
  const last = s.split('_').slice(2).join('_') || s;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
}
