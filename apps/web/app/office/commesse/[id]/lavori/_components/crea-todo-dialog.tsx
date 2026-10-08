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
import { normalizzaPriorita, type Priorita } from '@kommessa/api/priorita';
import { PrioritaSelect } from '@/app/_components/priorita-ui';
import { Scelta } from '@/app/_components/scelta';

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
  /**
   * Se chiedere «a chi». Vero in ufficio e per un capo squadra; falso per un
   * tecnico, che scrive una cosa da fare e la lascia a chiunque passi.
   *
   * Non e' solo una casella in meno: chiedere a un tecnico di assegnare un
   * lavoro a un collega gli fa prendere una decisione che non e' sua, e che
   * il server rifiuterebbe comunque.
   */
  puoAssegnare?: boolean;
  onClose: () => void;
}


export function CreaTodoDialog({
  commessaId,
  tecniciTenant,
  editing,
  puoAssegnare = true,
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
    normalizzaPriorita(editing?.priorita),
  );
  const [assegnatoA, setAssegnatoA] = React.useState<string>(
    editing?.assegnato_a ?? '',
  );
  const [scadenza, setScadenza] = React.useState<string>(
    editing?.scadenza_at ? toLocalDatetimeInput(editing.scadenza_at) : '',
  );

  const submit = async () => {
    if (titolo.trim().length === 0) {
      await showAlert({ title: 'Manca il titolo', body: 'Inserisci un titolo per il task.' });
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
          <DialogTitle>{editing ? 'Modifica il task' : 'Nuovo task'}</DialogTitle>
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
            <Label id="t_prio_label">Priorità</Label>
            <PrioritaSelect
              idEtichetta="t_prio_label"
              valore={priorita}
              onCambia={setPriorita}
              className="mt-1.5"
            />
          </div>
          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              puoAssegnare && 'sm:grid-cols-2',
            )}
          >
            {puoAssegnare ? (
              <div>
                <Label htmlFor="t_assegna">Assegnato a</Label>
                {/* Tendina con ricerca: con venti persone in elenco, trovare
                    quella giusta scorrendo un `<select>` di sistema è il gesto
                    che l'ufficio ripete a raffica. */}
                <Scelta
                  id="t_assegna"
                  className="mt-1.5"
                  opzioni={tecniciTenant.map((u) => ({
                    valore: u.id,
                    etichetta: u.display_name ?? u.id.slice(0, 8),
                  }))}
                  valore={assegnatoA || null}
                  onCambia={(v) => setAssegnatoA(v ?? '')}
                  etichettaNessuno="Non assegnato"
                  segnaposto="Non assegnato"
                  segnapostoRicerca="Cerca una persona…"
                  aria-label="Assegnato a"
                />
              </div>
            ) : null}
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
            {editing ? 'Salva modifiche' : 'Crea il task'}
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
