'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Lock,
  Plus,
  Search,
  X,
  Loader2,
  AlertTriangle,
  Wrench,
} from 'lucide-react';

import { Button, Input, cn } from '@kommessa/ui';
import { aggiungiTipologie } from '../_actions/aggiungi-tipologie';

export interface TipologiaVoce {
  id: number;
  nome: string;
  categoria?: string | null;
}

export interface TipologiaPreset {
  id: string;
  nome: string;
  vociIds: number[];
}

interface Props {
  commessaId: string;
  /** Voci già presenti sulla commessa: bloccate, non rimovibili. */
  vociPresenti: number[];
  /** Catalogo completo voci selezionabili. */
  voci: TipologiaVoce[];
  presets?: TipologiaPreset[];
  /** dialog (desktop centrato) o sheet (mobile bottom). La modale è
   *  comunque responsive: la variante regola solo la larghezza massima. */
  variant?: 'dialog' | 'sheet';
  /** Override del trigger; se assente mostra un bottone standard. */
  triggerLabel?: string;
  triggerClassName?: string;
  triggerSize?: 'sm' | 'default' | 'lg';
}

/**
 * Azione rapida "Aggiungi tipologie impianto" — APPEND-ONLY.
 *
 * Riapre la selezione preset/tipologie usata in creazione: le voci già
 * presenti sono bloccate (solo aggiunta). Alla conferma avvisa che le nuove
 * tipologie creeranno le relative cartelle/strutture su Nextcloud.
 */
export function AggiungiTipologieDialog({
  commessaId,
  vociPresenti,
  voci,
  presets = [],
  variant = 'dialog',
  triggerLabel = 'Aggiungi tipologie',
  triggerClassName,
  triggerSize = 'sm',
}: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        size={triggerSize}
        variant="outline"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </Button>
      {open ? (
        <TipologieModal
          commessaId={commessaId}
          vociPresenti={vociPresenti}
          voci={voci}
          presets={presets}
          variant={variant}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function TipologieModal({
  commessaId,
  vociPresenti,
  voci,
  presets,
  variant,
  onClose,
}: {
  commessaId: string;
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
  variant: 'dialog' | 'sheet';
  onClose: () => void;
}) {
  const router = useRouter();
  const presentiSet = React.useMemo(() => new Set(vociPresenti), [vociPresenti]);
  const [nuove, setNuove] = React.useState<number[]>([]);
  const [search, setSearch] = React.useState('');
  const [confermaStep, setConfermaStep] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const nuoveSet = React.useMemo(() => new Set(nuove), [nuove]);
  const byId = React.useMemo(() => new Map(voci.map((v) => [v.id, v])), [voci]);

  const disponibili = React.useMemo(() => {
    const norm = (s: string) =>
      s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const q = norm(search.trim());
    return voci
      .filter((v) => !presentiSet.has(v.id) && !nuoveSet.has(v.id))
      .filter((v) => (q.length > 0 ? norm(v.nome).includes(q) : true))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }, [voci, presentiSet, nuoveSet, search]);

  const aggiungi = (id: number) => setNuove((s) => [...s, id]);
  const rimuovi = (id: number) => setNuove((s) => s.filter((x) => x !== id));

  const applicaPreset = (preset: TipologiaPreset) => {
    const daAggiungere = preset.vociIds.filter(
      (id) => !presentiSet.has(id) && !nuoveSet.has(id),
    );
    if (daAggiungere.length > 0) setNuove((s) => [...s, ...daAggiungere]);
  };

  const conferma = () => {
    setError(null);
    start(async () => {
      const res = await aggiungiTipologie({ commessaId, voci: nuove });
      if (res.ok) {
        router.refresh();
        onClose();
        return;
      }
      setError(res.error);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aggiungi tipologie impianto"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-2xl',
          variant === 'sheet' ? 'max-w-lg' : 'max-w-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Wrench className="h-4 w-4 text-primary" aria-hidden="true" />
              Tipologie impianto
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Le tipologie si possono solo aggiungere. Quelle già presenti
              restano e non si rimuovono.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!confermaStep ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {/* Presenti (bloccate) */}
            <section>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Già presenti ({vociPresenti.length})
              </p>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {vociPresenti.length === 0 ? (
                  <span className="italic text-muted-foreground">Nessuna.</span>
                ) : (
                  vociPresenti.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-muted-foreground"
                    >
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      {byId.get(id)?.nome ?? `Voce ${id}`}
                    </span>
                  ))
                )}
              </div>
            </section>

            {/* Nuove (rimovibili prima della conferma) */}
            {nuove.length > 0 ? (
              <section>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">
                  Da aggiungere ({nuove.length})
                </p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {nuove.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => rimuovi(id)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2 py-1 text-primary-soft-foreground"
                      aria-label={`Togli ${byId.get(id)?.nome ?? id} dalle nuove`}
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {byId.get(id)?.nome ?? `Voce ${id}`}
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Preset */}
            {presets.length > 0 ? (
              <section>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Preset
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applicaPreset(p)}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/[0.04] px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 active:scale-[0.97]"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      {p.nome}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Catalogo */}
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="relative mb-1.5">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca tipologia…"
                  className="h-10 pl-8 pr-7 text-sm"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Pulisci ricerca"
                    className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <div className="min-h-[8rem] flex-1 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-1">
                {disponibili.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {search
                      ? `Nessuna tipologia per "${search}".`
                      : 'Tutte le tipologie sono già presenti o selezionate.'}
                  </p>
                ) : (
                  disponibili.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => aggiungi(v.id)}
                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted active:bg-muted/70"
                    >
                      <Plus
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="flex-1">{v.nome}</span>
                      {v.categoria ? (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {v.categoria}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : (
          /* Step di conferma con avviso cartelle */
          <div className="flex-1 space-y-3 px-4 py-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2.5 text-sm dark:bg-amber-950/20">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                aria-hidden="true"
              />
              <p className="text-amber-900 dark:text-amber-200">
                Stai per aggiungere <strong>{nuove.length}</strong>{' '}
                {nuove.length === 1 ? 'tipologia' : 'tipologie'}. L&apos;aggiunta
                creerà le relative cartelle e strutture collegate su Nextcloud
                previste dal flusso. Le tipologie aggiunte non potranno essere
                rimosse.
              </p>
            </div>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {nuove.map((id) => (
                <li
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary-soft-foreground"
                >
                  {byId.get(id)?.nome ?? `Voce ${id}`}
                </li>
              ))}
            </ul>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          {!confermaStep ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Annulla
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={nuove.length === 0}
                onClick={() => setConfermaStep(true)}
              >
                Continua ({nuove.length})
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfermaStep(false)}
              >
                Indietro
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={conferma}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Conferma e crea cartelle
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
