'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@impiantixplus/ui';
import { aggiungiVoce } from '../../../../_actions/commesse';

interface VoceCatalogo {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
  ordine_visualizzazione: number;
}

export function AggiungiFaseButton({
  commessaId,
  disponibili,
}: {
  commessaId: string;
  disponibili: VoceCatalogo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const handle = (voceId: number) => {
    start(async () => {
      await aggiungiVoce({ commessaId, voceId });
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={pending || disponibili.length === 0}>
          <Plus className="h-4 w-4" />
          Aggiungi fase
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>Voci disponibili</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {disponibili.map((v) => (
          <DropdownMenuItem
            key={v.id}
            onSelect={(e) => {
              e.preventDefault();
              handle(v.id);
            }}
          >
            <span className="flex-1 truncate">{v.nome}</span>
            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              {v.categoria}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
