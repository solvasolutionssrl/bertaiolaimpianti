'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { RegolaView, DipendenteView, CantiereView } from '../page';
import {
  creaRegola,
  aggiornaRegola,
  eliminaRegola,
  impostaAmbiti,
} from '@/app/office/_actions/kantiere-regole';

const TIPI: { value: RegolaView['tipo']; label: string }[] = [
  { value: 'soglia_giornaliera', label: 'Soglia giornaliera' },
  { value: 'maggiorazione_straordinario', label: 'Straordinario' },
  { value: 'maggiorazione_viaggio', label: 'Viaggio' },
  { value: 'notturno', label: 'Notturno' },
  { value: 'festivo', label: 'Festivo' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'personalizzata', label: 'Personalizzata' },
];

const GIORNI_LABEL: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Gio',
  5: 'Ven',
  6: 'Sab',
  7: 'Dom',
};
const TUTTI_GIORNI = [1, 2, 3, 4, 5, 6, 7] as const;

function tipoLabel(t: RegolaView['tipo']): string {
  return TIPI.find((x) => x.value === t)?.label ?? t;
}

/** Etichette leggibili delle condizioni di una regola. */
function condizioniChips(r: RegolaView): string[] {
  const out: string[] = [];

  if (r.giorni_settimana && r.giorni_settimana.length > 0) {
    if (r.giorni_settimana.length === 1) {
      out.push(GIORNI_LABEL[r.giorni_settimana[0] as number] ?? String(r.giorni_settimana[0]));
    } else if (r.giorni_settimana.length <= 3) {
      out.push(r.giorni_settimana.map((g) => GIORNI_LABEL[g] ?? g).join(', '));
    } else {
      out.push(`${r.giorni_settimana.length} giorni`);
    }
  }

  if (r.ora_da || r.ora_a) {
    const da = r.ora_da?.slice(0, 5) ?? '?';
    const a = r.ora_a?.slice(0, 5) ?? '?';
    out.push(`Notturno ${da}-${a}`);
  }

  if (r.festivo_match === 'solo_festivo') out.push('Festivo');
  if (r.festivo_match === 'solo_feriale') out.push('Feriale');

  if (r.applica_a === 'ordinario') out.push('Ordinario');
  if (r.applica_a === 'straordinario') {
    const tier = (r.params as { tier?: string } | null)?.tier;
    if (tier === 'prime2') out.push('Straord. prime 2 ore');
    else if (tier === 'successive') out.push('Straord. ore successive');
    else out.push('Straordinario');
  }

  if (r.a_turni === 'si') out.push('A turni: si');
  if (r.a_turni === 'no') out.push('A turni: no');

  out.push(`+${r.maggiorazione_pct}%`);
  return out;
}

interface Props {
  regole: RegolaView[];
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
}

type NuovaState = {
  nome: string;
  tipo: RegolaView['tipo'];
  pct: string;
  priorita: string;
  giorni_settimana: number[];
  ora_da: string;
  ora_a: string;
  festivo_match: 'qualsiasi' | 'solo_festivo' | 'solo_feriale';
  applica_a: 'tutte' | 'ordinario' | 'straordinario';
  a_turni: 'qualsiasi' | 'si' | 'no';
  tier: '' | 'prime2' | 'successive';
};

const NUOVA_VUOTA: NuovaState = {
  nome: '',
  tipo: 'maggiorazione_straordinario',
  pct: '25',
  priorita: '100',
  giorni_settimana: [],
  ora_da: '',
  ora_a: '',
  festivo_match: 'qualsiasi',
  applica_a: 'tutte',
  a_turni: 'qualsiasi',
  tier: '',
};

function toggleGiorno(giorni: number[], g: number): number[] {
  return giorni.includes(g) ? giorni.filter((x) => x !== g) : [...giorni, g];
}

export function RegoleTab({ regole, dipendenti, cantieri }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [scopeRegola, setScopeRegola] = React.useState<RegolaView | null>(null);

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fn();
      if (!res.ok) setErr(res.error ?? 'Errore');
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const [nuovo, setNuovo] = React.useState<NuovaState>(NUOVA_VUOTA);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!nuovo.nome.trim()) {
      setErr('Inserisci un nome per la regola');
      return;
    }
    const params: Record<string, unknown> = nuovo.tier ? { tier: nuovo.tier } : {};
    await run(() =>
      creaRegola({
        nome: nuovo.nome.trim(),
        tipo: nuovo.tipo,
        maggiorazione_pct: Number(nuovo.pct) || 0,
        priorita: Number(nuovo.priorita) || 100,
        giorni_settimana: nuovo.giorni_settimana.length > 0 ? nuovo.giorni_settimana : null,
        ora_da: nuovo.ora_da || null,
        ora_a: nuovo.ora_a || null,
        festivo_match: nuovo.festivo_match,
        applica_a: nuovo.applica_a,
        a_turni: nuovo.a_turni,
        params,
      }),
    );
    setNuovo(NUOVA_VUOTA);
  }

  return (
    <div className="space-y-5">
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* Nuova regola */}
      <form
        onSubmit={aggiungi}
        className="space-y-4 rounded-lg border border-border bg-card p-4"
      >
        <p className="text-sm font-medium">Nuova regola</p>

        {/* Riga 1: nome / tipo / % / priorita */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Nome</label>
            <input
              value={nuovo.nome}
              onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })}
              placeholder="Es. Straordinario serale"
              className="w-56 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tipo</label>
            <select
              value={nuovo.tipo}
              onChange={(e) => setNuovo({ ...nuovo, tipo: e.target.value as RegolaView['tipo'] })}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {TIPI.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Maggiorazione %</label>
            <input
              type="number"
              step="0.5"
              value={nuovo.pct}
              onChange={(e) => setNuovo({ ...nuovo, pct: e.target.value })}
              className="w-28 rounded-md border border-input bg-background px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Priorita</label>
            <input
              type="number"
              value={nuovo.priorita}
              onChange={(e) => setNuovo({ ...nuovo, priorita: e.target.value })}
              className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
        </div>

        {/* Riga 2: condizioni */}
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          {/* Giorni settimana */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Giorni della settimana (vuoto = tutti)</label>
            <div className="flex gap-1">
              {TUTTI_GIORNI.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setNuovo({ ...nuovo, giorni_settimana: toggleGiorno(nuovo.giorni_settimana, g) })}
                  className={
                    'rounded px-2 py-1 text-xs font-medium transition-colors ' +
                    (nuovo.giorni_settimana.includes(g)
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-input bg-background text-muted-foreground hover:bg-muted')
                  }
                >
                  {GIORNI_LABEL[g]}
                </button>
              ))}
            </div>
          </div>

          {/* Fascia oraria */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Fascia oraria (se valorizzata: ore notturne)</label>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={nuovo.ora_da}
                onChange={(e) => setNuovo({ ...nuovo, ora_da: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-muted-foreground">-</span>
              <input
                type="time"
                value={nuovo.ora_a}
                onChange={(e) => setNuovo({ ...nuovo, ora_a: e.target.value })}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Festivo match */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Festivo</label>
            <select
              value={nuovo.festivo_match}
              onChange={(e) =>
                setNuovo({ ...nuovo, festivo_match: e.target.value as NuovaState['festivo_match'] })
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="qualsiasi">Qualsiasi</option>
              <option value="solo_festivo">Solo festivo</option>
              <option value="solo_feriale">Solo feriale</option>
            </select>
          </div>

          {/* Applica a */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Applica a</label>
            <select
              value={nuovo.applica_a}
              onChange={(e) =>
                setNuovo({ ...nuovo, applica_a: e.target.value as NuovaState['applica_a'] })
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="tutte">Tutte le ore</option>
              <option value="ordinario">Solo ordinario</option>
              <option value="straordinario">Solo straordinario</option>
            </select>
          </div>

          {/* A turni */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">A turni</label>
            <select
              value={nuovo.a_turni}
              onChange={(e) =>
                setNuovo({ ...nuovo, a_turni: e.target.value as NuovaState['a_turni'] })
              }
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="qualsiasi">Qualsiasi</option>
              <option value="si">Si</option>
              <option value="no">No</option>
            </select>
          </div>

          {/* Tier straordinario */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tier straordinario</label>
            <select
              value={nuovo.tier}
              onChange={(e) => setNuovo({ ...nuovo, tier: e.target.value as NuovaState['tier'] })}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">Nessuno</option>
              <option value="prime2">Prime 2 ore</option>
              <option value="successive">Ore successive</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Aggiungi regola
          </button>
        </div>
      </form>

      {/* Tabella regole */}
      {regole.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna regola configurata.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nome</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Condizioni</th>
                <th className="px-3 py-2 text-right font-medium">Magg. %</th>
                <th className="px-3 py-2 text-right font-medium">Priorita</th>
                <th className="px-3 py-2 text-left font-medium">Ambito</th>
                <th className="px-3 py-2 text-center font-medium">Attiva</th>
                <th className="px-3 py-2 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {regole.map((r) => (
                <RegolaRow
                  key={r.id}
                  regola={r}
                  busy={busy}
                  dipendenti={dipendenti}
                  cantieri={cantieri}
                  onToggle={(attiva) => run(() => aggiornaRegola({ id: r.id, attiva }))}
                  onSave={(payload) => run(() => aggiornaRegola({ id: r.id, ...payload }))}
                  onDelete={() => run(() => eliminaRegola({ id: r.id }))}
                  onScope={() => setScopeRegola(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scopeRegola && (
        <ScopeDialog
          regola={scopeRegola}
          dipendenti={dipendenti}
          cantieri={cantieri}
          onClose={() => setScopeRegola(null)}
          onSave={async (ambiti) => {
            await run(() => impostaAmbiti({ regolaId: scopeRegola.id, ambiti }));
            setScopeRegola(null);
          }}
        />
      )}
    </div>
  );
}

// ── Riga regola (con edit inline di pct/priorita e condizioni) ──

type SavePayload = {
  maggiorazione_pct?: number;
  priorita?: number;
  giorni_settimana?: number[] | null;
  ora_da?: string | null;
  ora_a?: string | null;
  festivo_match?: 'qualsiasi' | 'solo_festivo' | 'solo_feriale';
  applica_a?: 'tutte' | 'ordinario' | 'straordinario';
  a_turni?: 'qualsiasi' | 'si' | 'no';
  params?: Record<string, unknown>;
};

function RegolaRow({
  regola,
  busy,
  dipendenti,
  cantieri,
  onToggle,
  onSave,
  onDelete,
  onScope,
}: {
  regola: RegolaView;
  busy: boolean;
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
  onToggle: (attiva: boolean) => void;
  onSave: (payload: SavePayload) => void;
  onDelete: () => void;
  onScope: () => void;
}) {
  const [pct, setPct] = React.useState(String(regola.maggiorazione_pct));
  const [priorita, setPriorita] = React.useState(String(regola.priorita));
  const [editing, setEditing] = React.useState(false);

  // Stato form condizioni (per edit inline)
  const currentTier = (regola.params as { tier?: string } | null)?.tier ?? '';
  const [cond, setCond] = React.useState({
    giorni_settimana: regola.giorni_settimana ?? [],
    ora_da: regola.ora_da?.slice(0, 5) ?? '',
    ora_a: regola.ora_a?.slice(0, 5) ?? '',
    festivo_match: regola.festivo_match,
    applica_a: regola.applica_a,
    a_turni: regola.a_turni,
    tier: (currentTier === 'prime2' || currentTier === 'successive' ? currentTier : '') as '' | 'prime2' | 'successive',
  });

  const pctDirty = pct !== String(regola.maggiorazione_pct);
  const prioDirty = priorita !== String(regola.priorita);
  const dirty = pctDirty || prioDirty;

  function salva() {
    const payload: SavePayload = {};
    if (pctDirty) payload.maggiorazione_pct = Number(pct) || 0;
    if (prioDirty) payload.priorita = Number(priorita) || 100;
    onSave(payload);
  }

  function salvaCond() {
    const params: Record<string, unknown> = cond.tier ? { tier: cond.tier } : {};
    onSave({
      giorni_settimana: cond.giorni_settimana.length > 0 ? cond.giorni_settimana : null,
      ora_da: cond.ora_da || null,
      ora_a: cond.ora_a || null,
      festivo_match: cond.festivo_match,
      applica_a: cond.applica_a,
      a_turni: cond.a_turni,
      params,
    });
    setEditing(false);
  }

  const dipNome = new Map(dipendenti.map((d) => [d.id, `${d.nome} ${d.cognome}`.trim()]));
  const cantNome = new Map(cantieri.map((c) => [c.id, c.nome || c.codice || c.id]));

  const ambitoChips =
    regola.ambiti.length === 0
      ? [{ key: 'tutti', label: 'Tutti' }]
      : regola.ambiti.map((a) => {
          if (a.tipo_target === 'tenant') return { key: a.id, label: 'Tutti' };
          if (a.tipo_target === 'dipendente')
            return { key: a.id, label: dipNome.get(a.target_id ?? '') ?? 'Dipendente' };
          return { key: a.id, label: cantNome.get(a.target_id ?? '') ?? 'Cantiere' };
        });

  const condChips = condizioniChips(regola);

  return (
    <>
      <tr className="hover:bg-muted/30">
        <td className="px-3 py-1.5 font-medium">{regola.nome}</td>
        <td className="px-3 py-1.5 text-muted-foreground">{tipoLabel(regola.tipo)}</td>
        <td className="px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {condChips.map((c, i) => (
              <span
                key={i}
                className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-1.5 text-right">
          <input
            type="number"
            step="0.5"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
          />
        </td>
        <td className="px-3 py-1.5 text-right">
          <input
            type="number"
            value={priorita}
            onChange={(e) => setPriorita(e.target.value)}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
          />
        </td>
        <td className="px-3 py-1.5">
          <div className="flex flex-wrap gap-1">
            {ambitoChips.map((c) => (
              <span
                key={c.key}
                className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {c.label}
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-1.5 text-center">
          <input
            type="checkbox"
            checked={regola.attiva}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
        </td>
        <td className="px-3 py-1.5">
          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <button
                disabled={busy}
                onClick={salva}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Salva
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              Condizioni
            </button>
            <button
              disabled={busy}
              onClick={onScope}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              Ambito
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Eliminare la regola "${regola.nome}"?`)) onDelete();
              }}
              className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Elimina
            </button>
          </div>
        </td>
      </tr>

      {/* Pannello condizioni inline */}
      {editing && (
        <tr>
          <td colSpan={8} className="bg-muted/20 px-4 pb-3 pt-2">
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Modifica condizioni: {regola.nome}</p>

              <div className="flex flex-wrap items-end gap-3">
                {/* Giorni */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Giorni (vuoto = tutti)</label>
                  <div className="flex gap-1">
                    {TUTTI_GIORNI.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setCond({
                            ...cond,
                            giorni_settimana: toggleGiorno(cond.giorni_settimana, g),
                          })
                        }
                        className={
                          'rounded px-2 py-1 text-xs font-medium transition-colors ' +
                          (cond.giorni_settimana.includes(g)
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-input bg-background text-muted-foreground hover:bg-muted')
                        }
                      >
                        {GIORNI_LABEL[g]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fascia oraria */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Fascia oraria (notturno)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      value={cond.ora_da}
                      onChange={(e) => setCond({ ...cond, ora_da: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">-</span>
                    <input
                      type="time"
                      value={cond.ora_a}
                      onChange={(e) => setCond({ ...cond, ora_a: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                {/* Festivo */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Festivo</label>
                  <select
                    value={cond.festivo_match}
                    onChange={(e) =>
                      setCond({ ...cond, festivo_match: e.target.value as typeof cond.festivo_match })
                    }
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="qualsiasi">Qualsiasi</option>
                    <option value="solo_festivo">Solo festivo</option>
                    <option value="solo_feriale">Solo feriale</option>
                  </select>
                </div>

                {/* Applica a */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Applica a</label>
                  <select
                    value={cond.applica_a}
                    onChange={(e) =>
                      setCond({ ...cond, applica_a: e.target.value as typeof cond.applica_a })
                    }
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="tutte">Tutte le ore</option>
                    <option value="ordinario">Solo ordinario</option>
                    <option value="straordinario">Solo straordinario</option>
                  </select>
                </div>

                {/* A turni */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">A turni</label>
                  <select
                    value={cond.a_turni}
                    onChange={(e) =>
                      setCond({ ...cond, a_turni: e.target.value as typeof cond.a_turni })
                    }
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="qualsiasi">Qualsiasi</option>
                    <option value="si">Si</option>
                    <option value="no">No</option>
                  </select>
                </div>

                {/* Tier */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Tier straordinario</label>
                  <select
                    value={cond.tier}
                    onChange={(e) => setCond({ ...cond, tier: e.target.value as typeof cond.tier })}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">Nessuno</option>
                    <option value="prime2">Prime 2 ore</option>
                    <option value="successive">Ore successive</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={salvaCond}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Salva condizioni
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
                >
                  Annulla
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Dialog per impostare l'ambito (scope) di una regola ──
type AmbitoInput = { tipo_target: 'tenant' | 'dipendente' | 'cantiere'; target_id: string | null };

function ScopeDialog({
  regola,
  dipendenti,
  cantieri,
  onClose,
  onSave,
}: {
  regola: RegolaView;
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
  onClose: () => void;
  onSave: (ambiti: AmbitoInput[]) => void;
}) {
  const tenantWide = regola.ambiti.length === 0 || regola.ambiti.some((a) => a.tipo_target === 'tenant');
  const [modo, setModo] = React.useState<'tutti' | 'specifico'>(tenantWide ? 'tutti' : 'specifico');
  const [selDip, setSelDip] = React.useState<Set<string>>(
    new Set(regola.ambiti.filter((a) => a.tipo_target === 'dipendente' && a.target_id).map((a) => a.target_id!)),
  );
  const [selCant, setSelCant] = React.useState<Set<string>>(
    new Set(regola.ambiti.filter((a) => a.tipo_target === 'cantiere' && a.target_id).map((a) => a.target_id!)),
  );

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function salva() {
    if (modo === 'tutti') {
      onSave([{ tipo_target: 'tenant', target_id: null }]);
      return;
    }
    const ambiti: AmbitoInput[] = [
      ...[...selDip].map((id) => ({ tipo_target: 'dipendente' as const, target_id: id })),
      ...[...selCant].map((id) => ({ tipo_target: 'cantiere' as const, target_id: id })),
    ];
    onSave(ambiti);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Ambito regola</h2>
          <p className="text-sm text-muted-foreground">{regola.nome}</p>
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={modo === 'tutti'} onChange={() => setModo('tutti')} />
            Tutti (tenant)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={modo === 'specifico'} onChange={() => setModo('specifico')} />
            Dipendenti / cantieri specifici
          </label>
        </div>

        {modo === 'specifico' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Dipendenti</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {dipendenti.length === 0 && <p className="text-xs text-muted-foreground">Nessun dipendente</p>}
                {dipendenti.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selDip.has(d.id)}
                      onChange={() => setSelDip((s) => toggle(s, d.id))}
                    />
                    {`${d.nome} ${d.cognome}`.trim()}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Cantieri</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {cantieri.length === 0 && <p className="text-xs text-muted-foreground">Nessun cantiere</p>}
                {cantieri.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selCant.has(c.id)}
                      onChange={() => setSelCant((s) => toggle(s, c.id))}
                    />
                    {c.nome || c.codice || c.id}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border bg-background px-4 py-1.5 text-sm hover:bg-muted">
            Annulla
          </button>
          <button
            onClick={salva}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Salva ambito
          </button>
        </div>
      </div>
    </div>
  );
}
