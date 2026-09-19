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
} from '@kommessa/ui';
import { aggiungiVoce } from '../../../../_actions/commesse';
import { useConfermaCommessaChiusa } from '../../../../../_components/conferma-commessa-chiusa';

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
  statoCommessa,
  nomeCommessa,
}: {
  commessaId: string;
  disponibili: VoceCatalogo[];
  /** Se la commessa e' chiusa, aggiungere una fase chiede conferma. */
  statoCommessa?: string | null;
  nomeCommessa?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const chiediConferma = useConfermaCommessaChiusa(statoCommessa, nomeCommessa);

  const handle = async (voceId: number) => {
    if (!(await chiediConferma())) return;
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
              void handle(v.id);
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
