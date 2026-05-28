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
} from '@kommessa/ui';
import { ChevronDown, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import {
  creaVoceCustom,
  eliminaVoceCustom,
  resetVoceOverride,
  salvaVoceOverride,
  type VoceFormState,
  type VoceSimile,
} from '../_actions/voci';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

export interface VoceCatalogo {
  id: number;
  nome: string;
  categoria: string;
  default: boolean;
  cartella_template: string | null;
  ordine_visualizzazione: number;
  /** NULL = voce globale (seed 1..39); UUID = custom del tenant. */
  tenant_id: string | null;
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
  isCustom: boolean;
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
      isCustom: v.tenant_id !== null,
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
  const [creating, setCreating] = useState(false);
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
    <div className="flex gap-6">
      {/* Sidebar categorie */}
      <aside className="w-40 shrink-0">
        <nav className="sticky top-6 space-y-0.5">
          <p className="mb-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Categoria
          </p>
          <SidebarItem
            active={filtro === 'all'}
            onClick={() => setFiltro('all')}
            count={merged.length}
          >
            Tutte
          </SidebarItem>
          {categorie.map((c) => (
            <SidebarItem
              key={c}
              active={filtro === c}
              onClick={() => setFiltro(c)}
              count={merged.filter((v) => v.categoria === c).length}
            >
              {CATEGORIA_LABEL[c] ?? c}
            </SidebarItem>
          ))}
        </nav>
      </aside>

      {/* Contenuto principale */}
      <div className="min-w-0 flex-1">
      {canEdit ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {merged.filter((v) => v.isCustom).length > 0
              ? `${merged.filter((v) => v.isCustom).length} voci custom create per il tuo tenant.`
              : 'Aggiungi voci specifiche del tuo workflow quando il catalogo standard non basta.'}
          </p>
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="shrink-0"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nuova voce
          </Button>
        </div>
      ) : null}

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
                            {v.isCustom ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-primary/30 bg-primary/5 text-primary"
                              >
                                <Sparkles className="mr-1 h-3 w-3" />
                                Custom
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
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing(v)}
                            >
                              Modifica
                            </Button>
                            {v.isCustom ? (
                              <DeleteCustomButton
                                voceId={v.id}
                                nome={v.nomeEffettivo}
                              />
                            ) : null}
                          </div>
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

      {creating ? (
        <NuovaVoceDialog
          open={creating}
          onOpenChange={(o) => setCreating(o)}
        />
      ) : null}
      </div>
    </div>
  );
}

function DeleteCustomButton({ voceId, nome }: { voceId: number; nome: string }) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        const ok = await askConfirm({
          title: `Eliminare la voce "${nome}"?`,
          description:
            'La voce sarà rimossa dal catalogo del tuo tenant. Le commesse che la usano la mostreranno come riferimento mancante.',
          destructive: true,
          confirmLabel: 'Sì, elimina',
        });
        if (!ok) return;
        start(async () => {
          try {
            await eliminaVoceCustom({ voceId });
            router.refresh();
          } catch (e) {
            await showAlert({
              title: 'Impossibile eliminare la voce',
              body: e instanceof Error ? e.message : 'Errore sconosciuto',
            });
          }
        });
      }}
      className="text-muted-foreground hover:text-destructive"
      aria-label={`Elimina ${nome}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function SidebarItem({
  active,
  children,
  onClick,
  count,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        active
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className="truncate">{children}</span>
      <span className="ml-2 shrink-0 font-mono text-[10px] opacity-60">{count}</span>
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
  const askConfirm = useConfirm();
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
                onClick={async () => {
                  if (!(await askConfirm({ title: 'Rimuovere l’override e tornare al default globale?', destructive: true })))
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

// =====================================================================
// Dialog "Nuova voce" custom-tenant con check fuzzy duplicati
// =====================================================================

const CATEGORIE_OPZIONI: Array<{ value: string; label: string }> = [
  { value: 'impiantistica', label: 'Impiantistica' },
  { value: 'documentazione', label: 'Documentazione' },
  { value: 'tubazioni', label: 'Tubazioni' },
  { value: 'montaggi', label: 'Montaggi' },
  { value: 'allacci', label: 'Allacci' },
  { value: 'ventilazione', label: 'Ventilazione' },
  { value: 'supporto', label: 'Supporto' },
  { value: 'alimentazione', label: 'Alimentazione' },
];

function NuovaVoceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string>('impiantistica');
  const [cartellaTemplate, setCartellaTemplate] = useState('');
  const [pending, start] = useTransition();
  const [similar, setSimilar] = useState<VoceSimile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setNome('');
    setCategoria('impiantistica');
    setCartellaTemplate('');
    setSimilar(null);
    setError(null);
  };

  const submit = (force: boolean) => {
    if (nome.trim().length < 2) {
      setError('Inserisci un nome di almeno 2 caratteri.');
      return;
    }
    setError(null);
    start(async () => {
      const res = await creaVoceCustom({
        nome: nome.trim(),
        categoria: categoria as
          | 'impiantistica'
          | 'documentazione'
          | 'tubazioni'
          | 'montaggi'
          | 'allacci'
          | 'ventilazione'
          | 'supporto'
          | 'alimentazione',
        cartellaTemplate: cartellaTemplate.trim() || null,
        forceSimilar: force,
      });
      if (res.ok) {
        router.refresh();
        reset();
        onOpenChange(false);
        return;
      }
      if (res.reason === 'similar') {
        setSimilar(res.similar);
        return;
      }
      if (res.reason === 'duplicate') {
        setError(res.message);
        return;
      }
      await showAlert({
        title: 'Errore creazione voce',
        body: 'message' in res ? res.message : 'Errore sconosciuto',
      });
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) {
          reset();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova voce del catalogo</DialogTitle>
          <DialogDescription>
            Aggiungi una voce specifica del tuo workflow. Sarà visibile solo
            al tuo tenant e selezionabile nelle nuove commesse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nuovaVoceNome">Nome voce</Label>
            <Input
              id="nuovaVoceNome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (similar) setSimilar(null);
                if (error) setError(null);
              }}
              placeholder="Es. Allaccio fibra ottica"
              maxLength={160}
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nuovaVoceCategoria">Categoria</Label>
            <select
              id="nuovaVoceCategoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CATEGORIE_OPZIONI.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nuovaVoceCartella">
              Cartella associata (opzionale)
            </Label>
            <Input
              id="nuovaVoceCartella"
              value={cartellaTemplate}
              onChange={(e) => setCartellaTemplate(e.target.value)}
              placeholder="Es. Preventivi/NuoviImpianti — lascia vuoto se non genera cartella"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Se valorizzato, la voce — quando attiva su una commessa — predispone
              la creazione di una cartella con questo template. Lascia vuoto per
              non generare alcuna cartella automatica.
            </p>
          </div>

          {similar && similar.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">
                Attenzione: ho trovato voci già esistenti con nome simile.
              </p>
              <ul className="mb-3 space-y-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                {similar.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="font-mono opacity-60">
                      #{String(s.id).padStart(2, '0')}
                    </span>
                    <span className="flex-1 font-medium">{s.nome}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {s.scope === 'globale' ? 'globale' : 'custom'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                Se è davvero una voce diversa, conferma. Altrimenti modifica
                quella esistente o cambia nome.
              </p>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={pending}
          >
            Annulla
          </Button>
          {similar && similar.length > 0 ? (
            <Button
              type="button"
              variant="default"
              disabled={pending}
              onClick={() => submit(true)}
            >
              {pending ? 'Creazione…' : 'Crea comunque'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending || nome.trim().length < 2}
              onClick={() => submit(false)}
            >
              {pending ? 'Verifica…' : 'Crea voce'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
