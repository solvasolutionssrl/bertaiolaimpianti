'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Loader2, AlertCircle, X } from 'lucide-react';
import {
  Button,
  Input,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kommessa/ui';

import { aggiornaCommessaCompleta } from '../_actions/aggiorna-commessa-completa';

interface Props {
  commessaId: string;
  /** Descrizione corrente (titolo "umano" della commessa). */
  initial: string | null;
  canEdit: boolean;
  triggerClassName?: string;
}

/**
 * Editor inline del **titolo mostrato** di una commessa
 * (`descrizione_ai_finale`), dalla matita accanto al titolo.
 *
 * ⚠️ NON rinomina la cartella su Nextcloud: `nome_cartella` è congelato alla
 * nascita, e dal 08/10/2026 il CamelCase si deriva una volta sola da qui
 * (`@kommessa/api/nome-cartella`).
 *
 * ⚠️ Si chiamava «Descrizione cantiere», come la card che lo conteneva: quella
 * card è stata tolta — ripeteva il titolo che ha dieci pixel sopra — e il
 * nome è rimasto solo qui, dove nessun'altra superficie lo usava più.
 */
export function DescrizioneCantiereEdit({
  commessaId,
  initial,
  canEdit,
  triggerClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(initial ?? '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = () => {
    setDraft(initial ?? '');
    setError(null);
    setOpen(true);
  };

  const dirty = (draft ?? '').trim() !== (initial ?? '').trim();

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await aggiornaCommessaCompleta({
      commessaId,
      descrizioneFinale: draft.trim(),
    });
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
      <button
        type="button"
        onClick={start}
        className={cn(
          'rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground',
          triggerClassName,
        )}
        title="Modifica la descrizione (il titolo mostrato della commessa)"
        aria-label="Modifica la descrizione del lavoro"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={(n) => (saving ? null : setOpen(n))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Descrizione del lavoro</DialogTitle>
            <DialogDescription>
              È il nome mostrato della commessa. Il nome della cartella su
              Nextcloud resta invariato.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={draft}
            maxLength={120}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty && !saving) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Es. Sistemazione bagno piano terra"
            className="h-11 text-base"
          />

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Annulla
            </Button>
            <Button type="button" onClick={submit} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
