'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

import { Button } from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

/**
 * Pulsante logout (client component) — invoca `supabase.auth.signOut()`
 * sul browser per ripulire i cookie locali, poi naviga a `/login`.
 */
export function LogoutButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onClick() {
    start(async () => {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label="Esci dal portale"
      title="Esci"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Esci</span>
    </Button>
  );
}
