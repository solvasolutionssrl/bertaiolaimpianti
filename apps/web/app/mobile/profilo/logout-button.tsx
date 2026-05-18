'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2 } from 'lucide-react';

import { createBrowserSupabase } from '@impiantixplus/api/client';
import { Button } from '@impiantixplus/ui';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onLogout = () => {
    startTransition(async () => {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      router.push('/mobile/login');
      router.refresh();
    });
  };

  return (
    <Button
      variant="destructive"
      size="lg"
      className="min-h-[48px] w-full"
      onClick={onLogout}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="h-4 w-4" aria-hidden="true" />
      )}
      Esci
    </Button>
  );
}
