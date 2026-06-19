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

function tipoLabel(t: RegolaView['tipo']): string {
  return TIPI.find((x) => x.value === t)?.label ?? t;
}

interface Props {
  regole: RegolaView[];
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
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

  // ── Form nuova regola ──
  const [nuovo, setNuovo] = React.useState<{ nome: string; tipo: RegolaView['tipo']; pct: string; priorita: string }>(
    { nome: '', tipo: 'maggiorazione_straordinario', pct: '25', priorita: '100' },
  );

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!nuovo.nome.trim()) {
      setErr('Inserisci un nome per la regola');
      return;
    }
    await run(() =>
      creaRegola({
        nome: nuovo.nome.trim(),
        tipo: nuovo.tipo,
        maggiorazione_pct: Number(nuovo.pct) || 0,
        priorita: Number(nuovo.priorita) || 100,
      }),
    );
    setNuovo({ nome: '', tipo: 'maggiorazione_straordinario', pct: '25', priorita: '100' });
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
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
      >
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
          <label className="text-xs text-muted-foreground">Priorità</label>
          <input
            type="number"
            value={nuovo.priorita}
            onChange={(e) => setNuovo({ ...nuovo, priorita: e.target.value })}
            className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Aggiungi regola
        </button>
      </form>

      {/* Tabella regole */}
      {regole.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna regola configurata.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Nome</th>
                <th className="px-4 py-2 text-left font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Magg. %</th>
                <th className="px-4 py-2 text-right font-medium">Priorità</th>
                <th className="px-4 py-2 text-left font-medium">Ambito</th>
                <th className="px-4 py-2 text-center font-medium">Attiva</th>
                <th className="px-4 py-2 text-right font-medium">Azioni</th>
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
                  onSavePct={(pct, priorita) =>
                    run(() => aggiornaRegola({ id: r.id, maggiorazione_pct: pct, priorita }))
                  }
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

// ── Riga regola (con edit inline di pct/priorità) ──
function RegolaRow({
  regola,
  busy,
  dipendenti,
  cantieri,
  onToggle,
  onSavePct,
  onDelete,
  onScope,
}: {
  regola: RegolaView;
  busy: boolean;
  dipendenti: DipendenteView[];
  cantieri: CantiereView[];
  onToggle: (attiva: boolean) => void;
  onSavePct: (pct: number, priorita: number) => void;
  onDelete: () => void;
  onScope: () => void;
}) {
  const [pct, setPct] = React.useState(String(regola.maggiorazione_pct));
  const [priorita, setPriorita] = React.useState(String(regola.priorita));
  const dirty = pct !== String(regola.maggiorazione_pct) || priorita !== String(regola.priorita);

  const dipNome = new Map(dipendenti.map((d) => [d.id, `${d.nome} ${d.cognome}`.trim()]));
  const cantNome = new Map(cantieri.map((c) => [c.id, c.nome || c.codice || c.id]));

  const chips = regola.ambiti.length === 0
    ? [{ key: 'tutti', label: 'Tutti' }]
    : regola.ambiti.map((a) => {
        if (a.tipo_target === 'tenant') return { key: a.id, label: 'Tutti' };
        if (a.tipo_target === 'dipendente')
          return { key: a.id, label: dipNome.get(a.target_id ?? '') ?? 'Dipendente' };
        return { key: a.id, label: cantNome.get(a.target_id ?? '') ?? 'Cantiere' };
      });

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-2 font-medium">{regola.nome}</td>
      <td className="px-4 py-2 text-muted-foreground">{tipoLabel(regola.tipo)}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="0.5"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          value={priorita}
          onChange={(e) => setPriorita(e.target.value)}
          className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {c.label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={regola.attiva}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-[hsl(var(--primary))]"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <button
              disabled={busy}
              onClick={() => onSavePct(Number(pct) || 0, Number(priorita) || 100)}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Salva
            </button>
          )}
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
