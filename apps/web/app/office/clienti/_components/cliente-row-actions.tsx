'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Edit3,
  Loader2,
  MoreVertical,
  PencilLine,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@kommessa/ui';

import { eliminaCliente, rinominaCliente } from '../../_actions/clienti';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  clienteId: string;
  ragioneSocialeAttuale: string;
}

/**
 * Dropdown azioni per ogni riga della lista clienti:
 *  - Modifica completa (link a /clienti/[id])
 *  - Rinomina (modal piccolo con un solo campo)
 *  - Elimina (askConfirm destructive, blocco se ci sono commesse linkate)
 */
export function ClienteRowActions({ clienteId, ragioneSocialeAttuale }: Props) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(ragioneSocialeAttuale);
  const [renameErr, setRenameErr] = React.useState<string | null>(null);

  const onElimina = async () => {
    const ok = await askConfirm({
      title: `Eliminare ${ragioneSocialeAttuale}?`,
      description:
        'Operazione irreversibile. Non sarà possibile se il cliente ha commesse associate.',
      destructive: true,
      confirmLabel: 'Elimina',
    });
    if (!ok) return;
    start(async () => {
      const res = await eliminaCliente({ id: clienteId });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  const onRinomina = () => {
    setRenameErr(null);
    if (draft.trim().length === 0) {
      setRenameErr('La ragione sociale non può essere vuota');
      return;
    }
    if (draft.trim() === ragioneSocialeAttuale) {
      setRenameOpen(false);
      return;
    }
    start(async () => {
      const res = await rinominaCliente({
        id: clienteId,
        ragioneSociale: draft.trim(),
      });
      if (!res.ok) {
        setRenameErr(res.error);
        return;
      }
      setRenameOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Azioni"
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onSelect={() => router.push(`/office/clienti/${clienteId}`)}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Modifica completa
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setDraft(ragioneSocialeAttuale);
              setRenameErr(null);
              setRenameOpen(true);
            }}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Rinomina
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onElimina} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={(o) => !o && setRenameOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rinomina cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cl_rinomina">Ragione sociale *</Label>
              <Input
                id="cl_rinomina"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onRinomina();
                  }
                }}
                className="mt-1.5 h-10"
                autoFocus
                maxLength={200}
              />
            </div>
            {renameErr ? (
              <p className="text-sm text-destructive">{renameErr}</p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Per modificare anche P.IVA, indirizzo, contatti, usa{' '}
              <strong>Modifica completa</strong>.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={pending}>
              Annulla
            </Button>
            <Button onClick={onRinomina} disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PencilLine className="h-3.5 w-3.5" />
              )}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
