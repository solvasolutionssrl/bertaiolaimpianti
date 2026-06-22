'use client';

import * as React from 'react';
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
} from '../../../_actions/dipendenti';
import type { DipendenteRow, UtenteRow } from '../page';

interface Props {
  dipendenti: DipendenteRow[];
  utenti: UtenteRow[];
}

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
};

function formFromRow(d: DipendenteRow): FormState {
  return {
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
  };
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

export function DipendentiClient({ dipendenti, utenti }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

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
    if (!pending) setOpen(false);
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

    // Conferma cambio account: richiesta solo se il dipendente aveva GIA un account
    // e l'ufficio lo sta cambiando (o rimuovendo).
    const newUserId = form.user_id || null;
    const origUserId = form._originalUserId ?? null;
    if (
      form.id && // modifica, non creazione
      origUserId && // aveva gia un account
      newUserId !== origUserId // lo sta cambiando
    ) {
      const nomeDip = `${form.nome} ${form.cognome}`;
      const ok = await confirm({
        title: `Cambiare account per ${nomeDip}?`,
        description: newUserId
          ? "L'account attualmente collegato verra sostituito con quello selezionato."
          : "Il dipendente perdera l'accesso all'app.",
        confirmLabel: 'Conferma',
      });
      if (!ok) return;
    }

    start(async () => {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome,
        cognome: form.cognome,
        mansione: form.mansione || null,
        codice_interno: form.codice_interno || null,
        user_id: form.user_id || null,
        stato_attivo: form.stato_attivo,
        a_turni: form.a_turni,
        note: form.note || null,
      };
      const res = form.id
        ? await aggiornaDipendente(payload)
        : await creaDipendente(payload);
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
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
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Totale</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold">{totale}</p>
            <Users className="mb-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Con accesso app</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold">{conLogin}</p>
            <UserCheck className="mb-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ufficio</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold">{conRuoloOffice}</p>
            <Monitor className="mb-0.5 h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tecnici attivi</p>
          <div className="mt-1 flex items-end gap-1.5">
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{attivi}</p>
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
                    <th className="px-4 py-3 font-medium">Nominativo</th>
                    <th className="px-4 py-3 font-medium">Mansione</th>
                    <th className="px-4 py-3 font-medium">Codice</th>
                    <th className="px-4 py-3 font-medium">Accesso</th>
                    <th className="px-4 py-3 font-medium">Ruolo</th>
                    <th className="px-4 py-3 font-medium">Turni</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="w-20 px-4 py-3" aria-label="Azioni" />
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
                        <td className="px-4 py-3 font-medium">
                          {d.cognome} {d.nome}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{d.mansione ?? 'n.d.'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {d.codice_interno ?? 'n.d.'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={d.user_id ? 'default' : 'outline'}>
                            {etichettaAccesso({ user_id: d.user_id })}
                          </Badge>
                          {utente && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {utente.display_name ?? ''}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {utente ? etichettaRuolo(utente.role) : 'n.d.'}
                        </td>
                        <td className="px-4 py-3">
                          {d.a_turni ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Turni
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
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
            <DialogTitle>{form.id ? 'Modifica dipendente' : 'Nuovo dipendente'}</DialogTitle>
          </DialogHeader>
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

            <div className="space-y-1.5">
              <Label htmlFor="user_id">Collega ad account (opzionale)</Label>
              <select
                id="user_id"
                name="user_id"
                value={form.user_id}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Nessun account</option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.id}
                    {u.role ? ` (${etichettaRuolo(u.role)})` : ''}
                  </option>
                ))}
              </select>
              {form._originalUserId && form.user_id && form.user_id !== form._originalUserId && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Stai sostituendo l&apos;account collegato. Verra chiesta conferma.
                </p>
              )}
              {form._originalUserId && !form.user_id && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Stai rimuovendo l&apos;account collegato. Verra chiesta conferma.
                </p>
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
                {pending ? 'Salvo...' : form.id ? 'Salva modifiche' : 'Crea dipendente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
