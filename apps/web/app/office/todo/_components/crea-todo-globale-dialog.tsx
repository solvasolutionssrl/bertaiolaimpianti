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

import { creaTodo } from '../../../_actions/commessa-todo';
import { useAlert } from '@/app/_components/confirm-provider';

type Priorita = 'bassa' | 'media' | 'alta' | 'urgente';

interface Props {
  commesseAttive: Array<{ id: string; codice_interno: string; nome_cartella: string }>;
  tecnici: Array<{ id: string; display_name: string | null }>;
  onClose: () => void;
}

const PRIORITA_OPTS: Array<{ value: Priorita; label: string; chip: string }> = [
  { value: 'bassa', label: 'Bassa', chip: 'bg-muted text-muted-foreground' },
  { value: 'media', label: 'Media', chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  { value: 'alta', label: 'Alta', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'urgente', label: 'Urgente', chip: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

export function CreaTodoGlobaleDialog({
  commesseAttive,
  tecnici,
  onClose,
}: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [submitting, setSubmitting] = React.useState(false);
  const [commessaId, setCommessaId] = React.useState(commesseAttive[0]?.id ?? '');
  const [titolo, setTitolo] = React.useState('');
  const [descrizione, setDescrizione] = React.useState('');
  const [priorita, setPriorita] = React.useState<Priorita>('media');
  const [assegnatoA, setAssegnatoA] = React.useState<string>('');
  const [scadenza, setScadenza] = React.useState<string>('');

  const submit = async () => {
    if (!commessaId) {
      await showAlert({
        title: 'Manca la commessa',
        body: 'Seleziona la commessa a cui assegnare il TODO.',
      });
      return;
    }
    if (titolo.trim().length === 0) {
      await showAlert({ title: 'Manca il titolo' });
      return;
    }
    setSubmitting(true);
    const res = await creaTodo({
      commessaId,
      titolo: titolo.trim(),
      descrizione: descrizione.trim() || undefined,
      priorita,
      assegnatoA: assegnatoA || null,
      scadenzaAt: scadenza ? new Date(scadenza).toISOString() : null,
    });
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
          <DialogTitle>Nuovo TODO</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="g_commessa">Commessa *</Label>
            <select
              id="g_commessa"
              value={commessaId}
              onChange={(e) => setCommessaId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">— Seleziona commessa —</option>
              {commesseAttive.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice_interno} · {c.nome_cartella}
                </option>
              ))}
            </select>
            {commesseAttive.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                Nessuna commessa attiva. Crea prima una commessa.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="g_titolo">Titolo *</Label>
            <Input
              id="g_titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Ordinare pompa da 1,5 kW"
              className="mt-1.5 h-10"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="g_desc">Descrizione (opzionale)</Label>
            <textarea
              id="g_desc"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={2}
              placeholder="Dettagli, link, contesto…"
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
              <Label htmlFor="g_assegna">Assegnato a</Label>
              <select
                id="g_assegna"
                value={assegnatoA}
                onChange={(e) => setAssegnatoA(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">Non assegnato</option>
                {tecnici.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="g_scad">Scadenza (opzionale)</Label>
              <input
                id="g_scad"
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
          <Button onClick={submit} disabled={submitting || !commessaId}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Crea TODO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
