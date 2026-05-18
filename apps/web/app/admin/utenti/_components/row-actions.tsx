'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, KeyRound, Ban, RotateCcw } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@impiantixplus/ui';
import {
  attivaUserGlobal,
  disattivaUserGlobal,
  resetPasswordUser,
} from '../../_actions/utenti';

export function UtentiRowActions({
  userId,
  attivo,
}: {
  userId: string;
  attivo: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Azioni" disabled={pending}>
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onSelect={() =>
            start(async () => {
              const res = await resetPasswordUser(userId);
              if (!res.ok) alert(res.error);
              else alert('Reset password inviato.');
            })
          }
        >
          <KeyRound className="h-3.5 w-3.5" />
          Invia reset password
        </DropdownMenuItem>
        {attivo ? (
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const res = await disattivaUserGlobal(userId);
                if (!res.ok) alert(res.error);
                router.refresh();
              })
            }
          >
            <Ban className="h-3.5 w-3.5" />
            Disattiva
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const res = await attivaUserGlobal(userId);
                if (!res.ok) alert(res.error);
                router.refresh();
              })
            }
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Riattiva
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
