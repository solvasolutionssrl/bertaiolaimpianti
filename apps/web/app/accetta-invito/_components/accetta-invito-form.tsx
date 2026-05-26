'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@kommessa/ui';
import { createBrowserSupabase } from '@kommessa/api/client';
import { completaInvito } from '../_actions/completa-invito';

export function AccettaInvitoForm({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.');
      return;
    }
    if (password !== confirm) {
      setError('Le due password non coincidono.');
      return;
    }

    start(async () => {
      const supabase = createBrowserSupabase();
      const { error: updateErr } = await supabase.auth.updateUser({ password });

      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      // Tracking: segna l'invito come completato (best-effort)
      await completaInvito();

      // Redirige in base al ruolo
      const dest = role === 'tecnico' ? '/mobile' : '/office';
      router.replace(dest);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          readOnly
          disabled
          aria-readonly="true"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Nuova password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimo 8 caratteri"
          minLength={8}
          required
          autoComplete="new-password"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Conferma password</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ripeti la password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Attivazione…' : 'Attiva account'}
      </Button>
    </form>
  );
}
