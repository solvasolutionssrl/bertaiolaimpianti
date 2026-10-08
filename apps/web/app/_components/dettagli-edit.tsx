'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Loader2, AlertCircle, X } from 'lucide-react';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kommessa/ui';

import { aggiornaDettagliCommessa } from '../_actions/dettagli-commessa';
import { ConfirmDialog } from './confirm-dialog';

interface Props {
  commessaId: string;
  /** Testo corrente (può essere null se non c'è ancora nessun dettaglio). */
  initial: string | null;
  /** Se false il bottone "Modifica" è nascosto. */
  canEdit: boolean;
  /** Override classi del trigger matita (es. per sfondi scuri). */
  triggerClassName?: string;
}

/**
 * Editor inline per il campo "Dettagli" della commessa — la nota di chi ha
 * aperto il lavoro, che i tecnici leggono in cantiere.
 *
 * Comportamento: la matita (se `canEdit`) apre un dialog con il testo dentro;
 * uscendo con modifiche non salvate si chiede conferma con `ConfirmDialog`,
 * mai col `confirm()` del browser.
 *
 * ⚠️ Qui c'era anche una modalità "aggiungi in fondo" (`startAppend`), con
 * tanto di titolo e descrizione dedicati nel dialog: **nessun tasto l'ha mai
 * aperta**, in nessuna delle due superfici. Tolta l'08/10/2026 insieme alla
 * sua icona. Se serve davvero un «Aggiungi nota» che non tocchi il testo
 * esistente, si rifà con un tasto che si vede.
 */
export function DettagliEdit({ commessaId, initial, canEdit, triggerClassName }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false);

  const startEdit = () => {
    setDraft(initial ?? '');
    setError(null);
    setOpen(true);
  };

  const isDirty = React.useMemo(
    () => (draft ?? '').trim() !== (initial ?? '').trim(),
    [draft, initial],
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }
    if (saving) return; // blocca chiusura durante save
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    setOpen(false);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const res = await aggiornaDettagliCommessa({ commessaId, testo: draft });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (!canEdit) return null;

  return (
    <>
      {/* Icona matita in alto a destra — assoluta nel card relative */}
      <button
        type="button"
        onClick={startEdit}
        className={cn(
          'absolute right-2 top-2 rounded-md p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors',
          triggerClassName,
        )}
        title="Correggi il testo della nota iniziale"
        aria-label="Modifica dettagli lavoro"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(e) => {
            if (isDirty) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Modifica dettagli</DialogTitle>
            <DialogDescription>
              Aggiorna la descrizione del lavoro. La leggono i tecnici sul telefono.
            </DialogDescription>
          </DialogHeader>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            autoFocus
            placeholder="C'è da fare l'installazione del…"
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
          />

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Annulla
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !isDirty}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCloseOpen}
        title="Esci senza salvare?"
        description="Le modifiche non salvate andranno perse."
        confirmLabel="Esci"
        cancelLabel="Continua a modificare"
        destructive
        onConfirm={() => {
          setConfirmCloseOpen(false);
          setOpen(false);
        }}
        onCancel={() => setConfirmCloseOpen(false)}
      />
    </>
  );
}
