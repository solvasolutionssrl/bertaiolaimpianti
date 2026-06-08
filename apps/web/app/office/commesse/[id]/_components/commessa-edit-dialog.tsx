'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Loader2, AlertCircle, Lock, X } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kommessa/ui';

import { aggiornaCommessa } from '../../../../_actions/aggiorna-commessa';

interface Props {
  commessaId: string;
  /** Nome cartella Nextcloud: mostrato come BLOCCATO, non editabile. */
  nomeCartella: string | null;
  descrizione: string | null;
  indirizzoCantiere: string | null;
}

/**
 * Editor della commessa finalizzata. Tutto editabile TRANNE il nome cartella
 * Nextcloud, che resta congelato (rinominarlo romperebbe i file già
 * sincronizzati). La UI lo mostra in chiaro come campo bloccato.
 */
export function CommessaEditDialog({
  commessaId,
  nomeCartella,
  descrizione,
  indirizzoCantiere,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [desc, setDesc] = React.useState(descrizione ?? '');
  const [indirizzo, setIndirizzo] = React.useState(indirizzoCantiere ?? '');

  const start = () => {
    setDesc(descrizione ?? '');
    setIndirizzo(indirizzoCantiere ?? '');
    setError(null);
    setOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const res = await aggiornaCommessa({
      commessaId,
      descrizioneFinale: desc.trim(),
      indirizzoCantiere: indirizzo.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        title="Modifica commessa"
        aria-label="Modifica commessa"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={(o) => (saving ? null : setOpen(o))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica commessa</DialogTitle>
            <DialogDescription>
              Aggiorna descrizione e indirizzo. Il codice e la cartella su
              Nextcloud restano invariati.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Campo BLOCCATO: nome cartella Nextcloud */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Cartella Nextcloud (non modificabile)
              </Label>
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/50 px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
                  {nomeCartella ?? '—'}
                </code>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Il nome della cartella resta questo per sempre: i file già
                caricati ci puntano. Cambi la descrizione qui sotto solo per
                come la commessa appare in app, non sul disco.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-desc">Descrizione (titolo in app)</Label>
              <Input
                id="ce-desc"
                value={desc}
                maxLength={120}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Es. Sostituzione caldaia e rifacimento bagno"
              />
              <p className="text-[11px] text-muted-foreground">
                È il titolo leggibile mostrato ai tecnici e in ufficio.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-ind">Indirizzo cantiere</Label>
              <Input
                id="ce-ind"
                value={indirizzo}
                maxLength={200}
                onChange={(e) => setIndirizzo(e.target.value)}
                placeholder="via, civico, città"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>

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
            <Button type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
