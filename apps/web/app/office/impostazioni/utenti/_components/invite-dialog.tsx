'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
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
} from '@impiantixplus/ui';
import { invitaUtente, type UserFormState } from '../_actions/utenti';

const initialState: UserFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Invio…' : 'Invia invito'}
    </Button>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [state, action] = useFormState(invitaUtente, initialState);

  useEffect(() => {
    if (state.status === 'success') {
      const t = setTimeout(() => {
        router.refresh();
        onOpenChange(false);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [state, router, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invita un nuovo utente</DialogTitle>
          <DialogDescription>
            Riceverà un&apos;email per impostare la password. Sarà collegato
            automaticamente al tenant corrente.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="nome.cognome@esempio.it"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="displayName">Nome visibile (opzionale)</Label>
            <Input
              id="displayName"
              name="displayName"
              maxLength={120}
              placeholder="Mario Rossi"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="role">Ruolo</Label>
            <select
              id="role"
              name="role"
              defaultValue="office"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="owner">Owner — super-admin tenant</option>
              <option value="admin">Admin — gestione operativa</option>
              <option value="office">Office — ufficio / segreteria</option>
              <option value="capo">Capo — capo cantiere</option>
              <option value="tecnico">Tecnico — operativo PWA</option>
              <option value="cliente">Cliente — portale read-only</option>
            </select>
          </div>

          {state.status === 'error' ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}
          {state.status === 'success' ? (
            <p
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
            >
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
