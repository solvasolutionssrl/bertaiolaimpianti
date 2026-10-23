'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Plus, RotateCcw, X, Archive } from 'lucide-react';
import { Button, Input, Label, cn } from '@kommessa/ui';
import { useConfirm } from '@/app/_components/confirm-provider';
import {
  aggiornaSottocantiere,
  chiudiSottocantiere,
  creaSottocantiere,
  riapriSottocantiere,
} from '@/app/office/_actions/sottocantieri';

export interface SottocantiereRow {
  id: string;
  nome: string;
  descrizione: string | null;
  codice: string | null;
  stato: 'attivo' | 'chiuso';
  /** Nata dal gestionale: nome e codice non si cambiano da qui. */
  dalGestionale: boolean;
}

type Bozza = { nome: string; descrizione: string; codice: string };
const VUOTA: Bozza = { nome: '', descrizione: '', codice: '' };

/**
 * Il modulo di una fase (nuova o in modifica). ⚠️ Componente di primo livello,
 * non definito dentro la card: definito nel render si rimontava a ogni tasto
 * battuto, l'`autoFocus` scattava di nuovo e il cursore saltava da un campo
 * all'altro (trovato dal banco: «01» finiva meta' nel codice e meta' nel nome).
 */
function ModuloFase({
  valore,
  onChange,
  onSalva,
  onAnnulla,
  salvaEtichetta,
  bloccaIdentita,
  pending,
}: {
  valore: Bozza;
  onChange: (b: Bozza) => void;
  onSalva: () => void;
  onAnnulla: () => void;
  salvaEtichetta: string;
  bloccaIdentita: boolean;
  pending: boolean;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <div className="space-y-1">
        <Label className="text-xs">Codice</Label>
        <Input value={valore.codice} onChange={(e) => onChange({ ...valore, codice: e.target.value })} placeholder="es. 01" className="h-9 font-mono text-sm" disabled={pending || bloccaIdentita} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Nome</Label>
        <Input value={valore.nome} onChange={(e) => onChange({ ...valore, nome: e.target.value })} placeholder="Nome della fase" className="h-9 text-sm" disabled={pending || bloccaIdentita} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs">Descrizione</Label>
        <Input value={valore.descrizione} onChange={(e) => onChange({ ...valore, descrizione: e.target.value })} placeholder="Facoltativa" className="h-9 text-sm" disabled={pending} />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={onSalva} disabled={pending || !valore.nome.trim()}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          {salvaEtichetta}
        </Button>
        <Button size="sm" variant="outline" onClick={onAnnulla} disabled={pending}>
          Annulla
        </Button>
        {bloccaIdentita ? <span className="text-xs text-muted-foreground">Nome e codice arrivano dal gestionale.</span> : null}
      </div>
    </div>
  );
}

/**
 * Le fasi del cantiere: elenco, aggiunta, modifica in riga, chiusura.
 *
 * Una fase non si cancella (le ore gia' scritte la citano): si chiude, e
 * sparisce dai pannelli di scelta. Chi arriva dal gestionale tiene nome e
 * codice: da qui si toccano descrizione e stato.
 */
export function SottocantieriCard({ cantiereId, fasi }: { cantiereId: string; fasi: SottocantiereRow[] }) {
  const router = useRouter();
  const chiediConferma = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [nuova, setNuova] = React.useState<Bozza | null>(null);
  const [inModifica, setInModifica] = React.useState<string | null>(null);
  const [bozza, setBozza] = React.useState<Bozza>(VUOTA);
  const [errore, setErrore] = React.useState<string | null>(null);
  const [mostraChiuse, setMostraChiuse] = React.useState(false);

  const attive = fasi.filter((f) => f.stato === 'attivo');
  const chiuse = fasi.filter((f) => f.stato === 'chiuso');
  const visibili = mostraChiuse ? fasi : attive;

  function salvaNuova() {
    if (!nuova) return;
    setErrore(null);
    startTransition(async () => {
      const res = await creaSottocantiere({ cantiereId, nome: nuova.nome, descrizione: nuova.descrizione || null, codice: nuova.codice || null });
      if (!res.ok) return setErrore(res.error);
      setNuova(null);
      router.refresh();
    });
  }

  function salvaModifica(id: string) {
    setErrore(null);
    startTransition(async () => {
      const res = await aggiornaSottocantiere({ id, nome: bozza.nome, descrizione: bozza.descrizione || null, codice: bozza.codice || null });
      if (!res.ok) return setErrore(res.error);
      setInModifica(null);
      router.refresh();
    });
  }

  async function chiudi(f: SottocantiereRow) {
    const ok = await chiediConferma({
      title: 'Chiudere la fase?',
      description: `«${f.nome}» non verrà più proposta nella scelta del cantiere. Le ore già registrate restano.`,
      confirmLabel: 'Chiudi la fase',
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await chiudiSottocantiere({ id: f.id });
      if (!res.ok) return setErrore(res.error);
      router.refresh();
    });
  }

  function riapri(f: SottocantiereRow) {
    startTransition(async () => {
      const res = await riapriSottocantiere({ id: f.id });
      if (!res.ok) return setErrore(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-sottocantieri-card>
      {errore ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{errore}</p> : null}

      {visibili.length === 0 && !nuova ? (
        <p className="text-sm text-muted-foreground">Nessun sottocantiere. Le fasi del cantiere si aggiungono da qui o arrivano dal gestionale.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {visibili.map((f) => (
            <li key={f.id} className={cn('px-3 py-2', f.stato === 'chiuso' && 'bg-muted/30')} data-fase={f.id}>
              {inModifica === f.id ? (
                <ModuloFase valore={bozza} onChange={setBozza} onSalva={() => salvaModifica(f.id)} onAnnulla={() => setInModifica(null)} salvaEtichetta="Salva" bloccaIdentita={f.dalGestionale} pending={pending} />
              ) : (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">{f.codice ?? '—'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn('text-sm font-semibold', f.stato === 'chiuso' && 'text-muted-foreground line-through')}>{f.nome}</span>
                      {f.stato === 'chiuso' ? <span className="rounded border border-border px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Chiusa</span> : null}
                      {f.dalGestionale ? <span className="rounded border border-sky-200 bg-sky-50 px-1.5 text-[10px] uppercase tracking-wide text-sky-700">dal gestionale</span> : null}
                    </div>
                    {f.descrizione ? <p className="truncate text-xs text-muted-foreground">{f.descrizione}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="outline" className="h-8 px-2" aria-label={`Modifica ${f.nome}`} disabled={pending} onClick={() => { setInModifica(f.id); setNuova(null); setBozza({ nome: f.nome, descrizione: f.descrizione ?? '', codice: f.codice ?? '' }); }}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    {f.stato === 'attivo' ? (
                      <Button size="sm" variant="outline" className="h-8 px-2" aria-label={`Chiudi ${f.nome}`} disabled={pending} onClick={() => chiudi(f)}>
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 px-2" aria-label={`Riapri ${f.nome}`} disabled={pending} onClick={() => riapri(f)}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {nuova ? (
        <ModuloFase valore={nuova} onChange={setNuova} onSalva={salvaNuova} onAnnulla={() => setNuova(null)} salvaEtichetta="Aggiungi" bloccaIdentita={false} pending={pending} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => { setNuova(VUOTA); setInModifica(null); setErrore(null); }}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Aggiungi sottocantiere
          </Button>
          {chiuse.length > 0 ? (
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setMostraChiuse((v) => !v)}>
              {mostraChiuse ? 'Nascondi le chiuse' : `${chiuse.length} ${chiuse.length === 1 ? 'chiusa' : 'chiuse'}`}
              {mostraChiuse ? <X className="ml-1 inline h-3 w-3" aria-hidden="true" /> : null}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
