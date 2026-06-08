'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Loader2, AlertCircle, Lock } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@kommessa/ui';

import { aggiornaCommessa } from '../../../../_actions/aggiorna-commessa';

interface Props {
  commessaId: string;
  nomeCartella: string | null;
  descrizione: string | null;
  indirizzoCantiere: string | null;
}

/**
 * Edit commessa da PWA mobile: descrizione (titolo) + indirizzo cantiere.
 * Touch-first: campi alti, salva full-width. Il nome cartella Nextcloud è
 * mostrato BLOCCATO (resta fisso per sempre), tutto il resto è editabile.
 */
export function CommessaEditMobile({
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

  const submit = async () => {
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
        className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3.5 text-xs font-medium text-primary-foreground/90 transition active:scale-[0.97]"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
        Modifica commessa
      </button>

      <Dialog open={open} onOpenChange={(o) => (saving ? null : setOpen(o))}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Modifica commessa</DialogTitle>
            <DialogDescription>
              Aggiorna descrizione e indirizzo. La cartella su Nextcloud resta
              invariata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border bg-muted/50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Cartella Nextcloud (fissa)
              </p>
              <code className="block break-all font-mono text-[11px] text-muted-foreground">
                {nomeCartella ?? '—'}
              </code>
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                Resta questa per sempre: i file caricati ci puntano. Qui cambi
                solo come la commessa appare in app.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cem-desc"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Descrizione (titolo)
              </label>
              <input
                id="cem-desc"
                value={desc}
                maxLength={120}
                onChange={(e) => setDesc(e.target.value)}
                className="block min-h-[48px] w-full rounded-xl border border-input bg-card px-3 text-base shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder="Es. Sostituzione caldaia e bagno"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cem-ind"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Indirizzo cantiere
              </label>
              <input
                id="cem-ind"
                value={indirizzo}
                maxLength={200}
                onChange={(e) => setIndirizzo(e.target.value)}
                className="block min-h-[48px] w-full rounded-xl border border-input bg-card px-3 text-base shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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

            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                size="lg"
                className="min-h-[52px] w-full text-base"
                onClick={submit}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Salva
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="min-h-[44px] w-full"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Annulla
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
