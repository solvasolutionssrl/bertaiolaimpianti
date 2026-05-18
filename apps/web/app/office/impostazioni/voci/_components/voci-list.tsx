'use client';

import { useMemo, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { ChevronDown, RotateCcw } from 'lucide-react';
import {
  resetVoceOverride,
  salvaVoceOverride,
  type VoceFormState,
} from '../_actions/voci';

export interface VoceCatalogo {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
  cartella_template: string | null;
  ordine_visualizzazione: number;
}

export interface VoceOverride {
  voce_id: number;
  nome_override: string | null;
  min_foto_richieste_override: number | null;
  attiva: boolean;
}

interface VoceMerged extends VoceCatalogo {
  override: VoceOverride | null;
  nomeEffettivo: string;
  minFotoEffettive: number | null;
  attivaEffettiva: boolean;
  hasOverride: boolean;
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

function mergeVoci(
  voci: VoceCatalogo[],
  overrides: VoceOverride[],
): VoceMerged[] {
  const ovrMap = new Map<number, VoceOverride>(
    overrides.map((o) => [o.voce_id, o]),
  );
  return voci.map((v) => {
    const ovr = ovrMap.get(v.id) ?? null;
    return {
      ...v,
      override: ovr,
      nomeEffettivo: ovr?.nome_override?.trim() || v.nome,
      minFotoEffettive: ovr?.min_foto_richieste_override ?? null,
      attivaEffettiva: ovr ? ovr.attiva : true,
      hasOverride: Boolean(ovr),
    };
  });
}

const initialState: VoceFormState = { status: 'idle' };

export function VociList({
  voci,
  overrides,
  canEdit,
}: {
  voci: VoceCatalogo[];
  overrides: VoceOverride[];
  canEdit: boolean;
}) {
  const merged = useMemo(() => mergeVoci(voci, overrides), [voci, overrides]);
  const categorie = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of merged) {
      if (!seen.has(v.categoria)) {
        seen.add(v.categoria);
        list.push(v.categoria);
      }
    }
    return list;
  }, [merged]);

  const [filtro, setFiltro] = useState<string>('all');
  const [editing, setEditing] = useState<VoceMerged | null>(null);
  const [openCat, setOpenCat] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categorie.map((c) => [c, true])),
  );

  const filtered = useMemo(
    () => (filtro === 'all' ? merged : merged.filter((v) => v.categoria === filtro)),
    [merged, filtro],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, VoceMerged[]>();
    for (const v of filtered) {
      if (!map.has(v.categoria)) map.set(v.categoria, []);
      map.get(v.categoria)!.push(v);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Filtra per categoria
        </span>
        <FiltroButton active={filtro === 'all'} onClick={() => setFiltro('all')}>
          Tutte
        </FiltroButton>
        {categorie.map((c) => (
          <FiltroButton
            key={c}
            active={filtro === c}
            onClick={() => setFiltro(c)}
          >
            {CATEGORIA_LABEL[c] ?? c}
          </FiltroButton>
        ))}
      </div>

      {grouped.size === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nessuna voce nella categoria selezionata.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([cat, items]) => {
            const open = openCat[cat] ?? true;
            return (
              <Card key={cat} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setOpenCat((s) => ({ ...s, [cat]: !(s[cat] ?? true) }))
                  }
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={open}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {CATEGORIA_LABEL[cat] ?? cat}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                </button>
                {open ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map((v) => (
                      <li
                        key={v.id}
                        className={cn(
                          'flex items-center gap-3 px-5 py-3 text-sm transition-colors',
                          !v.attivaEffettiva && 'opacity-60',
                          canEdit && 'hover:bg-muted/30',
                        )}
                      >
                        <span className="codice w-10 shrink-0 text-xs text-muted-foreground">
                          #{String(v.id).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {v.nomeEffettivo}
                            </span>
                            {v.default ? (
                              <Badge variant="secondary" className="shrink-0">
                                Default
                              </Badge>
                            ) : null}
                            {v.hasOverride ? (
                              <Badge variant="outline" className="shrink-0">
                                Override
                              </Badge>
                            ) : null}
                            {!v.attivaEffettiva ? (
                              <Badge variant="destructive" className="shrink-0">
                                Disattivata
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {v.minFotoEffettive != null
                              ? `Min foto override: ${v.minFotoEffettive}`
                              : 'Min foto: ereditato dalla commessa'}
                            {v.cartella_template
                              ? ` · Cartella: ${v.cartella_template}`
                              : ''}
                          </p>
                        </div>
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(v)}
                          >
                            Modifica
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <VoceEditDialog
          voce={editing}
          open={Boolean(editing)}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function FiltroButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvataggio…' : 'Salva'}
    </Button>
  );
}

function VoceEditDialog({
  voce,
  open,
  onOpenChange,
}: {
  voce: VoceMerged;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState(salvaVoceOverride, initialState);
  const [pending, start] = useTransition();

  // Auto-close on success
  if (state.status === 'success' && open) {
    setTimeout(() => {
      router.refresh();
      onOpenChange(false);
    }, 350);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica voce</DialogTitle>
          <DialogDescription>
            Personalizza nome, foto minime e attivazione per questo tenant. Il
            catalogo globale resta immutato.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="voceId" value={voce.id} />

          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Voce globale #{String(voce.id).padStart(2, '0')}:
            </span>{' '}
            {voce.nome}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nomeOverride">Nome personalizzato (opzionale)</Label>
            <Input
              id="nomeOverride"
              name="nomeOverride"
              defaultValue={voce.override?.nome_override ?? ''}
              placeholder={voce.nome}
              maxLength={160}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="minFotoOverride">Foto minime richieste</Label>
            <Input
              id="minFotoOverride"
              name="minFotoOverride"
              type="number"
              min={0}
              max={999}
              inputMode="numeric"
              defaultValue={
                voce.override?.min_foto_richieste_override != null
                  ? String(voce.override.min_foto_richieste_override)
                  : ''
              }
              placeholder="Lascia vuoto per ereditare"
            />
          </div>

          <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="attiva"
              defaultChecked={voce.attivaEffettiva}
              className="h-4 w-4"
            />
            <span className="flex-1">
              <span className="font-medium">Voce attiva</span>
              <span className="ml-1 text-xs text-muted-foreground">
                — se disattivata, non sarà selezionabile nelle nuove commesse.
              </span>
            </span>
          </label>

          {state.status === 'error' ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}
          {state.status === 'success' ? (
            <p
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
            >
              {state.message}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            {voce.hasOverride ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (!confirm('Rimuovere l override e tornare al default globale?'))
                    return;
                  start(async () => {
                    try {
                      await resetVoceOverride({ voceId: voce.id });
                      router.refresh();
                      onOpenChange(false);
                    } catch {
                      // noop — toast feedback opzionale
                    }
                  });
                }}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset override
              </Button>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <SaveBtn />
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
