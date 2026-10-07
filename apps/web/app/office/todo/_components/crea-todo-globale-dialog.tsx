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
import { PRIORITA_DEFAULT, type Priorita } from '@kommessa/api/priorita';
import { PrioritaSelect } from '@/app/_components/priorita-ui';
import { Scelta } from '@/app/_components/scelta';

interface Props {
  /** Titolo gia' composto a monte: `nome_cartella` non si mostra mai grezza. */
  commesseAttive: Array<{ id: string; codice: string; titolo: string; cliente: string | null }>;
  /**
   * Tutta la squadra, non solo i tecnici: «ordina la pompa» è roba d'ufficio.
   * Prima qui arrivavano solo i `role='tecnico'` e un task non si poteva
   * passare a un collega.
   */
  tecnici: Array<{ id: string; display_name: string | null }>;
  onClose: () => void;
}


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
  const [priorita, setPriorita] = React.useState<Priorita>(PRIORITA_DEFAULT);
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
          <div className="min-w-0">
            <Label htmlFor="g_commessa">Commessa *</Label>
            {/* Duecento commesse in un `<select>` di sistema vogliono dire
                scorrere a occhio: qui si scrive il codice o il cliente. */}
            <Scelta
              id="g_commessa"
              className="mt-1.5"
              opzioni={commesseAttive.map((c) => ({
                valore: c.id,
                etichetta: c.codice,
                dettaglio: [c.cliente, c.titolo].filter(Boolean).join(' — ') || undefined,
                cerca: [c.codice, c.cliente, c.titolo].filter(Boolean).join(' '),
              }))}
              valore={commessaId || null}
              onCambia={(v) => setCommessaId(v ?? '')}
              segnaposto="Scegli la commessa…"
              segnapostoRicerca="Cerca per codice o cliente…"
              aria-label="Commessa"
            />
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
            <Label id="t_prio_label">Priorità</Label>
            <PrioritaSelect
              idEtichetta="t_prio_label"
              valore={priorita}
              onCambia={setPriorita}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="g_assegna">Assegnato a</Label>
              <Scelta
                id="g_assegna"
                className="mt-1.5"
                opzioni={tecnici.map((u) => ({
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
