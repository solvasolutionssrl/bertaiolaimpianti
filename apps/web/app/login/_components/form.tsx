'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, CardContent, Input, Label } from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

/**
 * Sceglie la destinazione post-login in base alla larghezza schermo / user-agent.
 * Stesso applicativo, due viste: ufficio (desktop) vs operativa (mobile).
 */
function pickHomeForDevice(): string {
  if (typeof window === 'undefined') return '/office';
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const isNarrow = window.innerWidth < 768;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
  return isNarrow || isCoarsePointer || isMobileUa ? '/mobile' : '/office';
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitNext = searchParams.get('next');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="p-6">
        <form
          action={(fd) => {
            setErr(null);
            const email = String(fd.get('email') ?? '').trim();
            const password = String(fd.get('password') ?? '');
            if (!email || !password) {
              setErr('Inserisci email e password.');
              return;
            }
            start(async () => {
              const supabase = createBrowserSupabase();
              const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
              });
              if (error) {
                setErr(error.message);
                return;
              }
              // Recupera claim app_metadata.platform_admin per scegliere
              // la destinazione: gli admin SOLVA atterrano sempre su /admin
              // (anche da mobile, perché la UI platform è desktop-first).
              let dest = explicitNext || '';
              if (!dest) {
                const { data: ures } = await supabase.auth.getUser();
                const meta = (ures.user?.app_metadata ?? {}) as Record<string, unknown>;
                const isPlatform =
                  meta.platform_admin === true ||
                  meta.platform_admin === 'true' ||
                  (ures.user?.email ?? '').toLowerCase() === 'dev@solva.it';
                dest = isPlatform ? '/admin' : pickHomeForDevice();
              }
              router.replace(dest);
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1.5 h-11"
            />
          </div>
          {err && (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          )}
          <Button type="submit" className="w-full h-11" disabled={pending}>
            {pending ? 'Accesso…' : 'Accedi'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
