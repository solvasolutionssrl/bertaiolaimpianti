'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Users,
  UserCheck,
  Monitor,
  HardHat,
  Clock,
  Copy,
  RefreshCw,
  Check,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kommessa/ui';
import { etichettaAccesso } from '@kommessa/api/kantiere';
import { useAlert } from '@/app/_components/confirm-provider';
import { useConfirm } from '@/app/_components/confirm-provider';
import {
  creaDipendente,
  aggiornaDipendente,
  eliminaDipendente,
  creaUtenteDipendente,
} from '../../../_actions/dipendenti';
import type { DipendenteRow, UtenteRow } from '../page';

interface Props {
  dipendenti: DipendenteRow[];
  utenti: UtenteRow[];
  tenantSlug: string;
}

/** Modalità di gestione dell'accesso app per il dipendente. */
type AccountMode = 'none' | 'existing' | 'new';

interface FormState {
  id?: string;
  nome: string;
  cognome: string;
  mansione: string;
  codice_interno: string;
  user_id: string;
  stato_attivo: boolean;
  a_turni: boolean;
  note: string;
  /** user_id originale al momento dell'apertura del dialog (per rilevare cambio) */
  _originalUserId?: string | null;
  // ── creazione accesso ─────────────────────────────────────────────
  accountMode: AccountMode;
  newUsername: string;
  newPassword: string;
  newRole: 'tecnico' | 'office';
}

const EMPTY_FORM: FormState = {
  nome: '',
  cognome: '',
  mansione: '',
  codice_interno: '',
  user_id: '',
  stato_attivo: true,
  a_turni: false,
  note: '',
  _originalUserId: null,
  accountMode: 'none',
  newUsername: '',
  newPassword: '',
  newRole: 'tecnico',
};

function formFromRow(d: DipendenteRow): FormState {
  return {
    ...EMPTY_FORM,
    id: d.id,
    nome: d.nome,
    cognome: d.cognome,
    mansione: d.mansione ?? '',
    codice_interno: d.codice_interno ?? '',
    user_id: d.user_id ?? '',
    stato_attivo: d.stato_attivo,
    a_turni: d.a_turni,
    note: d.note ?? '',
    _originalUserId: d.user_id,
    accountMode: d.user_id ? 'existing' : 'none',
  };
}

/** username suggerito: "nome.cognome" senza accenti/spazi/simboli. */
function slugUsername(nome: string, cognome: string): string {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  const n = norm(nome);
  const c = norm(cognome);
  return n && c ? `${n}.${c}` : n || c;
}

/** Password robusta e leggibile (12 char, niente caratteri ambigui). */
function generaPassword(): string {
  const minus = 'abcdefghijkmnpqrstuvwxyz';
  const maius = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const cifre = '23456789';
  const simb = '!@#$%';
  const tutti = minus + maius + cifre + simb;
  const rnd = (n: number) => {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return a;
  };
  const pick = (set: string, n: number): string[] => {
    const a = rnd(n);
    return Array.from({ length: n }, (_, i) => set[a[i]! % set.length] ?? set[0]!);
  };
  const chars = [
    ...pick(minus, 1),
    ...pick(maius, 1),
    ...pick(cifre, 2),
    ...pick(simb, 1),
    ...pick(tutti, 7),
  ];
  const a = rnd(chars.length);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = a[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/**
 * Calcola il defaultUserId da pre-selezionare: trova l'utente il cui
 * display_name corrisponde esattamente (case-insensitive, trim) a "Nome Cognome"
 * del dipendente. Se non c'e corrispondenza, ritorna null.
 */
function autoMatchUserId(
  nome: string,
  cognome: string,
  utenti: UtenteRow[],
): string | null {
  const target = `${nome.trim()} ${cognome.trim()}`.toLowerCase();
  const match = utenti.find(
    (u) => (u.display_name ?? '').trim().toLowerCase() === target,
  );
  return match?.id ?? null;
}

/** Ruolo utente normalizzato per i filtri */
type FiltroRuolo = '' | 'office' | 'tecnico' | 'altro';

function etichettaRuolo(role: string | null | undefined): string {
  if (!role) return 'n.d.';
  if (role === 'admin' || role === 'office') return 'Ufficio';
  if (role === 'tecnico') return 'Tecnico';
  return role;
}

function categoriaRuolo(user_id: string | null, utenti: UtenteRow[]): FiltroRuolo {
  if (!user_id) return 'tecnico'; // senza account = tecnico (solo timbratura)
  const u = utenti.find((x) => x.id === user_id);
  if (!u) return 'altro';
  const r = u.role ?? '';
  if (r === 'admin' || r === 'office') return 'office';
  if (r === 'tecnico') return 'tecnico';
  return 'altro';
}

export function DipendentiClient({ dipendenti, utenti, tenantSlug }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  // Credenziali create da mostrare una volta sola (la password non si rivede).
  const [credenziali, setCredenziali] = React.useState<{ loginEmail: string; password: string } | null>(null);
  const [copiato, setCopiato] = React.useState<string | null>(null);

  function copia(testo: string, key: string) {
    if (!testo) return;
    void navigator.clipboard?.writeText(testo).then(
      () => {
        setCopiato(key);
        setTimeout(() => setCopiato((c) => (c === key ? null : c)), 1500);
      },
      () => undefined,
    );
  }

  function switchMode(mode: AccountMode) {
    setForm((f) => {
      const next = { ...f, accountMode: mode };
      // Passando a "Crea nuovo", precompila username + password se vuoti.
      if (mode === 'new') {
        if (!next.newUsername) next.newUsername = slugUsername(f.nome, f.cognome);
        if (!next.newPassword) next.newPassword = generaPassword();
      }
      return next;
    });
  }

  // Filtri
  const [cerca, setCerca] = React.useState('');
  const [filtroRuolo, setFiltroRuolo] = React.useState<FiltroRuolo>('');
  const [filtroStato, setFiltroStato] = React.useState<'tutti' | 'attivi'>('tutti');

  // Statistiche
  const totale = dipendenti.length;
  const conLogin = dipendenti.filter((d) => !!d.user_id).length;
  const conRuoloOffice = dipendenti.filter((d) => categoriaRuolo(d.user_id, utenti) === 'office').length;
  const attivi = dipendenti.filter((d) => d.stato_attivo).length;

  // Applicazione filtri
  const q = cerca.trim().toLowerCase();
  const visibili = dipendenti.filter((d) => {
    if (filtroStato === 'attivi' && !d.stato_attivo) return false;
    if (filtroRuolo && categoriaRuolo(d.user_id, utenti) !== filtroRuolo) return false;
    if (q) {
      const full = `${d.cognome} ${d.nome}`.toLowerCase();
      const codice = (d.codice_interno ?? '').toLowerCase();
      const mansione = (d.mansione ?? '').toLowerCase();
      if (!full.includes(q) && !codice.includes(q) && !mansione.includes(q)) return false;
    }
    return true;
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(d: DipendenteRow) {
    const base = formFromRow(d);
    // Auto-match: se il dipendente non ha ancora un account collegato,
    // pre-seleziona quello il cui nome corrisponde.
    if (!d.user_id) {
      const matched = autoMatchUserId(d.nome, d.cognome, utenti);
      if (matched) {
        base.user_id = matched;
        // _originalUserId resta null: nessun account precedente, nessuna conferma
      }
    }
    setForm(base);
    setOpen(true);
  }

  function closeDialog() {
    if (!pending) {
      setOpen(false);
      setCredenziali(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm((f) => ({ ...f, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Conferma cambio accesso solo se si MODIFICA un dipendente che aveva già un account.
    if (form.id && (form._originalUserId ?? null)) {
      const willBe =
        form.accountMode === 'existing'
          ? form.user_id || null
          : form.accountMode === 'none'
            ? null
            : '__nuovo__';
      if (willBe !== (form._originalUserId ?? null)) {
        const ok = await confirm({
          title: `Cambiare accesso per ${form.nome} ${form.cognome}?`,
          description:
            willBe === null
              ? "Il dipendente perderà l'accesso all'app."
              : "L'account collegato verrà sostituito.",
          confirmLabel: 'Conferma',
        });
        if (!ok) return;
      }
    }

    start(async () => {
      // 1) Risolvi lo user_id da collegare (eventualmente creando l'accesso).
      let userId: string | null = null;
      let nuoveCredenziali: { loginEmail: string; password: string } | null = null;

      if (form.accountMode === 'existing') {
        userId = form.user_id || null;
      } else if (form.accountMode === 'new') {
        const username = form.newUsername.trim().toLowerCase();
        if (username.length < 2) {
          await showAlert({ title: 'Username mancante', body: 'Inserisci uno username valido.' });
          return;
        }
        if (form.newPassword.length < 8) {
          await showAlert({ title: 'Password troppo corta', body: 'Almeno 8 caratteri.' });
          return;
        }
        const ures = await creaUtenteDipendente({
          username,
          displayName: `${form.nome} ${form.cognome}`.trim(),
          role: form.newRole,
          password: form.newPassword,
        });
        if (!ures.ok) {
          await showAlert({ title: 'Errore creazione accesso', body: ures.error });
          return;
        }
        userId = ures.userId;
        nuoveCredenziali = { loginEmail: ures.loginEmail, password: form.newPassword };
      }

      // 2) Crea/aggiorna il dipendente con lo user_id risolto.
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome,
        cognome: form.cognome,
        mansione: form.mansione || null,
        codice_interno: form.codice_interno || null,
        user_id: userId,
        stato_attivo: form.stato_attivo,
        a_turni: form.a_turni,
        note: form.note || null,
      };
      const res = form.id ? await aggiornaDipendente(payload) : await creaDipendente(payload);
      if (!res.ok) {
        await showAlert({
          title: nuoveCredenziali ? 'Accesso creato, dipendente NON salvato' : 'Errore',
          body:
            res.error +
            (nuoveCredenziali
              ? ` — l'accesso ${nuoveCredenziali.loginEmail} è stato creato: collegalo a mano.`
              : ''),
        });
        return;
      }

      // 3) Se ho creato un accesso, mostra le credenziali (una sola volta).
      if (nuoveCredenziali) {
        setCredenziali(nuoveCredenziali);
        router.refresh();
        return; // dialog resta aperto sul pannello credenziali
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleElimina(d: DipendenteRow) {
    start(async () => {
      const ok = await confirm({
        title: `Eliminare ${d.cognome} ${d.nome}?`,
        description: 'Questa azione non puo essere annullata.',
        confirmLabel: 'Elimina',
        destructive: true,
      });
      if (!ok) return;
      const res = await eliminaDipendente({ id: d.id });
      if (!res.ok) {
        await showAlert({ title: 'Impossibile eliminare', body: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {/* Barra statistiche */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Totale</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-xl font-semibold tabular-nums">{totale}</p>
            <Users className="mb-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Con accesso app</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-xl font-semibold tabular-nums">{conLogin}</p>
            <UserCheck className="mb-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Ufficio</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-xl font-semibold tabular-nums">{conRuoloOffice}</p>
            <Monitor className="mb-0.5 h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Tecnici attivi</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{attivi}</p>
            <HardHat className="mb-0.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Toolbar: ricerca + filtri + pulsante */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca nome, cognome, mansione, codice..."
            className="w-full rounded-md border border-input bg-background pl-8 pr-8 py-1.5 text-sm"
          />
          {cerca && (
            <button
              type="button"
              onClick={() => setCerca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Cancella ricerca"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <select
          value={filtroRuolo}
          onChange={(e) => setFiltroRuolo(e.target.value as FiltroRuolo)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Filtra per ruolo"
        >
          <option value="">Tutti i ruoli</option>
          <option value="office">Ufficio</option>
          <option value="tecnico">Tecnico</option>
          <option value="altro">Altro</option>
        </select>
        <select
          value={filtroStato}
          onChange={(e) => setFiltroStato(e.target.value as 'tutti' | 'attivi')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          aria-label="Filtra per stato"
        >
          <option value="tutti">Tutti gli stati</option>
          <option value="attivi">Solo attivi</option>
        </select>
        {(cerca || filtroRuolo || filtroStato !== 'tutti') && (
          <span className="text-xs text-muted-foreground">
            {visibili.length} di {totale}
          </span>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Nuovo dipendente
          </Button>
        </div>
      </div>

      {/* Table */}
      {dipendenti.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 py-12 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground">Nessun dipendente registrato</p>
          <p className="mt-1 text-xs text-muted-foreground">Aggiungi il primo dipendente con il pulsante in alto.</p>
        </div>
      ) : visibili.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nessun dipendente corrisponde ai filtri applicati.</p>
          <button
            type="button"
            onClick={() => { setCerca(''); setFiltroRuolo(''); setFiltroStato('tutti'); }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Rimuovi filtri
          </button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nominativo</th>
                    <th className="px-3 py-2 font-medium">Mansione</th>
                    <th className="px-3 py-2 font-medium">Codice</th>
                    <th className="px-3 py-2 font-medium">Accesso</th>
                    <th className="px-3 py-2 font-medium">Ruolo</th>
                    <th className="px-3 py-2 font-medium">Turni</th>
                    <th className="px-3 py-2 font-medium">Stato</th>
                    <th className="w-32 px-3 py-2" aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((d, i) => {
                    const utente = utenti.find((u) => u.id === d.user_id);
                    return (
                      <tr
                        key={d.id}
                        className={
                          i % 2 === 0
                            ? 'border-b border-border transition-colors hover:bg-primary-soft/50'
                            : 'border-b border-border bg-muted/20 transition-colors hover:bg-primary-soft/50'
                        }
                      >
                        <td className="px-3 py-2 font-medium">
                          <Link
                            href={`/office/kantiere/dipendenti/${d.id}`}
                            className="text-primary hover:underline"
                          >
                            {d.cognome} {d.nome}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{d.mansione ?? 'n.d.'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {d.codice_interno ?? 'n.d.'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={d.user_id ? 'default' : 'outline'}>
                            {etichettaAccesso({ user_id: d.user_id })}
                          </Badge>
                          {utente && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {utente.display_name ?? ''}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {utente ? etichettaRuolo(utente.role) : 'n.d.'}
                        </td>
                        <td className="px-3 py-2">
                          {d.a_turni ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Turni
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              d.stato_attivo
                                ? 'inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                                : 'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground'
                            }
                          >
                            <span
                              className={
                                d.stato_attivo
                                  ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                                  : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/50'
                              }
                            />
                            {d.stato_attivo ? 'Attivo' : 'Non attivo'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/office/kantiere/dipendenti/${d.id}`}
                                aria-label={`Apri scheda di ${d.cognome} ${d.nome}`}
                              >
                                Apri
                                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifica"
                              onClick={() => openEdit(d)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Elimina"
                              onClick={() => handleElimina(d)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog crea / modifica */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {credenziali ? 'Accesso creato' : form.id ? 'Modifica dipendente' : 'Nuovo dipendente'}
            </DialogTitle>
          </DialogHeader>
          {credenziali ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Accesso creato e collegato al dipendente
                </p>
                <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-400/80">
                  Annota subito queste credenziali: la password non sarà più mostrata.
                </p>
              </div>
              <CredRow label="Login" value={credenziali.loginEmail} copyKey="cred-login" copiato={copiato} onCopy={copia} mono />
              <CredRow label="Password" value={credenziali.password} copyKey="cred-pw" copiato={copiato} onCopy={copia} mono />
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setCredenziali(null);
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  Ho salvato, chiudi
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cognome">Cognome *</Label>
                <Input
                  id="cognome"
                  name="cognome"
                  value={form.cognome}
                  onChange={handleChange}
                  required
                  placeholder="Rossi"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  required
                  placeholder="Mario"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mansione">Mansione</Label>
                <Input
                  id="mansione"
                  name="mansione"
                  value={form.mansione}
                  onChange={handleChange}
                  placeholder="Elettricista"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codice_interno">Codice interno</Label>
                <Input
                  id="codice_interno"
                  name="codice_interno"
                  value={form.codice_interno}
                  onChange={handleChange}
                  placeholder="Automatico (DIP-001...)"
                />
                {!form.id && (
                  <p className="text-xs text-muted-foreground">
                    Lascia vuoto per assegnazione automatica
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Accesso all&apos;app</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'none', l: 'Nessuno' },
                  { v: 'existing', l: 'Collega esistente' },
                  { v: 'new', l: 'Crea nuovo' },
                ] as { v: AccountMode; l: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => switchMode(opt.v)}
                    className={[
                      'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                      form.accountMode === opt.v
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-input bg-background text-muted-foreground hover:bg-muted/40',
                    ].join(' ')}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              {form.accountMode === 'existing' && (
                <div className="space-y-1.5">
                  <select
                    id="user_id"
                    name="user_id"
                    value={form.user_id}
                    onChange={handleChange}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Seleziona un account…</option>
                    {utenti.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name ?? u.id}
                        {u.role ? ` (${etichettaRuolo(u.role)})` : ''}
                      </option>
                    ))}
                  </select>
                  {form._originalUserId && form.user_id && form.user_id !== form._originalUserId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Stai sostituendo l&apos;account collegato. Verrà chiesta conferma.
                    </p>
                  )}
                </div>
              )}

              {form.accountMode === 'new' && (
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="newUsername" className="text-xs">
                      Username
                    </Label>
                    <Input
                      id="newUsername"
                      name="newUsername"
                      value={form.newUsername}
                      onChange={handleChange}
                      placeholder="nome.cognome"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Login:{' '}
                      <span className="font-mono text-foreground">
                        {(form.newUsername.trim().toLowerCase() || 'nome.cognome')}@{tenantSlug}.kommessa.local
                      </span>
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="newPassword" className="text-xs">
                      Password
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="newPassword"
                        name="newPassword"
                        value={form.newPassword}
                        onChange={handleChange}
                        placeholder="min 8 caratteri"
                        className="flex-1 font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, newPassword: generaPassword() }))}
                        title="Genera password"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!form.newPassword}
                        onClick={() => copia(form.newPassword, 'pw-form')}
                        title="Copia password"
                      >
                        {copiato === 'pw-form' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="newRole" className="text-xs">
                      Ruolo
                    </Label>
                    <select
                      id="newRole"
                      name="newRole"
                      value={form.newRole}
                      onChange={handleChange}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="tecnico">Tecnico (timbra in cantiere)</option>
                      <option value="office">Ufficio (gestionale)</option>
                    </select>
                  </div>

                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    L&apos;accesso viene creato e collegato a questo dipendente. Annota le credenziali: la
                    password non sarà più visibile dopo.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <textarea
                id="note"
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={2}
                placeholder="Annotazioni facoltative..."
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <input
                  id="stato_attivo"
                  name="stato_attivo"
                  type="checkbox"
                  checked={form.stato_attivo}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="stato_attivo" className="cursor-pointer select-none">
                  Dipendente attivo
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="a_turni"
                  name="a_turni"
                  type="checkbox"
                  checked={form.a_turni}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="a_turni" className="cursor-pointer select-none">
                  Lavoro a turni
                </Label>
                <span className="text-xs text-muted-foreground">(influisce sul calcolo delle maggiorazioni)</span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={pending}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {pending
                  ? 'Salvo...'
                  : form.accountMode === 'new'
                    ? form.id
                      ? 'Salva e crea accesso'
                      : 'Crea dipendente e accesso'
                    : form.id
                      ? 'Salva modifiche'
                      : 'Crea dipendente'}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CredRow({
  label,
  value,
  copyKey,
  copiato,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copyKey: string;
  copiato: string | null;
  onCopy: (value: string, key: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1.5">
        <code
          className={`flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-sm ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={() => onCopy(value, copyKey)}>
          {copiato === copyKey ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
