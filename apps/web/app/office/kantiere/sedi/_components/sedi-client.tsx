'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import type { SedeRow } from '../page';
import {
  creaSede,
  aggiornaSede,
  eliminaSede,
  impostaSedeDefault,
} from '@/app/office/_actions/kantiere-sedi';

// ── Tipi ──────────────────────────────────────────────────────────────────────

type TipoSede = SedeRow['tipo'];

const TIPO_LABEL: Record<TipoSede, string> = {
  sede_principale: 'Sede principale',
  sede_secondaria: 'Sede secondaria',
  hotel: 'Hotel',
  altro: 'Altro',
};

const TIPO_OPTIONS: { value: TipoSede; label: string }[] = [
  { value: 'sede_principale', label: 'Sede principale' },
  { value: 'sede_secondaria', label: 'Sede secondaria' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'altro', label: 'Altro' },
];

const TIPO_BADGE_CLASS: Record<TipoSede, string> = {
  sede_principale: 'bg-blue-100 text-blue-800',
  sede_secondaria: 'bg-slate-100 text-slate-700',
  hotel: 'bg-amber-100 text-amber-800',
  altro: 'bg-muted text-muted-foreground',
};

// ── Stato form (nuovo) ────────────────────────────────────────────────────────

interface FormState {
  nome: string;
  tipo: TipoSede;
  indirizzo: string;
  lat: number | null;
  lng: number | null;
  note: string;
}

const FORM_VUOTO: FormState = {
  nome: '',
  tipo: 'sede_secondaria',
  indirizzo: '',
  lat: null,
  lng: null,
  note: '',
};

// ── Componente principale ─────────────────────────────────────────────────────

interface Props {
  sedi: SedeRow[];
}

export function SediClient({ sedi }: Props) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(FORM_VUOTO);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [eliminaId, setEliminaId] = React.useState<string | null>(null);

  function aggiornaCampo<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleCrea(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await creaSede({
        nome: form.nome,
        tipo: form.tipo,
        indirizzo: form.indirizzo || undefined,
        lat: form.lat ?? undefined,
        lng: form.lng ?? undefined,
        note: form.note || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      setForm(FORM_VUOTO);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAttivo(sede: SedeRow) {
    const res = await aggiornaSede({
      id: sede.id,
      nome: sede.nome,
      tipo: sede.tipo,
      indirizzo: sede.indirizzo ?? undefined,
      lat: sede.lat ?? undefined,
      lng: sede.lng ?? undefined,
      attivo: !sede.attivo,
      note: sede.note ?? undefined,
    });
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  async function handleImpostaDefault(id: string) {
    const res = await impostaSedeDefault({ id });
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  async function handleElimina(id: string) {
    const res = await eliminaSede({ id });
    if (!res.ok) alert(res.error);
    else { setEliminaId(null); router.refresh(); }
  }

  return (
    <div className="space-y-6">
      {/* Form aggiunta */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold">Aggiungi sede</h2>
        <form onSubmit={handleCrea} className="grid gap-3 sm:grid-cols-2">
          {/* Nome */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-nome">
              Nome *
            </label>
            <input
              id="new-nome"
              type="text"
              required
              value={form.nome}
              onChange={(e) => aggiornaCampo('nome', e.target.value)}
              placeholder="es. Sede di Venezia"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-tipo">
              Tipo *
            </label>
            <select
              id="new-tipo"
              value={form.tipo}
              onChange={(e) => aggiornaCampo('tipo', e.target.value as TipoSede)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Indirizzo (col 1) + autocomplete */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-indirizzo">
              Indirizzo
            </label>
            <AddressAutocomplete
              id="new-indirizzo"
              value={form.indirizzo}
              onChange={(v) => aggiornaCampo('indirizzo', v)}
              onSelect={(r) => {
                aggiornaCampo('indirizzo', r.label);
                setForm((prev) => ({ ...prev, lat: r.lat, lng: r.lng }));
              }}
              placeholder="Cerca indirizzo..."
            />
            {(form.lat != null && form.lng != null) && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                Geolocalizzato ({form.lat.toFixed(5)}, {form.lng.toFixed(5)})
              </p>
            )}
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="new-note">
              Note
            </label>
            <textarea
              id="new-note"
              rows={2}
              value={form.note}
              onChange={(e) => aggiornaCampo('note', e.target.value)}
              placeholder="Informazioni aggiuntive..."
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none"
            />
          </div>

          {/* Footer form */}
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'Salvataggio...' : 'Aggiungi sede'}
            </button>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        </form>
      </section>

      {/* Lista sedi */}
      <section>
        {sedi.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna sede configurata.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Nome</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium">Indirizzo</th>
                  <th className="px-4 py-2 text-left font-medium">Stato</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sedi.map((sede) =>
                  editId === sede.id ? (
                    <SedeEditRow
                      key={sede.id}
                      sede={sede}
                      onSaved={() => { setEditId(null); router.refresh(); }}
                      onCancel={() => setEditId(null)}
                    />
                  ) : (
                    <tr key={sede.id} className={`hover:bg-muted/30 ${!sede.attivo ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-medium">
                        <span>{sede.nome}</span>
                        {sede.is_default && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Default
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE_CLASS[sede.tipo]}`}>
                          {TIPO_LABEL[sede.tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {sede.indirizzo ? (
                          <span className="flex items-center gap-1">
                            {(sede.lat != null && sede.lng != null) && (
                              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            {sede.indirizzo}
                            {(sede.lat != null && sede.lng != null) && (
                              <span className="text-xs text-muted-foreground/60">
                                ({sede.lat.toFixed(4)}, {sede.lng.toFixed(4)})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">n.d.</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleToggleAttivo(sede)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            sede.attivo
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          title={sede.attivo ? 'Clicca per disattivare' : 'Clicca per attivare'}
                        >
                          {sede.attivo ? 'Attiva' : 'Inattiva'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {!sede.is_default && (
                            <button
                              onClick={() => handleImpostaDefault(sede.id)}
                              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Imposta default
                            </button>
                          )}
                          <button
                            onClick={() => setEditId(sede.id)}
                            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Modifica
                          </button>
                          {eliminaId === sede.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                onClick={() => handleElimina(sede.id)}
                                className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                              >
                                Conferma
                              </button>
                              <button
                                onClick={() => setEliminaId(null)}
                                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                              >
                                Annulla
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setEliminaId(sede.id)}
                              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              Elimina
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── SedeEditRow: modifica inline ───────────────────────────────────────────────

interface EditRowProps {
  sede: SedeRow;
  onSaved: () => void;
  onCancel: () => void;
}

function SedeEditRow({ sede, onSaved, onCancel }: EditRowProps) {
  const [form, setForm] = React.useState<FormState>({
    nome: sede.nome,
    tipo: sede.tipo,
    indirizzo: sede.indirizzo ?? '',
    lat: sede.lat,
    lng: sede.lng,
    note: sede.note ?? '',
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function aggiornaCampo<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function salva() {
    setBusy(true);
    setErr(null);
    try {
      const res = await aggiornaSede({
        id: sede.id,
        nome: form.nome,
        tipo: form.tipo,
        indirizzo: form.indirizzo || undefined,
        lat: form.lat ?? undefined,
        lng: form.lng ?? undefined,
        attivo: sede.attivo,
        note: form.note || undefined,
      });
      if (!res.ok) { setErr(res.error); return; }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-4 py-2" colSpan={5}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Nome *</label>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => aggiornaCampo('nome', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
            <select
              value={form.tipo}
              onChange={(e) => aggiornaCampo('tipo', e.target.value as TipoSede)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Indirizzo</label>
            <AddressAutocomplete
              value={form.indirizzo}
              onChange={(v) => aggiornaCampo('indirizzo', v)}
              onSelect={(r) => {
                aggiornaCampo('indirizzo', r.label);
                setForm((prev) => ({ ...prev, lat: r.lat, lng: r.lng }));
              }}
              placeholder="Cerca indirizzo..."
            />
            {(form.lat != null && form.lng != null) && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                Geolocalizzato ({form.lat.toFixed(5)}, {form.lng.toFixed(5)})
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => aggiornaCampo('note', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              onClick={salva}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'Salvataggio...' : 'Salva'}
            </button>
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Annulla
            </button>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        </div>
      </td>
    </tr>
  );
}
