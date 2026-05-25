'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@kommessa/ui';

import {
  aggiornaTodo,
  creaTodo,
} from '../../../../../_actions/commessa-todo';
import { useAlert } from '@/app/_components/confirm-provider';

type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

interface TodoEdit {
  id: string;
  titolo: string;
  descrizione: string | null;
  priorita: Priorita;
  assegnato_a: string | null;
  scadenza_at: string | null;
}

interface Props {
  commessaId: string;
  tecniciTenant: Array<{ id: string; display_name: string | null }>;
  editing?: TodoEdit;
  onClose: () => void;
}

const PRIORITA_OPTS: Array<{ value: Priorita; label: string; chip: string }> = [
  { value: 'bassa', label: 'Bassa', chip: 'bg-muted text-muted-foreground' },
  {
    value: 'media',
    label: 'Media',
    chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  {
    value: 'alta',
    label: 'Alta',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  {
    value: 'urgente',
    label: 'Urgente',
    chip: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
];

export function CreaTodoDialog({
  commessaId,
  tecniciTenant,
  editing,
  onClose,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [submitting, setSubmitting] = React.useState(false);
  const [titolo, setTitolo] = React.useState(editing?.titolo ?? '');
  const [descrizione, setDescrizione] = React.useState(
    editing?.descrizione ?? '',
  );
  const [priorita, setPriorita] = React.useState<Priorita>(
    editing?.priorita ?? 'media',
  );
  const [assegnatoA, setAssegnatoA] = React.useState<string>(
    editing?.assegnato_a ?? '',
  );
  const [scadenza, setScadenza] = React.useState<string>(
    editing?.scadenza_at ? toLocalDatetimeInput(editing.scadenza_at) : '',
  );

  const submit = async () => {
    if (titolo.trim().length === 0) {
      await showAlert({ title: 'Manca il titolo', body: 'Inserisci un titolo per il TODO.' });
      return;
    }
    setSubmitting(true);
    const payload = {
      titolo: titolo.trim(),
      descrizione: descrizione.trim() || undefined,
      priorita,
      assegnatoA: assegnatoA || null,
      scadenzaAt: scadenza ? new Date(scadenza).toISOString() : null,
    };
    const res = editing
      ? await aggiornaTodo({ id: editing.id, ...payload })
      : await creaTodo({ commessaId, ...payload });
    setSubmitting(false);
    if (!res.ok) {
      await showAlert({ title: 'Errore', body: res.error });
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifica TODO' : 'Nuovo TODO'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="t_titolo">Titolo *</Label>
            <Input
              id="t_titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Ordinare pompa da 1,5 kW"
              className="mt-1.5 h-10"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="t_desc">Descrizione (opzionale)</Label>
            <textarea
              id="t_desc"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={3}
              placeholder="Dettagli, contesto, link…"
              className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label>Priorità</Label>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {PRIORITA_OPTS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriorita(p.value)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-all',
                    priorita === p.value
                      ? 'border-primary ring-2 ring-primary/30 ' + p.chip
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="t_assegna">Assegnato a</Label>
              <select
                id="t_assegna"
                value={assegnatoA}
                onChange={(e) => setAssegnatoA(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Non assegnato</option>
                {tecniciTenant.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="t_scad">Scadenza (opzionale)</Label>
              <input
                id="t_scad"
                type="datetime-local"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {editing ? 'Salva modifiche' : 'Crea TODO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalDatetimeInput(iso: string): string {
  // Converte ISO "2026-05-30T15:00:00Z" → "2026-05-30T15:00" in TZ locale.
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}
