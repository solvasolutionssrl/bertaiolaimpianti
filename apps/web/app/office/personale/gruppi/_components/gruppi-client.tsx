'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  UsersRound,
  ShieldCheck,
  Plus,
  Trash2,
  Users,
  Search,
  Loader2,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kommessa/ui';
import { useConfirm, useAlert } from '@/app/_components/confirm-provider';
import {
  creaGruppo,
  aggiornaGruppo,
  eliminaGruppo,
  impostaMembriGruppo,
  toggleApprovatore,
  PALETTE_GRUPPI,
} from '@/app/office/_actions/ferie-permessi';

export interface GruppoRow {
  id: string;
  nome: string;
  approverUserId: string | null;
  colore: string | null;
  note: string | null;
  membri: string[];
}
export interface DipRow {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
}
export interface UtenteRow {
  id: string;
  nome: string;
  role: string;
  puoApprovare: boolean;
}

function nomeDip(d: DipRow): string {
  return `${d.cognome} ${d.nome}`.trim();
}
const GREY = '#64748b';

export function GruppiClient({
  gruppi,
  dipendenti,
  utenti,
}: {
  gruppi: GruppoRow[];
  dipendenti: DipRow[];
  utenti: UtenteRow[];
}) {
  const router = useRouter();
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [nuovoNome, setNuovoNome] = React.useState('');
  const [nuovoColore, setNuovoColore] = React.useState(PALETTE_GRUPPI[0]!);
  const [cercaAppr, setCercaAppr] = React.useState('');
  const [membriDialog, setMembriDialog] = React.useState<GruppoRow | null>(null);

  const refresh = () => router.refresh();

  const dipMap = React.useMemo(() => new Map(dipendenti.map((d) => [d.id, d])), [dipendenti]);
  const dipGruppo = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gruppi) for (const d of g.membri) m.set(d, g.nome);
    return m;
  }, [gruppi]);
  const approvatori = React.useMemo(
    () => utenti.filter((u) => u.puoApprovare || u.role === 'admin'),
    [utenti],
  );
  const senzaGruppo = dipendenti.filter((d) => !dipGruppo.has(d.id));

  const utentiFiltrati = React.useMemo(() => {
    const q = cercaAppr.trim().toLowerCase();
    if (!q) return utenti;
    return utenti.filter((u) => `${u.nome} ${u.role}`.toLowerCase().includes(q));
  }, [utenti, cercaAppr]);

  const onNuovo = () => {
    if (!nuovoNome.trim()) return;
    start(async () => {
      const res = await creaGruppo({ nome: nuovoNome.trim(), colore: nuovoColore });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      await alert({
        title: 'Gruppo creato',
        body: 'Il gruppo è pronto ma non contiene ancora dipendenti. Assegna i membri dalla card qui sotto.',
      });
      setNuovoNome('');
      refresh();
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <UsersRound className="h-5 w-5 text-primary" />
          Gruppi lavoro
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ogni dipendente appartiene a un gruppo (reparto), e ogni gruppo ha un approvatore per le
          richieste di ferie e permessi. I gruppi filtrano anche i tecnici nella pianificazione.
        </p>
      </header>

      {/* Due colonne: chi può approvare · nuovo gruppo */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chi può approvare (ricercabile, compatto) */}
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Chi può approvare
              </h2>
              <span className="text-[11px] text-muted-foreground">{approvatori.length} abilitati</span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={cercaAppr}
                onChange={(e) => setCercaAppr(e.target.value)}
                placeholder="Cerca utente…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border">
              {utentiFiltrati.map((u) => {
                const isAdmin = u.role === 'admin';
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{u.nome}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {u.role}
                      </span>
                    </span>
                    {isAdmin ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Sempre
                      </Badge>
                    ) : (
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={u.puoApprovare}
                        disabled={pending}
                        onChange={(e) => {
                          const value = e.target.checked;
                          start(async () => {
                            const res = await toggleApprovatore({ userId: u.id, value });
                            if (!res.ok) await alert({ title: 'Errore', body: res.error });
                            refresh();
                          });
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Nuovo gruppo */}
        <Card>
          <CardContent className="space-y-3 py-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Plus className="h-4 w-4" /> Nuovo gruppo
            </h2>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome</span>
              <input
                value={nuovoNome}
                onChange={(e) => setNuovoNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onNuovo()}
                placeholder="es. Elettricisti"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Colore</span>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE_GRUPPI.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNuovoColore(c)}
                    aria-label={c}
                    className={
                      'h-7 w-7 rounded-full ring-offset-2 transition ' +
                      (nuovoColore === c ? 'ring-2 ring-foreground/40' : '')
                    }
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Puoi creare anche un gruppo vuoto e assegnare i membri dopo.
            </p>
            <Button type="button" onClick={onNuovo} disabled={pending || !nuovoNome.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crea gruppo
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Gruppi esistenti (colorati) */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Gruppi ({gruppi.length})
        </h2>
        {gruppi.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nessun gruppo. Creane uno qui sopra.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {gruppi.map((g) => (
              <GruppoCard
                key={g.id}
                gruppo={g}
                approvatori={approvatori}
                dipMap={dipMap}
                onGestisciMembri={() => setMembriDialog(g)}
                onSaved={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dipendenti senza gruppo */}
      {senzaGruppo.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="py-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" /> {senzaGruppo.length} dipendenti senza gruppo
            </p>
            <p className="text-xs text-amber-700">
              Le loro richieste non hanno un approvatore finché non li assegni a un gruppo.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {membriDialog ? (
        <MembriDialog
          gruppo={membriDialog}
          dipendenti={dipendenti}
          dipGruppo={dipGruppo}
          onClose={() => setMembriDialog(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function GruppoCard({
  gruppo,
  approvatori,
  dipMap,
  onGestisciMembri,
  onSaved,
}: {
  gruppo: GruppoRow;
  approvatori: UtenteRow[];
  dipMap: Map<string, DipRow>;
  onGestisciMembri: () => void;
  onSaved: () => void;
}) {
  const alert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();
  const [editNome, setEditNome] = React.useState(false);
  const [nome, setNome] = React.useState(gruppo.nome);
  const [palOpen, setPalOpen] = React.useState(false);
  const colore = gruppo.colore ?? GREY;

  const patch = (p: Record<string, unknown>) =>
    start(async () => {
      const res = await aggiornaGruppo({ id: gruppo.id, ...p });
      if (!res.ok) await alert({ title: 'Errore', body: res.error });
      onSaved();
    });

  const salvaNome = () => {
    if (nome.trim() === gruppo.nome || !nome.trim()) {
      setEditNome(false);
      setNome(gruppo.nome);
      return;
    }
    patch({ nome: nome.trim() });
    setEditNome(false);
  };

  const onElimina = async () => {
    if (
      !(await confirm({
        title: `Eliminare il gruppo "${gruppo.nome}"?`,
        description: 'I membri torneranno senza gruppo. Le richieste già inviate restano.',
        destructive: true,
        confirmLabel: 'Elimina',
      }))
    )
      return;
    start(async () => {
      const res = await eliminaGruppo(gruppo.id);
      if (!res.ok) await alert({ title: 'Errore', body: res.error });
      onSaved();
    });
  };

  const membriNomi = gruppo.membri
    .map((id) => dipMap.get(id))
    .filter(Boolean)
    .map((d) => `${(d as DipRow).cognome} ${(d as DipRow).nome}`);

  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ backgroundColor: colore }} />
      <CardContent className="space-y-2.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPalOpen((v) => !v)}
              className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: colore }}
              aria-label="Cambia colore"
            />
            {editNome ? (
              <input
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={salvaNome}
                onKeyDown={(e) => e.key === 'Enter' && salvaNome()}
                className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm font-semibold focus:border-primary focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditNome(true)}
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-base font-semibold tracking-tight">{gruppo.nome}</span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onElimina}
            disabled={pending}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Elimina gruppo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {palOpen ? (
          <div className="flex flex-wrap gap-1.5">
            {PALETTE_GRUPPI.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  patch({ colore: c });
                  setPalOpen(false);
                }}
                className="h-6 w-6 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Approvatore
            </span>
            <select
              value={gruppo.approverUserId ?? ''}
              onChange={(e) => patch({ approverUserId: e.target.value || null })}
              disabled={pending}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">Nessuno (gestisce l&apos;ufficio)</option>
              {approvatori.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="outline" onClick={onGestisciMembri}>
            <Users className="h-4 w-4" /> {gruppo.membri.length} membri
          </Button>
        </div>

        {membriNomi.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {membriNomi.slice(0, 6).map((n, i) => (
              <span key={i} className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px]">
                {n}
              </span>
            ))}
            {membriNomi.length > 6 ? (
              <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
                +{membriNomi.length - 6}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-amber-600">
            <AlertTriangle className="h-3 w-3" /> Nessun dipendente: assegna i membri.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MembriDialog({
  gruppo,
  dipendenti,
  dipGruppo,
  onClose,
  onSaved,
}: {
  gruppo: GruppoRow;
  dipendenti: DipRow[];
  dipGruppo: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const alert = useAlert();
  const [pending, start] = React.useTransition();
  const [sel, setSel] = React.useState<Set<string>>(new Set(gruppo.membri));
  const [cerca, setCerca] = React.useState('');

  const filtrati = React.useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return dipendenti;
    return dipendenti.filter((d) => `${nomeDip(d)} ${d.mansione ?? ''}`.toLowerCase().includes(q));
  }, [dipendenti, cerca]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const salva = () => {
    start(async () => {
      const res = await impostaMembriGruppo({ gruppoId: gruppo.id, dipendentiIds: [...sel] });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      onSaved();
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Membri di &laquo;{gruppo.nome}&raquo;</DialogTitle>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca dipendente…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="max-h-[50vh] space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
          {filtrati.map((d) => {
            const on = sel.has(d.id);
            const altroGruppo = dipGruppo.get(d.id);
            const spostato = altroGruppo && altroGruppo !== gruppo.nome && on;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                className={
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ' +
                  (on ? 'bg-primary/10' : 'hover:bg-muted/50')
                }
              >
                <span
                  className={
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ' +
                    (on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')
                  }
                >
                  {on ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate">{nomeDip(d)}</span>
                {spostato ? (
                  <span className="shrink-0 text-[10px] text-amber-600">
                    da &laquo;{altroGruppo}&raquo;
                  </span>
                ) : altroGruppo && altroGruppo !== gruppo.nome ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{altroGruppo}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Annulla
          </Button>
          <Button type="button" onClick={salva} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Salva (${sel.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
