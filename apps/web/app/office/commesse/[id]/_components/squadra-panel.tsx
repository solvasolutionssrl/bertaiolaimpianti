'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, X, Loader2, ChevronDown, ChevronRight, Crown } from 'lucide-react';
import { Button } from '@kommessa/ui';

import type { MembroSquadra } from '../../../_actions/commessa-squadre';
import {
  assegnaDipendenteSquadra,
  aggiornaRuoloSquadra,
  rimuoviDaSquadra,
} from '../../../_actions/commessa-squadre';

export interface DipendenteDisponibile {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
}

interface Props {
  commessaId: string;
  /** Squadra attuale (precaricata server-side). */
  squadra: MembroSquadra[];
  /** Dipendenti attivi del tenant per il picker. */
  dipendentiDisponibili: DipendenteDisponibile[];
  /** Solo admin/office possono modificare. */
  canManage: boolean;
}

type PendingKey = string; // `${dipendenteId}:action`

/**
 * Pannello sidebar "Squadra" per una commessa.
 *
 * Mostra i capi con i loro membri annidati sotto. I dipendenti senza capo
 * vengono raggruppati in una sezione "Senza capo". Gated: visibile solo
 * se il tenant ha il modulo kantiere attivo (il parent lo controlla).
 */
export function SquadraPanel({
  commessaId,
  squadra,
  dipendentiDisponibili,
  canManage,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<PendingKey | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // Stato form picker
  const [pickDipId, setPickDipId] = React.useState('');
  const [pickRuolo, setPickRuolo] = React.useState<'capo' | 'membro'>('membro');
  const [pickCapoId, setPickCapoId] = React.useState('');

  const assignedIds = React.useMemo(
    () => new Set(squadra.map((m) => m.dipendente_id)),
    [squadra],
  );

  // Capi presenti (per poter scegliere il capo nel picker)
  const capi = React.useMemo(
    () => squadra.filter((m) => m.ruolo_commessa === 'capo'),
    [squadra],
  );

  // Raggruppa: capo → suoi membri; poi senza-capo
  const { capiConMembri, senzaCapo } = React.useMemo(() => {
    const membraMap = new Map<string, MembroSquadra[]>();
    const orphans: MembroSquadra[] = [];

    for (const m of squadra) {
      if (m.ruolo_commessa === 'membro') {
        if (m.capo_dipendente_id) {
          const arr = membraMap.get(m.capo_dipendente_id) ?? [];
          arr.push(m);
          membraMap.set(m.capo_dipendente_id, arr);
        } else {
          orphans.push(m);
        }
      }
    }

    const capiConMembri = capi.map((capo) => ({
      capo,
      membri: membraMap.get(capo.dipendente_id) ?? [],
    }));

    return { capiConMembri, senzaCapo: orphans };
  }, [squadra, capi]);

  const nomeDipendente = (m: MembroSquadra) =>
    `${m.cognome} ${m.nome}${m.mansione ? ` · ${m.mansione}` : ''}`;

  const nomeDisponibile = (d: DipendenteDisponibile) =>
    `${d.cognome} ${d.nome}${d.mansione ? ` · ${d.mansione}` : ''}`;

  // ── Azioni ──

  const onRemove = async (dipendenteId: string, nome: string) => {
    const key: PendingKey = `${dipendenteId}:remove`;
    setPending(key);
    setError(null);
    const r = await rimuoviDaSquadra({ commessaId, dipendenteId });
    setPending(null);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  };

  const onChangeRuolo = async (
    dipendenteId: string,
    nuovoRuolo: 'capo' | 'membro',
    capo_dipendente_id: string | null,
  ) => {
    const key: PendingKey = `${dipendenteId}:ruolo`;
    setPending(key);
    setError(null);
    const r = await aggiornaRuoloSquadra({
      commessaId,
      dipendenteId,
      ruolo_commessa: nuovoRuolo,
      capo_dipendente_id,
    });
    setPending(null);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  };

  const onAggiungi = async () => {
    if (!pickDipId) { setError('Seleziona un dipendente'); return; }
    const key: PendingKey = `${pickDipId}:add`;
    setPending(key);
    setError(null);
    const r = await assegnaDipendenteSquadra({
      commessaId,
      dipendenteId: pickDipId,
      ruolo_commessa: pickRuolo,
      capo_dipendente_id: pickRuolo === 'membro' && pickCapoId ? pickCapoId : null,
    });
    setPending(null);
    if (!r.ok) { setError(r.error); return; }
    // Reset form
    setPickDipId('');
    setPickRuolo('membro');
    setPickCapoId('');
    setPickerOpen(false);
    router.refresh();
  };

  const isAdding = pending?.endsWith(':add') ?? false;

  // ── Render ──

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight">Squadra</h3>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {squadra.length}
          </span>
        </div>
        {canManage && (
          <Button
            type="button"
            size="sm"
            variant={pickerOpen ? 'default' : 'outline'}
            onClick={() => { setPickerOpen((v) => !v); setError(null); }}
          >
            <Plus className="h-3.5 w-3.5" />
            {pickerOpen ? 'Chiudi' : 'Aggiungi'}
          </Button>
        )}
      </div>

      {/* Lista squadra */}
      {squadra.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Nessun dipendente assegnato a questa commessa.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Capi con loro membri */}
          {capiConMembri.map(({ capo, membri }) => (
            <div key={capo.dipendente_id} className="rounded-md border border-orange-200/60 bg-orange-50/40 dark:border-orange-900/30 dark:bg-orange-950/20">
              {/* Riga capo */}
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Crown className="h-3 w-3 shrink-0 text-orange-500" aria-hidden="true" />
                <span className="flex-1 truncate text-xs font-semibold text-foreground">
                  {nomeDipendente(capo)}
                </span>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Degrada a membro */}
                    <button
                      type="button"
                      title="Rendi membro"
                      disabled={pending === `${capo.dipendente_id}:ruolo`}
                      onClick={() => onChangeRuolo(capo.dipendente_id, 'membro', null)}
                      className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {pending === `${capo.dipendente_id}:ruolo` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      title="Rimuovi dalla squadra"
                      disabled={pending === `${capo.dipendente_id}:remove`}
                      onClick={() => onRemove(capo.dipendente_id, nomeDipendente(capo))}
                      className="rounded p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {pending === `${capo.dipendente_id}:remove` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}
              </div>
              {/* Membri di questo capo */}
              {membri.length > 0 && (
                <ul className="border-t border-orange-200/40 dark:border-orange-900/20">
                  {membri.map((m) => (
                    <MemberRow
                      key={m.dipendente_id}
                      membro={m}
                      nomeDipendente={nomeDipendente}
                      canManage={canManage}
                      pending={pending}
                      onRemove={onRemove}
                      onPromote={() => onChangeRuolo(m.dipendente_id, 'capo', null)}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* Senza capo */}
          {senzaCapo.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30">
              <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Senza capo
              </p>
              <ul className="border-t border-border">
                {senzaCapo.map((m) => (
                  <MemberRow
                    key={m.dipendente_id}
                    membro={m}
                    nomeDipendente={nomeDipendente}
                    canManage={canManage}
                    pending={pending}
                    onRemove={onRemove}
                    onPromote={() => onChangeRuolo(m.dipendente_id, 'capo', null)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Picker aggiungi */}
      {canManage && pickerOpen && (
        <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <p className="text-xs font-medium text-foreground">Aggiungi dipendente</p>

          {/* Selezione dipendente */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Dipendente
            </label>
            <select
              value={pickDipId}
              onChange={(e) => setPickDipId(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— Scegli —</option>
              {dipendentiDisponibili
                .filter((d) => !assignedIds.has(d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {nomeDisponibile(d)}
                  </option>
                ))}
            </select>
          </div>

          {/* Ruolo */}
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Ruolo
            </label>
            <div className="flex gap-2">
              {(['membro', 'capo'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setPickRuolo(r)}
                  className={
                    'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ' +
                    (pickRuolo === r
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40')
                  }
                >
                  {r === 'capo' ? 'Capo squadra' : 'Membro'}
                </button>
              ))}
            </div>
          </div>

          {/* Capo (solo se membro) */}
          {pickRuolo === 'membro' && capi.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Capo squadra (opzionale)
              </label>
              <select
                value={pickCapoId}
                onChange={(e) => setPickCapoId(e.target.value)}
                className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— Nessun capo —</option>
                {capi.map((c) => (
                  <option key={c.dipendente_id} value={c.dipendente_id}>
                    {`${c.cognome} ${c.nome}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!pickDipId || isAdding}
            onClick={onAggiungi}
          >
            {isAdding ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Aggiungi alla squadra
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

function MemberRow({
  membro,
  nomeDipendente,
  canManage,
  pending,
  onRemove,
  onPromote,
}: {
  membro: MembroSquadra;
  nomeDipendente: (m: MembroSquadra) => string;
  canManage: boolean;
  pending: PendingKey | null;
  onRemove: (id: string, nome: string) => void;
  onPromote: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-2.5 py-1.5">
      <span className="ml-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
      <span className="flex-1 truncate text-xs text-foreground">
        {nomeDipendente(membro)}
      </span>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          {/* Promuovi a capo */}
          <button
            type="button"
            title="Promuovi a capo squadra"
            disabled={pending === `${membro.dipendente_id}:ruolo`}
            onClick={onPromote}
            className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {pending === `${membro.dipendente_id}:ruolo` ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            title="Rimuovi dalla squadra"
            disabled={pending === `${membro.dipendente_id}:remove`}
            onClick={() => onRemove(membro.dipendente_id, nomeDipendente(membro))}
            className="rounded p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {pending === `${membro.dipendente_id}:remove` ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        </div>
      )}
    </li>
  );
}
