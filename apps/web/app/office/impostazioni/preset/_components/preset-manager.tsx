'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@impiantixplus/ui';
import { Copy, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { duplicaPreset, eliminaPreset } from '../_actions/preset';
import {
  PresetFormDialog,
  type PresetEdit,
  type VoceCatalogoOpt,
} from './preset-form';

export interface PresetRow {
  id: string;
  nome: string;
  descrizione: string | null;
  voci_default: number[];
  created_at: string;
}

export function PresetManager({
  preset,
  voci,
  canEdit,
}: {
  preset: PresetRow[];
  voci: VoceCatalogoOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<PresetEdit | null>(null);
  const [open, setOpen] = useState(false);

  const onNew = () => {
    setEditing(undefined as unknown as PresetEdit | null);
    setOpen(true);
  };
  const onEdit = (p: PresetRow) => {
    setEditing({
      id: p.id,
      nome: p.nome,
      descrizione: p.descrizione,
      voci_default: p.voci_default,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {preset.length === 0
            ? 'Nessun preset salvato.'
            : `${preset.length} preset configurati.`}
        </p>
        {canEdit ? (
          <Button onClick={onNew} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nuovo preset
          </Button>
        ) : null}
      </div>

      {preset.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <span className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </span>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Crea il tuo primo preset
              </p>
              <p className="max-w-sm">
                I preset salvano una combinazione di voci ricorrente. Esempio:
                &laquo;Bagno completo&raquo; con sanitari + posa + allacci.
              </p>
            </div>
            {canEdit ? (
              <Button onClick={onNew} size="sm" variant="outline">
                <Plus className="mr-1.5 h-4 w-4" />
                Crea preset
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {preset.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{p.nome}</p>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.voci_default.length} voci
                    </Badge>
                  </div>
                  {p.descrizione ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {p.descrizione}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/70">
                      Nessuna descrizione.
                    </p>
                  )}
                </div>
                {canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Azioni su ${p.nome}`}
                        disabled={pending}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(p)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Modifica
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          start(async () => {
                            try {
                              await duplicaPreset({ id: p.id });
                              router.refresh();
                            } catch {
                              /* noop */
                            }
                          })
                        }
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplica
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          if (!confirm(`Eliminare il preset "${p.nome}"?`)) return;
                          start(async () => {
                            try {
                              await eliminaPreset({ id: p.id });
                              router.refresh();
                            } catch {
                              /* noop */
                            }
                          });
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canEdit && open ? (
        <PresetFormDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
          initial={editing ?? undefined}
          voci={voci}
        />
      ) : null}
    </div>
  );
}
