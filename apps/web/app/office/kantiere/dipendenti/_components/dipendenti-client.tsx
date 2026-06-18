'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
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
  note: string;
}

const EMPTY_FORM: FormState = {
  nome: '',
  cognome: '',
  mansione: '',
  codice_interno: '',
  user_id: '',
  stato_attivo: true,
  note: '',
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
    note: d.note ?? '',
  };
}

export function DipendentiClient({ dipendenti, utenti }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(d: DipendenteRow) {
    setForm(formFromRow(d));
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome,
        cognome: form.cognome,
        mansione: form.mansione || null,
        codice_interno: form.codice_interno || null,
        user_id: form.user_id || null,
        stato_attivo: form.stato_attivo,
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
        description: 'Questa azione non può essere annullata.',
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
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {dipendenti.length === 0
            ? 'Nessun dipendente registrato.'
            : `${dipendenti.length} dipendent${dipendenti.length === 1 ? 'e' : 'i'}`}
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Nuovo dipendente
        </Button>
      </div>

      {/* Table */}
      {dipendenti.length > 0 && (
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
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="w-20 px-4 py-3" aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {dipendenti.map((d, i) => (
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
                      <td className="px-4 py-3 text-muted-foreground">{d.mansione ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {d.codice_interno ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={d.user_id ? 'default' : 'outline'}
                        >
                          {etichettaAccesso({ user_id: d.user_id })}
                        </Badge>
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
                  ))}
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
                  placeholder="DIP-001"
                />
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
                <option value="">— Nessun account —</option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.id}
                    {u.role ? ` (${u.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <textarea
                id="note"
                name="note"
                value={form.note}
                onChange={handleChange}
                rows={2}
                placeholder="Annotazioni facoltative…"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

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

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={pending}>
                Annulla
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {pending ? 'Salvo…' : form.id ? 'Salva modifiche' : 'Crea dipendente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
