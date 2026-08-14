'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, Star } from 'lucide-react';
import { AddressAutocomplete } from '@/app/_components/address-autocomplete';
import { CantieriCollegatiSelect } from './cantieri-collegati-select';
import type { SedeRow, CantiereLite } from '../page';
import {
  creaSede,
  aggiornaSede,
  eliminaSede,
  impostaSedeDefault,
  associaSedeCantiere,
  dissociaSedeCantiere,
} from '@/app/office/_actions/kantiere-sedi';

// ── Tipi ──────────────────────────────────────────────────────────────────────

type TipoSede = SedeRow['tipo'];

const TIPO_LABEL: Record<TipoSede, string> = {
  sede_principale: 'Sede principale',
  sede_secondaria: 'Sede secondaria',
  hotel: 'Hotel',
  altro: 'Altro',
};

const TIPO_OPTIONS: { value: TipoSede; label: string; hint: string }[] = [
  { value: 'sede_principale', label: 'Sede principale', hint: 'Sede aziendale / quartier generale' },
  { value: 'sede_secondaria', label: 'Sede secondaria', hint: 'Filiale o deposito secondario' },
  { value: 'hotel', label: 'Hotel', hint: 'Alloggio dove i tecnici risiedono in trasferta' },
  { value: 'altro', label: 'Altro', hint: 'Altro punto di partenza/arrivo' },
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
  tipo: 'hotel',
  indirizzo: '',
  lat: null,
  lng: null,
  note: '',
};

const INPUT_CLS =
  'rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

// ── Componente principale ─────────────────────────────────────────────────────

interface Props {
  sedi: SedeRow[];
  cantieri: CantiereLite[];
  /** sede_id → array di cantiere_id collegati. */
  legamiPerSede: Record<string, string[]>;
}

export function SediClient({ sedi, cantieri, legamiPerSede }: Props) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(FORM_VUOTO);
  const [cantieriSel, setCantieriSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [eliminaId, setEliminaId] = React.useState<string | null>(null);
  const [filtroCantiere, setFiltroCantiere] = React.useState<string>('');
  const [showForm, setShowForm] = React.useState(false);

  const nomeCantiere = React.useCallback(
    (id: string) => cantieri.find((c) => c.id === id)?.nome ?? 'Cantiere',
    [cantieri],
  );

  const sediFiltrate = filtroCantiere
    ? sedi.filter((s) => (legamiPerSede[s.id] ?? []).includes(filtroCantiere))
    : sedi;

  function aggiornaCampo<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function toggleCantiereSel(id: string) {
    setCantieriSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // Collega ai cantieri selezionati (best-effort sequenziale).
      for (const cid of cantieriSel) {
        await associaSedeCantiere({ cantiereId: cid, sedeId: res.id });
      }
      setForm(FORM_VUOTO);
      setCantieriSel(new Set());
      setShowForm(false);
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
    else {
      setEliminaId(null);
      router.refresh();
    }
  }

  async function handleToggleLegame(sedeId: string, cantiereId: string, attualmente: boolean) {
    const action = attualmente ? dissociaSedeCantiere : associaSedeCantiere;
    const res = await action({ cantiereId, sedeId });
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Spiegazione */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        Le <strong className="text-foreground">sedi</strong> sono i luoghi da cui partono e a cui
        tornano i tecnici: la sede aziendale, i depositi e gli{' '}
        <strong className="text-foreground">hotel</strong> dove risiedono durante la settimana.
        La sede <strong className="text-foreground">predefinita</strong> è proposta per tutti i
        cantieri; le altre vanno collegate ai cantieri in cui servono. Compaiono nella scelta
        &ldquo;Da dove sei partito?&rdquo; alla timbratura.
      </div>

      {/* Toolbar: filtro per cantiere + nuova sede */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-cantiere" className="text-xs font-medium text-muted-foreground">
            Cantiere
          </label>
          <select
            id="filtro-cantiere"
            value={filtroCantiere}
            onChange={(e) => setFiltroCantiere(e.target.value)}
            className={INPUT_CLS}
            disabled={cantieri.length === 0}
          >
            <option value="">Tutte le sedi</option>
            {cantieri.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {filtroCantiere && (
            <span className="text-xs text-muted-foreground">
              {sediFiltrate.length} {sediFiltrate.length === 1 ? 'sede collegata' : 'sedi collegate'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {showForm ? 'Chiudi' : 'Nuova sede'}
        </button>
      </div>

      {/* Form aggiunta (collassabile) */}
      {showForm && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <form onSubmit={handleCrea} className="grid gap-3 sm:grid-cols-2">
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
                placeholder="es. Hotel Excelsior Monfalcone"
                className={INPUT_CLS}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-tipo">
                Tipo *
              </label>
              <select
                id="new-tipo"
                value={form.tipo}
                onChange={(e) => aggiornaCampo('tipo', e.target.value as TipoSede)}
                className={INPUT_CLS}
              >
                {TIPO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground/80">
                {TIPO_OPTIONS.find((o) => o.value === form.tipo)?.hint}
              </p>
            </div>

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
                placeholder="Cerca indirizzo (necessario per stimare i viaggi)..."
              />
              {form.lat != null && form.lng != null && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  Geolocalizzato ({form.lat.toFixed(5)}, {form.lng.toFixed(5)})
                </p>
              )}
            </div>

            {cantieri.length > 0 && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Collega ai cantieri{' '}
                  <span className="font-normal text-muted-foreground/70">(facoltativo)</span>
                </label>
                <CantieriCollegatiSelect
                  cantieri={cantieri}
                  selectedIds={[...cantieriSel]}
                  onToggle={(id) => toggleCantiereSel(id)}
                />
              </div>
            )}

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
                className={`${INPUT_CLS} resize-none`}
              />
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
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
      )}

      {/* Lista sedi */}
      <section>
        {sediFiltrate.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {filtroCantiere
                ? 'Nessuna sede collegata a questo cantiere.'
                : 'Nessuna sede configurata. Aggiungine una per abilitare il flusso viaggi.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold">Indirizzo</th>
                  <th className="px-3 py-2 text-left font-semibold">Cantieri collegati</th>
                  <th className="px-3 py-2 text-left font-semibold">Stato</th>
                  <th className="px-3 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sediFiltrate.map((sede) =>
                  editId === sede.id ? (
                    <SedeEditRow
                      key={sede.id}
                      sede={sede}
                      cantieri={cantieri}
                      legami={legamiPerSede[sede.id] ?? []}
                      onToggleLegame={handleToggleLegame}
                      onSaved={() => {
                        setEditId(null);
                        router.refresh();
                      }}
                      onCancel={() => setEditId(null)}
                    />
                  ) : (
                    <tr
                      key={sede.id}
                      className={`align-top hover:bg-muted/30 ${!sede.attivo ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {sede.is_default && (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-emerald-500 text-emerald-500" aria-hidden="true" />
                          )}
                          {sede.nome}
                        </span>
                        {sede.is_default && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                            Predefinita
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_BADGE_CLASS[sede.tipo]}`}
                        >
                          {TIPO_LABEL[sede.tipo]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {sede.indirizzo ? (
                          <span className="flex items-center gap-1">
                            {sede.lat != null && sede.lng != null && (
                              <MapPin className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                            )}
                            <span className="line-clamp-1">{sede.indirizzo}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">n.d.</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {sede.is_default ? (
                          <span className="text-xs text-muted-foreground">Tutti i cantieri</span>
                        ) : (legamiPerSede[sede.id] ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(legamiPerSede[sede.id] ?? []).map((cid) => (
                              <span
                                key={cid}
                                className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {nomeCantiere(cid)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">nessuno</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggleAttivo(sede)}
                          className={`inline-flex min-h-[24px] items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            sede.attivo
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                          title={sede.attivo ? 'Clicca per disattivare' : 'Clicca per attivare'}
                        >
                          {sede.attivo ? 'Attiva' : 'Inattiva'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {!sede.is_default && (
                            <button
                              onClick={() => handleImpostaDefault(sede.id)}
                              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Imposta predefinita
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
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── SedeEditRow: modifica inline (campi + legami cantieri) ─────────────────────

interface EditRowProps {
  sede: SedeRow;
  cantieri: CantiereLite[];
  legami: string[];
  onToggleLegame: (sedeId: string, cantiereId: string, attualmente: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}

function SedeEditRow({ sede, cantieri, legami, onToggleLegame, onSaved, onCancel }: EditRowProps) {
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
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-3 py-3" colSpan={6}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Nome *</label>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => aggiornaCampo('nome', e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
            <select
              value={form.tipo}
              onChange={(e) => aggiornaCampo('tipo', e.target.value as TipoSede)}
              className={INPUT_CLS}
            >
              {TIPO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
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
            {form.lat != null && form.lng != null && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                Geolocalizzato ({form.lat.toFixed(5)}, {form.lng.toFixed(5)})
              </p>
            )}
          </div>

          {cantieri.length > 0 && !sede.is_default && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Cantieri collegati{' '}
                <span className="font-normal text-muted-foreground/70">(cerca e clicca per collegare/scollegare)</span>
              </label>
              <CantieriCollegatiSelect
                cantieri={cantieri}
                selectedIds={legami}
                onToggle={(id, on) => onToggleLegame(sede.id, id, on)}
              />
            </div>
          )}
          {sede.is_default && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              È la sede predefinita: viene proposta per tutti i cantieri, non serve collegarla.
            </p>
          )}

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => aggiornaCampo('note', e.target.value)}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
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
              Chiudi
            </button>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        </div>
      </td>
    </tr>
  );
}
