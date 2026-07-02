'use client';

import * as React from 'react';
import {
  Briefcase,
  FolderLock,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
  WifiOff,
  Wrench,
} from 'lucide-react';

import { Button, Input, Label, cn } from '@kommessa/ui';
import {
  AggiungiTipologieDialog,
  type TipologiaVoce,
  type TipologiaPreset,
} from '../aggiungi-tipologie-dialog';
import {
  STATI_COMMESSA,
  STATO_LABEL,
  type CommessaEditorValue,
  type ReferenteValue,
  type ResponsabileOption,
} from './types';

export type SetValue = (patch: Partial<CommessaEditorValue>) => void;

/** Avviso che il nome cartella resta congelato per sempre. */
export function FrozenFolderNotice({ nomeCartella }: { nomeCartella: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5">
      <FolderLock
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          Nome cartella (non modificabile)
        </p>
        <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
          {nomeCartella}
        </code>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Il nome della cartella resta invariato per sempre: rinominarlo
          romperebbe i file già su Nextcloud. Puoi modificare tutto il resto.
        </p>
      </div>
    </div>
  );
}

/** Banner offline: la modifica richiede connessione (AI + cartelle). */
export function OfflineNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span>
        Sei offline. Il salvataggio e il match AI non sono disponibili: esci e
        riprova quando torni online.
      </span>
    </div>
  );
}

export function DatiCommessaFields({
  value,
  onChange,
  responsabili,
  online = true,
  voiceSlot,
}: {
  value: CommessaEditorValue;
  onChange: SetValue;
  responsabili: ResponsabileOption[];
  online?: boolean;
  voiceSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {!online ? <OfflineNotice /> : null}
      {voiceSlot}

      <div className="space-y-1.5">
        <Label htmlFor="ed-descr">Descrizione (titolo mostrato)</Label>
        <Input
          id="ed-descr"
          value={value.descrizioneFinale}
          maxLength={120}
          onChange={(e) => onChange({ descrizioneFinale: e.target.value })}
          placeholder="Es. Sistemazione bagno piano terra"
          className="h-11 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ed-indirizzo">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Indirizzo cantiere
          </span>
        </Label>
        <Input
          id="ed-indirizzo"
          value={value.indirizzoCantiere}
          maxLength={200}
          onChange={(e) => onChange({ indirizzoCantiere: e.target.value })}
          placeholder="Via, numero, città"
          className="h-11 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ed-note">Note / dettagli del lavoro</Label>
        <textarea
          id="ed-note"
          value={value.noteIniziali}
          rows={5}
          onChange={(e) => onChange({ noteIniziali: e.target.value })}
          placeholder="Contesto del lavoro, visibile ai tecnici in cantiere"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-base"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ed-stato">Stato</Label>
          <select
            id="ed-stato"
            value={value.stato}
            onChange={(e) =>
              onChange({ stato: e.target.value as CommessaEditorValue['stato'] })
            }
            className="block h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm"
          >
            {STATI_COMMESSA.map((s) => (
              <option key={s} value={s}>
                {STATO_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ed-resp">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Responsabile
            </span>
          </Label>
          <select
            id="ed-resp"
            value={value.responsabileId ?? ''}
            onChange={(e) =>
              onChange({ responsabileId: e.target.value || null })
            }
            className="block h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="">Nessuno</option>
            {responsabili.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name ?? r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.isCritica}
          onChange={(e) => onChange({ isCritica: e.target.checked })}
          className="h-4 w-4 accent-destructive"
        />
        <span className="text-sm font-medium">Commessa critica</span>
        <span className="text-xs text-muted-foreground">
          (evidenziata come prioritaria)
        </span>
      </label>
    </div>
  );
}

export function ReferentiFields({
  value,
  onChange,
}: {
  value: CommessaEditorValue;
  onChange: SetValue;
}) {
  const referenti = value.referenti;

  const update = (idx: number, patch: Partial<ReferenteValue>) => {
    const next = referenti.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onChange({ referenti: next });
  };
  const rimuovi = (idx: number) =>
    onChange({ referenti: referenti.filter((_, i) => i !== idx) });
  const aggiungi = () =>
    onChange({
      referenti: [...referenti, { nome: '', ruolo: '', telefono: '', email: '' }],
    });

  return (
    <div className="space-y-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Referenti di questa commessa
      </p>
      {referenti.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Nessun referente. Aggiungine uno se serve un contatto di cantiere.
        </p>
      ) : (
        <ul className="space-y-2">
          {referenti.map((r, i) => (
            <li
              key={i}
              className="space-y-2 rounded-md border border-border bg-card p-2.5"
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={r.nome}
                  onChange={(e) => update(i, { nome: e.target.value })}
                  placeholder="Nome"
                  className="h-10 flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => rimuovi(i)}
                  aria-label="Rimuovi referente"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {/* Ruolo / Telefono / Email — ognuno con icona a sinistra così si
                  capisce cos'è anche quando è compilato (senza placeholder). */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={r.ruolo}
                    onChange={(e) => update(i, { ruolo: e.target.value })}
                    placeholder="Ruolo"
                    className="h-10 flex-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={r.telefono}
                    inputMode="tel"
                    onChange={(e) => update(i, { telefono: e.target.value })}
                    placeholder="Telefono"
                    className="h-10 flex-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={r.email}
                    inputMode="email"
                    onChange={(e) => update(i, { email: e.target.value })}
                    placeholder="Email"
                    className="h-10 flex-1 text-sm"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[40px]"
        onClick={aggiungi}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Aggiungi referente
      </Button>
    </div>
  );
}

/**
 * Sezione tipologie nell'editor: mostra le voci presenti (bloccate) e apre
 * AggiungiTipologieDialog per aggiungerne (commit immediato + cartelle).
 */
export function TipologieSection({
  commessaId,
  vociPresenti,
  voci,
  presets,
  variant = 'dialog',
}: {
  commessaId: string;
  vociPresenti: number[];
  voci: TipologiaVoce[];
  presets: TipologiaPreset[];
  variant?: 'dialog' | 'sheet';
}) {
  const byId = React.useMemo(() => new Map(voci.map((v) => [v.id, v])), [voci]);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <Wrench className="h-3 w-3" aria-hidden="true" />
          Tipologie impianto
        </p>
        <AggiungiTipologieDialog
          commessaId={commessaId}
          vociPresenti={vociPresenti}
          voci={voci}
          presets={presets}
          variant={variant}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {vociPresenti.length === 0 ? (
          <span className="italic text-muted-foreground">
            Nessuna tipologia. Usa &quot;Aggiungi tipologie&quot;.
          </span>
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
      <p className="text-[11px] text-muted-foreground">
        Le tipologie si aggiungono soltanto. Ogni aggiunta crea le cartelle
        collegate su Nextcloud.
      </p>
    </div>
  );
}

/** Riepilogo read-only per lo step di conferma (wizard mobile). */
export function RiepilogoConferma({
  value,
  responsabili,
}: {
  value: CommessaEditorValue;
  responsabili: ResponsabileOption[];
}) {
  const resp = responsabili.find((r) => r.id === value.responsabileId);
  return (
    <dl className="space-y-2 text-sm">
      <Riga label="Descrizione" value={value.descrizioneFinale || '—'} />
      <Riga label="Indirizzo cantiere" value={value.indirizzoCantiere || '—'} />
      <Riga label="Stato" value={STATO_LABEL[value.stato]} />
      <Riga label="Responsabile" value={resp?.display_name ?? 'Nessuno'} />
      <Riga label="Critica" value={value.isCritica ? 'Sì' : 'No'} />
      <Riga
        label="Referenti"
        value={
          value.referenti.filter((r) => r.nome.trim()).length > 0
            ? value.referenti
                .filter((r) => r.nome.trim())
                .map((r) => r.nome.trim())
                .join(', ')
            : '—'
        }
      />
      {value.noteIniziali.trim() ? (
        <div className="space-y-0.5 pt-1">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Note
          </dt>
          <dd className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
            {value.noteIniziali}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Riga({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('grid grid-cols-3 items-start gap-2')}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="col-span-2 min-w-0 break-words font-medium text-foreground/90">
        {value}
      </dd>
    </div>
  );
}
