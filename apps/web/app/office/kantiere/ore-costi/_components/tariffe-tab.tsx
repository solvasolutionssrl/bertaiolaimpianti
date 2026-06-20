'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { DipendenteView } from '../page';
import { aggiornaCostoOrarioDipendente } from '@/app/office/_actions/kantiere-regole';

interface Props {
  dipendenti: DipendenteView[];
}

export function TariffeTab({ dipendenti }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Costo orario base di ciascun dipendente (€/ora). Vuoto = non impostato: i costi non
        verranno calcolati per quel dipendente.
      </p>
      {dipendenti.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun dipendente.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Dipendente</th>
                <th className="px-4 py-2 text-left font-medium">Stato</th>
                <th className="px-4 py-2 text-right font-medium">Costo orario (€)</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dipendenti.map((d) => (
                <TariffaRow key={d.id} dipendente={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TariffaRow({ dipendente }: { dipendente: DipendenteView }) {
  const router = useRouter();
  const iniziale = dipendente.costo_orario == null ? '' : String(dipendente.costo_orario);
  const [val, setVal] = React.useState(iniziale);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const dirty = val.trim() !== iniziale;

  async function salva() {
    setBusy(true);
    setErr(null);
    const trimmed = val.trim();
    const costo = trimmed === '' ? null : Number(trimmed.replace(',', '.'));
    if (costo != null && (!Number.isFinite(costo) || costo < 0)) {
      setErr('Valore non valido');
      setBusy(false);
      return;
    }
    try {
      const res = await aggiornaCostoOrarioDipendente({ dipendenteId: dipendente.id, costo });
      if (!res.ok) setErr(res.error);
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-2 font-medium">{`${dipendente.nome} ${dipendente.cognome}`.trim()}</td>
      <td className="px-4 py-2 text-muted-foreground">{dipendente.stato_attivo ? 'Attivo' : 'Disattivo'}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0,00"
          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
        />
        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </td>
      <td className="px-4 py-2 text-right">
        {dirty && (
          <button
            disabled={busy}
            onClick={salva}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Salva
          </button>
        )}
      </td>
    </tr>
  );
}
