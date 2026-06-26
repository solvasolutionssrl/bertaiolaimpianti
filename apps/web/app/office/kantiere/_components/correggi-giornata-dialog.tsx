'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, Coffee, Check, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@kommessa/ui';
import { fmtData } from '@/app/office/_lib/format';
import {
  aggiungiPausaGiornata,
  registraOrePerDipendente,
} from '@/app/office/_actions/kantiere-rapportini';

/** Riga (target) modificabile a mano nella sezione avanzata. */
export type CorreggiRiga = {
  targetId: string;
  targetTipo: 'commessa' | 'cantiere';
  titolo: string;
  ord: number;
  straord: number;
  viaggio: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dipendenteId: string;
  dipendenteNome: string;
  /** YYYY-MM-DD */
  data: string;
  /** Ore lavorate correnti (ordinarie + straordinarie, pause escluse). */
  oreLavorate: number;
  righe?: CorreggiRiga[];
}

const PAUSE_RAPIDE = [30, 45, 60, 90] as const;
/** Soglia auto-approvazione (allineata al default config `anomalia_turno_ore_max`). */
const SOGLIA_ORE = 10;

/** "10h 30min" da un numero di ore decimale. */
function fmtOreMin(ore: number): string {
  const totMin = Math.round(ore * 60);
  const h = Math.floor(totMin / 60);
  const m = totMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function fmtDataIt(data: string): string {
  // fmtData gestisce già it-IT; fallback alla stringa grezza.
  return fmtData(data) || data;
}

export function CorreggiGiornataDialog({
  open,
  onOpenChange,
  dipendenteId,
  dipendenteNome,
  data,
  oreLavorate,
  righe,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // Pausa pranzo
  const [pausaSel, setPausaSel] = React.useState<number>(60);
  const [errorePausa, setErrorePausa] = React.useState<string | null>(null);

  // Sezione avanzata "correggi a mano"
  const [avanzateOpen, setAvanzateOpen] = React.useState(false);
  const [valori, setValori] = React.useState<
    Record<string, { ord: number; straord: number; viaggio: number }>
  >({});
  const [erroreRiga, setErroreRiga] = React.useState<Record<string, string>>({});
  const [salvataId, setSalvataId] = React.useState<string | null>(null);

  // Reset alla riapertura
  React.useEffect(() => {
    if (open) {
      setPausaSel(60);
      setErrorePausa(null);
      setAvanzateOpen(false);
      setSalvataId(null);
      setErroreRiga({});
      const init: Record<string, { ord: number; straord: number; viaggio: number }> = {};
      for (const r of righe ?? []) {
        init[r.targetId] = { ord: r.ord, straord: r.straord, viaggio: r.viaggio };
      }
      setValori(init);
    }
  }, [open, righe]);

  const oltreSoglia = oreLavorate > SOGLIA_ORE + 0.001;

  // Anteprima ore dopo la pausa selezionata
  const orePausa = pausaSel / 60;
  const oreDopoPausa = Math.max(0, oreLavorate - orePausa);
  const rientraSoglia = oreDopoPausa <= SOGLIA_ORE + 0.001;

  function handleAggiungiPausa() {
    setErrorePausa(null);
    const minuti = Math.round(pausaSel);
    if (minuti < 5 || minuti > 240) {
      setErrorePausa('La pausa deve essere tra 5 e 240 minuti.');
      return;
    }
    startTransition(async () => {
      const res = await aggiungiPausaGiornata({ dipendenteId, data, minuti });
      if (!res.ok) {
        setErrorePausa(messaggioErrore(res.error));
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  function handleSalvaRiga(r: CorreggiRiga) {
    setErroreRiga((prev) => {
      const n = { ...prev };
      delete n[r.targetId];
      return n;
    });
    const v = valori[r.targetId] ?? { ord: r.ord, straord: r.straord, viaggio: r.viaggio };
    setSalvataId(null);
    startTransition(async () => {
      const res = await registraOrePerDipendente({
        dipendenteId,
        commessaId: r.targetTipo === 'commessa' ? r.targetId : undefined,
        cantiereId: r.targetTipo === 'cantiere' ? r.targetId : undefined,
        data,
        ore_ordinarie: v.ord,
        ore_straordinarie: v.straord,
        ore_viaggio: v.viaggio,
      });
      if (!res.ok) {
        setErroreRiga((prev) => ({ ...prev, [r.targetId]: messaggioErrore(res.error) }));
        return;
      }
      setSalvataId(r.targetId);
      router.refresh();
    });
  }

  function setCampo(targetId: string, campo: 'ord' | 'straord' | 'viaggio', val: number) {
    setSalvataId(null);
    setValori((prev) => ({
      ...prev,
      [targetId]: { ...(prev[targetId] ?? { ord: 0, straord: 0, viaggio: 0 }), [campo]: val },
    }));
  }

  const hasRighe = (righe ?? []).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Correggi giornata</DialogTitle>
          <DialogDescription>
            {dipendenteNome} · {fmtDataIt(data)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ore lavorate correnti */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ore lavorate
            </span>
            <span
              className={[
                'tabular-nums text-lg font-semibold',
                oltreSoglia ? 'text-amber-700' : 'text-foreground',
              ].join(' ')}
            >
              {fmtOreMin(oreLavorate)}
            </span>
          </div>
          {oltreSoglia ? (
            <p className="flex items-start gap-1.5 -mt-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Turno lungo, manca la pausa pranzo?</span>
            </p>
          ) : null}

          {/* Sezione primaria: pausa pranzo dimenticata */}
          <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-amber-900">Pausa pranzo dimenticata</p>
            </div>
            <p className="mb-3 text-xs text-amber-800">
              Aggiungi la pausa non timbrata: le ore vengono ricalcolate e, se rientrano nella
              soglia, la giornata si approva da sola.
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {PAUSE_RAPIDE.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPausaSel(m)}
                  className={[
                    'rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
                    pausaSel === m
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100',
                  ].join(' ')}
                >
                  {m} min
                </button>
              ))}
              <label className="ml-1 flex items-center gap-1.5 text-xs text-amber-800">
                <span>Altro</span>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={pausaSel}
                  onChange={(e) => setPausaSel(parseInt(e.target.value, 10) || 0)}
                  className="w-16 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                  aria-label="Minuti pausa personalizzati"
                />
                <span>min</span>
              </label>
            </div>

            {/* Anteprima live */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-900">
              <span className="tabular-nums">
                {fmtOreMin(oreLavorate)} − {pausaSel} min ={' '}
                <span className="font-semibold">{fmtOreMin(oreDopoPausa)}</span>
              </span>
              {rientraSoglia ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Rientra nella soglia, si auto-approva
                </span>
              ) : null}
            </div>

            <Button
              onClick={handleAggiungiPausa}
              disabled={isPending}
              className="w-full bg-amber-600 text-white hover:bg-amber-700"
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Coffee className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              Aggiungi pausa
            </Button>

            {errorePausa ? (
              <p className="mt-2 text-xs font-medium text-destructive">{errorePausa}</p>
            ) : null}
          </div>

          {/* Sezione secondaria: correggi le ore a mano */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setAvanzateOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left"
            >
              <span className="text-sm font-medium text-foreground">Correggi le ore a mano</span>
              {avanzateOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {avanzateOpen ? (
              <div className="border-t border-border px-3 py-3">
                {!hasRighe ? (
                  <p className="text-xs text-muted-foreground">Nessuna riga da modificare.</p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">
                      La correzione a mano segna la giornata come approvata dall&apos;ufficio.
                    </p>
                    <div className="space-y-3">
                      {(righe ?? []).map((r) => {
                        const v = valori[r.targetId] ?? {
                          ord: r.ord,
                          straord: r.straord,
                          viaggio: r.viaggio,
                        };
                        return (
                          <div
                            key={r.targetId}
                            className="rounded-md border border-border/70 bg-muted/20 p-2.5"
                          >
                            <p className="mb-2 truncate text-xs font-medium text-foreground">
                              {r.titolo}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {(
                                [
                                  ['ord', 'Ord.'],
                                  ['straord', 'Straord.'],
                                  ['viaggio', 'Viaggio'],
                                ] as const
                              ).map(([campo, label]) => (
                                <div key={campo} className="space-y-1">
                                  <label className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {label}
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={24}
                                    step={0.25}
                                    value={v[campo]}
                                    onChange={(e) =>
                                      setCampo(r.targetId, campo, parseFloat(e.target.value) || 0)
                                    }
                                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {salvataId === r.targetId ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  Salvato
                                </span>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() => handleSalvaRiga(r)}
                              >
                                {isPending ? (
                                  <Loader2
                                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                Salva
                              </Button>
                            </div>
                            {erroreRiga[r.targetId] ? (
                              <p className="mt-1.5 text-xs font-medium text-destructive">
                                {erroreRiga[r.targetId]}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Traduce i codici errore noti delle action in un messaggio breve in italiano. */
function messaggioErrore(code: string): string {
  switch (code) {
    case 'GIORNATA_NON_CHIUSA':
      return 'La giornata non è chiusa (manca un ingresso o un’uscita): impossibile aggiungere la pausa.';
    case 'NON_AUTORIZZATO':
      return 'Non hai i permessi per questa operazione.';
    case 'MODULO_ASSENTE':
      return 'Modulo non disponibile.';
    case 'DATI_NON_VALIDI':
      return 'Dati non validi.';
    default:
      return code || 'Operazione non riuscita.';
  }
}
