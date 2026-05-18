'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@impiantixplus/ui';
import { aggiornaPreset, creaPreset } from '../_actions/preset';

export interface VoceCatalogoOpt {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
}

export interface PresetEdit {
  id?: string;
  nome?: string;
  descrizione?: string | null;
  voci_default?: number[];
}

const CATEGORIA_LABEL: Record<string, string> = {
  sempre_attiva: 'Sempre attive',
  impiantistica: 'Impiantistica',
  ventilazione: 'Ventilazione',
  documentazione: 'Documentazione',
  tubazioni: 'Tubazioni',
  montaggi: 'Montaggi',
  allacci: 'Allacci',
  supporto: 'Supporto',
  alimentazione: 'Alimentazione',
};

export function PresetFormDialog({
  open,
  onOpenChange,
  initial,
  voci,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: PresetEdit;
  voci: VoceCatalogoOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial?.id);

  // Pre-spunta default globali se nuova creazione
  const defaultIds = useMemo(
    () => new Set(voci.filter((v) => v.default).map((v) => v.id)),
    [voci],
  );
  const [selected, setSelected] = useState<Set<number>>(() => {
    if (initial?.voci_default && initial.voci_default.length > 0) {
      return new Set(initial.voci_default);
    }
    return isEdit ? new Set() : new Set(defaultIds);
  });

  const grouped = useMemo(() => {
    const map = new Map<string, VoceCatalogoOpt[]>();
    for (const v of voci) {
      if (!map.has(v.categoria)) map.set(v.categoria, []);
      map.get(v.categoria)!.push(v);
    }
    return map;
  }, [voci]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleCategoria = (cat: string) => {
    const ids = grouped.get(cat)?.map((v) => v.id) ?? [];
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifica preset' : 'Nuovo preset di lavoro'}
          </DialogTitle>
          <DialogDescription>
            Salva una combinazione ricorrente di voci (es. &laquo;Caldaia +
            sanitario&raquo;) per pre-popolare le nuove commesse in un clic.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          action={(fd) => {
            setError(null);
            const nome = String(fd.get('nome') ?? '').trim();
            const descrizione = String(fd.get('descrizione') ?? '').trim();
            if (!nome) {
              setError('Nome obbligatorio.');
              return;
            }
            const ids = Array.from(selected);
            start(async () => {
              try {
                if (isEdit && initial?.id) {
                  await aggiornaPreset({
                    id: initial.id,
                    nome,
                    descrizione: descrizione || null,
                    vociDefault: ids,
                  });
                } else {
                  await creaPreset({
                    nome,
                    descrizione: descrizione || null,
                    vociDefault: ids,
                  });
                }
                router.refresh();
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Errore generico');
              }
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome preset</Label>
            <Input
              id="nome"
              name="nome"
              required
              maxLength={120}
              defaultValue={initial?.nome ?? ''}
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="descrizione">Descrizione (opzionale)</Label>
            <Input
              id="descrizione"
              name="descrizione"
              maxLength={600}
              defaultValue={initial?.descrizione ?? ''}
              placeholder="Es. Bagno completo: posa, sanitari, allacci."
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Voci incluse</Label>
              <span className="text-xs text-muted-foreground">
                {selected.size} di {voci.length} selezionate
              </span>
            </div>
            <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded-md border border-border p-3">
              {Array.from(grouped.entries()).map(([cat, items]) => {
                const allOn = items.every((v) => selected.has(v.id));
                const someOn = !allOn && items.some((v) => selected.has(v.id));
                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => toggleCategoria(cat)}
                      className="mb-1 flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <span>{CATEGORIA_LABEL[cat] ?? cat}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 font-mono text-[10px] tracking-normal',
                          allOn
                            ? 'bg-primary/10 text-primary'
                            : someOn
                              ? 'bg-muted text-foreground'
                              : 'text-muted-foreground',
                        )}
                      >
                        {allOn
                          ? 'tutte'
                          : someOn
                            ? 'parziale'
                            : 'nessuna'}
                      </span>
                    </button>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {items.map((v) => {
                        const checked = selected.has(v.id);
                        return (
                          <label
                            key={v.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                              checked
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border hover:bg-muted/50',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(v.id)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="flex-1 truncate">{v.nome}</span>
                            {v.default ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 px-1 py-0 font-mono text-[9px]"
                              >
                                A
                              </Badge>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? 'Salvataggio…'
                : isEdit
                  ? 'Aggiorna preset'
                  : 'Crea preset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
