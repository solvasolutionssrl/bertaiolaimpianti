'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Input,
  Label,
} from '@impiantixplus/ui';
import { aggiornaProfilo, type FormState } from '../_actions/profilo';

const initialState: FormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvataggio…' : 'Salva modifiche'}
    </Button>
  );
}

export function ProfiloForm({
  email,
  displayName,
  avatarUrl,
  role,
}: {
  email: string;
  displayName: string;
  avatarUrl: string;
  role: string;
}) {
  const [state, formAction] = useFormState(aggiornaProfilo, initialState);

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || (email[0]?.toUpperCase() ?? '?');

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback className="text-base">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{displayName || email}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {role}
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          readOnly
          disabled
          aria-readonly="true"
        />
        <p className="text-xs text-muted-foreground">
          Per cambiare email, contatta un amministratore del tenant.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="displayName">Nome visibile</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          required
          minLength={1}
          maxLength={120}
          autoComplete="name"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="avatarUrl">URL avatar (opzionale)</Label>
        <Input
          id="avatarUrl"
          name="avatarUrl"
          defaultValue={avatarUrl}
          inputMode="url"
          placeholder="https://…/avatar.png"
        />
        <p className="text-xs text-muted-foreground">
          Lascia vuoto per usare le iniziali.
        </p>
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

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
