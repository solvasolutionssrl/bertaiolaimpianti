'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Loader2,
  CheckCircle2,
  Trash2,
  Calendar,
  Plus,
  Minus,
  ChevronDown,
  Clock,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { calcolaImponibile } from '@kommessa/api/spese';
import { CATEGORIA_META, CATEGORIE_ORDINATE } from '@/app/_components/spese/categoria';
import {
  aggiornaSpesa,
  eliminaSpesa,
  cronologiaSpesa,
  rianalizzaSpesa,
  type VersioneSpesa,
} from '@/app/_actions/kantiere-spese';
import { useSheetOpen } from '@/app/mobile/kantiere/_lib/sheet-flag';
import { Portal } from '@/app/mobile/_components/portal';
import type { SpesaRiga } from './spese-client';

type Metodo = 'contanti' | 'carta' | 'altro';

const METODO_LABEL: Record<Metodo, string> = {
  carta: 'Carta aziendale',
  contanti: 'Contanti',
  altro: 'Altro',
};

const FIELD =
  'w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-2.5 py-2 text-base outline-none focus:border-primary';
const LBL = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
const GROUP = 'space-y-2 rounded-xl border border-border bg-muted/25 p-2.5';
const GROUP_LBL = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80';

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fmtDataInput(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function fmtEuro(n: number | null, valuta: string): string {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta }).format(n);
  } catch {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm text-foreground">{value || '—'}</span>
    </div>
  );
}

export function SpesaDettaglio({
  spesa,
  cantieriNomi,
  canEdit,
  cantieri,
  onClose,
}: {
  spesa: SpesaRiga | null;
  cantieriNomi: Record<string, string>;
  canEdit: boolean;
  cantieri: { id: string; nome: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [rianPending, startRian] = React.useTransition();
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const [fotoGrande, setFotoGrande] = React.useState(false);
  const [confermaElimina, setConfermaElimina] = React.useState(false);
  const [cronoAperta, setCronoAperta] = React.useState(false);
  const [crono, setCrono] = React.useState<VersioneSpesa[] | null>(null);

  // Campi editabili (seed all'apertura).
  const [importoTotale, setImportoTotale] = React.useState('');
  const [importoIva, setImportoIva] = React.useState('');
  const [categoria, setCategoria] = React.useState<CategoriaSpesa>('varie');
  const [ragioneSociale, setRagioneSociale] = React.useState('');
  const [dataLocal, setDataLocal] = React.useState('');
  const [metodo, setMetodo] = React.useState<Metodo>('carta');
  const [numeroPersone, setNumeroPersone] = React.useState(1);
  const [cantiereId, setCantiereId] = React.useState('');
  const [note, setNote] = React.useState('');

  // Nasconde campanella + pill "＋ Spesa" della shell mentre il dettaglio è aperto.
  useSheetOpen(!!spesa);

  React.useEffect(() => {
    if (!spesa) return;
    setErrMsg(null);
    setFotoGrande(false);
    setConfermaElimina(false);
    setCronoAperta(false);
    setCrono(null);
    setImportoTotale(spesa.importoTotale != null ? String(spesa.importoTotale) : '');
    setImportoIva(spesa.importoIva != null ? String(spesa.importoIva) : '');
    setCategoria(spesa.categoria);
    setRagioneSociale(spesa.ragioneSociale ?? '');
    setDataLocal(isoToLocalInput(spesa.dataScontrino));
    setMetodo(spesa.metodoPagamento ?? 'carta');
    setNumeroPersone(spesa.numeroPersone || 1);
    setCantiereId(spesa.cantiereId ?? '');
    setNote(spesa.note ?? '');
  }, [spesa]);

  const valuta = spesa?.valuta || 'EUR';
  const importoNum = Number(importoTotale.replace(',', '.'));
  const importoValido = Number.isFinite(importoNum) && importoNum > 0;
  const ivaNum = importoIva.trim() ? Number(importoIva.replace(',', '.')) : null;
  const ivaValida = ivaNum == null || (Number.isFinite(ivaNum) && ivaNum >= 0);
  const ivaEff = ivaValida ? ivaNum : null;
  const totEff = importoValido ? importoNum : spesa?.importoTotale ?? null;
  const imponibile = totEff != null ? calcolaImponibile(totEff, ivaEff) : null;
  const perPersona = totEff != null && numeroPersone > 0 ? totEff / numeroPersone : null;

  const salva = React.useCallback(() => {
    if (!spesa || !importoValido) return;
    const dataIso = dataLocal ? new Date(dataLocal).toISOString() : null;
    startTransition(async () => {
      const res = await aggiornaSpesa({
        id: spesa.id,
        categoria,
        cantiereId: cantiereId || null,
        ragioneSociale: ragioneSociale.trim() || null,
        importoTotale: importoNum,
        importoIva: ivaEff,
        metodoPagamento: metodo,
        numeroPersone,
        dataScontrino: dataIso,
        note: note.trim() || null,
      });
      if (!res.ok) {
        setErrMsg('Salvataggio non riuscito. Riprova.');
        return;
      }
      onClose();
      router.refresh();
    });
  }, [
    spesa,
    importoValido,
    importoNum,
    ivaEff,
    categoria,
    cantiereId,
    ragioneSociale,
    metodo,
    numeroPersone,
    dataLocal,
    note,
    onClose,
    router,
  ]);

  const elimina = React.useCallback(() => {
    if (!spesa) return;
    startTransition(async () => {
      const res = await eliminaSpesa(spesa.id);
      if (!res.ok) {
        setErrMsg('Eliminazione non riuscita.');
        setConfermaElimina(false);
        return;
      }
      onClose();
      router.refresh();
    });
  }, [spesa, onClose, router]);

  const toggleCronologia = React.useCallback(() => {
    setCronoAperta((v) => !v);
    if (!spesa || crono !== null) return;
    startTransition(async () => {
      const res = await cronologiaSpesa(spesa.id);
      setCrono(res.ok ? res.versioni : []);
    });
  }, [spesa, crono]);

  if (!spesa) return null;
  const cantiereNome = spesa.cantiereId ? cantieriNomi[spesa.cantiereId] : null;
  const spesaId = spesa.id;
  const inElab = spesa.stato === 'in_elaborazione';
  const daVerificare = spesa.stato === 'bozza';

  const rianalizza = () => {
    startRian(async () => {
      const res = await rianalizzaSpesa(spesaId);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setErrMsg('Non è stato possibile riavviare l’analisi. Riprova.');
      }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[35] flex flex-col bg-background"
        role="dialog"
        aria-modal="true"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-base font-semibold text-foreground">
            {canEdit ? 'Dettaglio spesa' : 'Spesa'}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="space-y-2.5 px-4 py-3">
            {/* Foto ricevuta */}
            {spesa.hasFile ? (
              <button
                type="button"
                onClick={() => setFotoGrande(true)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-muted/30 p-1.5 text-left active:scale-[0.99] transition"
              >
                {spesa.hasThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/kantiere/spese/${spesa.id}/foto?size=thumb`}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Receipt className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <span className="text-xs text-muted-foreground">Tocca per vedere la ricevuta</span>
              </button>
            ) : null}

            {/* Stato analisi cloud (in elaborazione / da verificare) + recovery */}
            {inElab || daVerificare ? (
              <div
                className={
                  'flex items-center gap-2.5 rounded-xl border p-3 ' +
                  (inElab
                    ? 'border-primary/25 bg-primary/[0.06]'
                    : 'border-amber-200 bg-amber-50')
                }
              >
                {inElab ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={'text-sm font-semibold ' + (inElab ? 'text-primary' : 'text-amber-800')}>
                    {inElab ? 'Analisi in corso in cloud' : 'Da verificare'}
                  </p>
                  <p className={'text-xs ' + (inElab ? 'text-muted-foreground' : 'text-amber-700')}>
                    {inElab
                      ? 'I dati vengono compilati in automatico. Torna tra poco.'
                      : 'L’analisi non ha letto tutto: controlla o riprova.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={rianalizza}
                  disabled={rianPending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground active:scale-95 transition disabled:opacity-60"
                >
                  {rianPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Rianalizza
                </button>
              </div>
            ) : null}

            {/* Panoramica costi */}
            <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                Totale
              </p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
                {fmtEuro(totEff, valuta)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip label="Imponibile" value={fmtEuro(imponibile, valuta)} />
                <Chip label="IVA" value={fmtEuro(ivaEff, valuta)} />
                {perPersona != null && numeroPersone > 1 ? (
                  <Chip label={`${numeroPersone} pers.`} value={`${fmtEuro(perPersona, valuta)}/cad`} />
                ) : null}
              </div>
            </div>

            {canEdit ? (
              /* ── MODIFICA (admin/office) ─────────────────────────────── */
              <>
                <div className={GROUP}>
                  <p className={GROUP_LBL}>Importo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label htmlFor="det-tot" className={LBL}>
                        Totale ({valuta})
                      </label>
                      <input
                        id="det-tot"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={importoTotale}
                        onChange={(e) => setImportoTotale(e.target.value)}
                        className={'mt-1 text-lg font-semibold tabular-nums ' + FIELD}
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="det-iva" className={LBL}>
                        IVA
                      </label>
                      <input
                        id="det-iva"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={importoIva}
                        onChange={(e) => setImportoIva(e.target.value)}
                        className={'mt-1 tabular-nums ' + FIELD}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label htmlFor="det-metodo" className={LBL}>
                        Pagamento
                      </label>
                      <select
                        id="det-metodo"
                        value={metodo}
                        onChange={(e) => setMetodo(e.target.value as Metodo)}
                        className={'mt-1 ' + FIELD}
                      >
                        <option value="carta">Carta aziendale</option>
                        <option value="contanti">Contanti</option>
                        <option value="altro">Altro</option>
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="det-data" className={LBL}>
                        Data
                      </label>
                      <div className="relative mt-1">
                        <div className="pointer-events-none flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-2 text-base">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {dataLocal ? (
                            <span className="min-w-0 truncate">{fmtDataInput(dataLocal)}</span>
                          ) : (
                            <span className="text-muted-foreground">Scegli data</span>
                          )}
                        </div>
                        <input
                          id="det-data"
                          type="datetime-local"
                          value={dataLocal}
                          onChange={(e) => setDataLocal(e.target.value)}
                          aria-label="Data e ora"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={GROUP}>
                  <p className={GROUP_LBL}>Dettaglio</p>
                  <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-2">
                    <label htmlFor="det-persone" className="block text-[11px] font-bold uppercase tracking-wider text-primary">
                      Per quante persone?
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Diminuisci"
                        onClick={() => setNumeroPersone((n) => Math.max(1, n - 1))}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground active:scale-95 transition disabled:opacity-40"
                        disabled={numeroPersone <= 1}
                      >
                        <Minus className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <input
                        id="det-persone"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={numeroPersone}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value));
                          setNumeroPersone(Number.isFinite(n) && n >= 1 ? n : 1);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-primary/30 bg-background px-2.5 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        aria-label="Aumenta"
                        onClick={() => setNumeroPersone((n) => n + 1)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground active:scale-95 transition"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label htmlFor="det-cat" className={LBL}>
                        Categoria
                      </label>
                      <select
                        id="det-cat"
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value as CategoriaSpesa)}
                        className={'mt-1 ' + FIELD}
                      >
                        {CATEGORIE_ORDINATE.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORIA_META[cat].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="det-rs" className={LBL}>
                        Esercente
                      </label>
                      <input
                        id="det-rs"
                        type="text"
                        value={ragioneSociale}
                        onChange={(e) => setRagioneSociale(e.target.value)}
                        placeholder="Locale o negozio"
                        className={'mt-1 ' + FIELD}
                      />
                    </div>
                  </div>
                </div>

                <div className={GROUP}>
                  <p className={GROUP_LBL}>Cantiere</p>
                  <select
                    aria-label="Cantiere"
                    value={cantiereId}
                    onChange={(e) => setCantiereId(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">Da assegnare</option>
                    {cantieri.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={GROUP}>
                  <p className={GROUP_LBL}>Note</p>
                  <textarea
                    aria-label="Note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Note (facoltative)"
                    className={FIELD}
                  />
                </div>
              </>
            ) : (
              /* ── SOLA LETTURA (tecnico) ──────────────────────────────── */
              <>
                <div className={GROUP + ' !space-y-2.5'}>
                  <p className={GROUP_LBL}>Dettaglio</p>
                  <Row label="Data" value={fmtDataInput(isoToLocalInput(spesa.dataScontrino))} />
                  <Row label="Pagamento" value={METODO_LABEL[spesa.metodoPagamento ?? 'carta']} />
                  <Row label="Persone" value={String(spesa.numeroPersone)} />
                  <Row label="Categoria" value={CATEGORIA_META[spesa.categoria]?.label} />
                  <Row label="Esercente" value={spesa.ragioneSociale} />
                  <Row label="Cantiere" value={cantiereNome || 'Da assegnare'} />
                </div>
                {spesa.note ? (
                  <div className={GROUP}>
                    <p className={GROUP_LBL}>Note</p>
                    <p className="text-sm text-foreground">{spesa.note}</p>
                  </div>
                ) : null}
              </>
            )}

            <p className="px-0.5 text-[11px] text-muted-foreground">
              Registrata il {fmtDataInput(isoToLocalInput(spesa.createdAt))}
            </p>

            {/* Cronologia modifiche (solo admin/office) */}
            {canEdit ? (
              <div>
                <button
                  type="button"
                  onClick={toggleCronologia}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm active:scale-[0.99] transition"
                >
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Cronologia modifiche
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${cronoAperta ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {cronoAperta ? (
                  <div className="mt-1.5 space-y-1.5">
                    {crono === null ? (
                      <p className="px-1 text-xs text-muted-foreground">Carico…</p>
                    ) : crono.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">Nessuna modifica registrata.</p>
                    ) : (
                      crono.map((v) => (
                        <div key={v.versione} className="rounded-lg border border-border bg-card p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {v.modificatoDaNome || 'Ufficio'}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {fmtDataInput(isoToLocalInput(v.createdAt))}
                            </span>
                          </div>
                          {v.diff.length > 0 ? (
                            <p className="mt-0.5 text-muted-foreground">
                              {v.diff.map((d) => d.campo).join(', ')}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="shrink-0 px-3 pb-3 pt-2">
          {errMsg ? <p className="mb-2 text-center text-sm text-destructive">{errMsg}</p> : null}
          {canEdit ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="shrink-0 border-destructive/30 px-4 py-3.5 text-destructive"
                onClick={() => setConfermaElimina(true)}
                disabled={pending}
                aria-label="Elimina spesa"
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1 py-3.5 text-base font-semibold shadow-soft"
                onClick={salva}
                disabled={!importoValido || pending}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
                )}
                Salva modifiche
              </Button>
            </div>
          ) : (
            <Button type="button" size="lg" className="w-full py-3.5 text-base font-semibold" onClick={onClose}>
              Chiudi
            </Button>
          )}
        </footer>
      </div>

      {/* Lightbox foto — X safe-area aware; portale su body → sopra la bottom-nav. */}
      {fotoGrande && spesa.hasFile ? (
        <Portal>
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setFotoGrande(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFotoGrande(false);
            }}
            aria-label="Chiudi anteprima"
            className="absolute right-3 z-[71] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95 transition"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/kantiere/spese/${spesa.id}/foto`}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        </Portal>
      ) : null}

      {/* Conferma eliminazione (2 step) — portale su body → sopra la bottom-nav. */}
      {confermaElimina ? (
        <Portal>
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60 p-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="w-full rounded-2xl bg-background p-5 shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.4)]">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-center text-base font-semibold text-foreground">Eliminare questa spesa?</p>
            <p className="mt-1 text-center text-sm text-muted-foreground">L’operazione non è reversibile.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full py-3.5"
                onClick={() => setConfermaElimina(false)}
                disabled={pending}
              >
                Annulla
              </Button>
              <Button
                type="button"
                size="lg"
                className="w-full bg-destructive py-3.5 font-semibold text-destructive-foreground hover:bg-destructive/90"
                onClick={elimina}
                disabled={pending}
              >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : 'Elimina'}
              </Button>
            </div>
          </div>
        </div>
        </Portal>
      ) : null}
    </>
  );
}
