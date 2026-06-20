'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { MezzoView } from '../page';
import { creaMezzo, aggiornaMezzo, eliminaMezzo } from '@/app/office/_actions/kantiere-mezzi';

interface Props {
  mezzi: MezzoView[];
}

// ── Form aggiungi mezzo ────────────────────────────────────────────────────

function AggiiungiMezzoForm() {
  const router = useRouter();
  const [targa, setTarga] = React.useState('');
  const [modello, setModello] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targa.trim()) { setErr('La targa e\' obbligatoria'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await creaMezzo({
        targa: targa.trim(),
        modello: modello.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      setTarga('');
      setModello('');
      setNote('');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">Aggiungi mezzo</h2>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Targa *</label>
          <input
            type="text"
            value={targa}
            onChange={(e) => setTarga(e.target.value)}
            placeholder="AB123CD"
            maxLength={20}
            className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm uppercase placeholder:normal-case"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Modello</label>
          <input
            type="text"
            value={modello}
            onChange={(e) => setModello(e.target.value)}
            placeholder="es. Fiat Ducato"
            maxLength={120}
            className="w-48 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Note</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Facoltativo"
            maxLength={500}
            className="w-56 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? 'Salvataggio...' : 'Aggiungi'}
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </form>
  );
}

// ── Riga mezzo ────────────────────────────────────────────────────────────

function MezzoRow({ mezzo }: { mezzo: MezzoView }) {
  const router = useRouter();
  const [targa, setTarga] = React.useState(mezzo.targa);
  const [modello, setModello] = React.useState(mezzo.modello ?? '');
  const [attivo, setAttivo] = React.useState(mezzo.attivo);
  const [note, setNote] = React.useState(mezzo.note ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty =
    targa.trim().toUpperCase() !== mezzo.targa ||
    (modello.trim() || null) !== mezzo.modello ||
    attivo !== mezzo.attivo ||
    (note.trim() || null) !== mezzo.note;

  async function salva() {
    if (!targa.trim()) { setErr('La targa e\' obbligatoria'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await aggiornaMezzo({
        id: mezzo.id,
        targa: targa.trim(),
        modello: modello.trim() || undefined,
        attivo,
        note: note.trim() || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function elimina() {
    setBusy(true);
    setErr(null);
    try {
      const res = await eliminaMezzo({ id: mezzo.id });
      if (!res.ok) { setErr(res.error); setConfirmDelete(false); return; }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <tr className="hover:bg-muted/30">
      {/* Targa */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={targa}
          onChange={(e) => setTarga(e.target.value)}
          maxLength={20}
          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm uppercase font-mono"
        />
      </td>
      {/* Modello */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={modello}
          onChange={(e) => setModello(e.target.value)}
          placeholder="n.d."
          maxLength={120}
          className="w-44 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
      </td>
      {/* Stato (toggle) */}
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => setAttivo((v) => !v)}
          className={[
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            attivo
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground',
          ].join(' ')}
        >
          {attivo ? 'Attivo' : 'Disattivo'}
        </button>
      </td>
      {/* Note */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="n.d."
          maxLength={500}
          className="w-56 rounded-md border border-input bg-background px-2 py-1 text-sm"
        />
        {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </td>
      {/* Azioni */}
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <button
              disabled={busy}
              onClick={salva}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Salva
            </button>
          )}
          {confirmDelete ? (
            <>
              <button
                disabled={busy}
                onClick={elimina}
                className="rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Conferma
              </button>
              <button
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Annulla
              </button>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-destructive hover:bg-muted disabled:opacity-50"
            >
              Elimina
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── MezziClient (root) ────────────────────────────────────────────────────

export function MezziClient({ mezzi }: Props) {
  return (
    <div className="space-y-6">
      <AggiiungiMezzoForm />

      {mezzi.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun mezzo. Aggiungine uno.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Targa</th>
                <th className="px-4 py-2 text-left font-medium">Modello</th>
                <th className="px-4 py-2 text-left font-medium">Stato</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mezzi.map((m) => (
                <MezzoRow key={m.id} mezzo={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
