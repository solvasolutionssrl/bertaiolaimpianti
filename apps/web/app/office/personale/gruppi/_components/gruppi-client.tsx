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
} from '@/app/office/_actions/ferie-permessi';

export interface GruppoRow {
  id: string;
  nome: string;
  approverUserId: string | null;
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

  const onNuovo = () => {
    if (!nuovoNome.trim()) return;
    start(async () => {
      const res = await creaGruppo({ nome: nuovoNome.trim() });
      if (!res.ok) {
        await alert({ title: 'Errore', body: res.error });
        return;
      }
      setNuovoNome('');
      refresh();
    });
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <UsersRound className="h-5 w-5 text-primary" />
          Gruppi e approvatori
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ogni dipendente appartiene a un gruppo, e ogni gruppo ha un approvatore che gestisce le
          richieste di ferie e permessi dei suoi membri. Prima concedi la capacità di approvare,
          poi crea i gruppi e assegna i membri.
        </p>
      </header>

      {/* Approvatori */}
      <Card>
        <CardContent className="py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Chi può approvare
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Attiva la capacità &laquo;approva permessi&raquo; per gli utenti che gestiranno le
            richieste (office o tecnici). Gli admin possono sempre approvare.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {utenti.map((u) => {
              const isAdmin = u.role === 'admin';
              return (
                <label
                  key={u.id}
                  className={
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ' +
                    (u.puoApprovare || isAdmin ? 'border-emerald-200 bg-emerald-50/40' : 'border-border')
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.nome}</span>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
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
        <CardContent className="flex flex-wrap items-end gap-2 py-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nuovo gruppo</span>
            <input
              value={nuovoNome}
              onChange={(e) => setNuovoNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNuovo()}
              placeholder="es. Officina"
              className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </label>
          <Button type="button" onClick={onNuovo} disabled={pending || !nuovoNome.trim()}>
            <Plus className="h-4 w-4" /> Crea gruppo
          </Button>
        </CardContent>
      </Card>

      {/* Gruppi */}
      {gruppi.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nessun gruppo. Creane uno per iniziare (es. Officina, Cantiere, Manutenzione).
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

      {/* Dipendenti senza gruppo */}
      {senzaGruppo.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="py-4">
            <h2 className="mb-1 text-sm font-semibold text-amber-800">
              {senzaGruppo.length} dipendenti senza gruppo
            </h2>
            <p className="mb-2 text-xs text-amber-700">
              Le loro richieste non hanno un approvatore finché non li assegni a un gruppo.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {senzaGruppo.map((d) => (
                <span
                  key={d.id}
                  className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs"
                >
                  {nomeDip(d)}
                </span>
              ))}
            </div>
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

  const salvaNome = () => {
    if (nome.trim() === gruppo.nome || !nome.trim()) {
      setEditNome(false);
      setNome(gruppo.nome);
      return;
    }
    start(async () => {
      const res = await aggiornaGruppo({ id: gruppo.id, nome: nome.trim() });
      if (!res.ok) await alert({ title: 'Errore', body: res.error });
      setEditNome(false);
      onSaved();
    });
  };

  const cambiaApprovatore = (value: string) => {
    start(async () => {
      const res = await aggiornaGruppo({ id: gruppo.id, approverUserId: value || null });
      if (!res.ok) await alert({ title: 'Errore', body: res.error });
      onSaved();
    });
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
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          {editNome ? (
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={salvaNome}
              onKeyDown={(e) => e.key === 'Enter' && salvaNome()}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm font-semibold focus:border-primary focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditNome(true)}
              className="group flex items-center gap-1.5 text-left"
            >
              <span className="text-base font-semibold tracking-tight">{gruppo.nome}</span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
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

        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Approvatore
          </span>
          <select
            value={gruppo.approverUserId ?? ''}
            onChange={(e) => cambiaApprovatore(e.target.value)}
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

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Users className="h-3 w-3" /> {gruppo.membri.length} membri
            </span>
            <Button type="button" size="sm" variant="outline" onClick={onGestisciMembri}>
              Gestisci membri
            </Button>
          </div>
          {membriNomi.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {membriNomi.slice(0, 8).map((n, i) => (
                <span key={i} className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px]">
                  {n}
                </span>
              ))}
              {membriNomi.length > 8 ? (
                <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
                  +{membriNomi.length - 8}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nessun membro.</p>
          )}
        </div>
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
