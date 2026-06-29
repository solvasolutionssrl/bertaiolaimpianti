'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  AlertTriangle,
  RotateCw,
  Check,
  Pencil,
  History,
  Coffee,
} from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@kommessa/ui';
import { registraOrePerDipendente, ricalcolaPresenzePeriodo } from '../../../_actions/kantiere-rapportini';
import { VersioniDialog } from './versioni-dialog';
import { TimbratureRiepilogo, TimbratureSommario } from '../../_components/timbrature-riepilogo';
import { GiornateApertePanel } from './giornate-aperte-panel';
import type { GiornataAperta } from '@/app/office/_actions/kantiere-rapportini';
import { CorreggiGiornataDialog, type CorreggiRiga } from '../../_components/correggi-giornata-dialog';
import { LiveRefresh } from '@/app/_components/live-refresh';

export type TimbraturaItem = {
  tipo: string;
  ts: string;
  origine: string | null;
  commessaTitolo: string | null;
  pausa?: boolean | null;
};

export type RigaCommessa = {
  /** Id del target (commessa o cantiere). Null se la riga non è collegata. */
  targetId: string | null;
  targetTipo: 'commessa' | 'cantiere' | null;
  commessaTitolo: string;
  ore_ordinarie: number;
  ore_straordinarie: number;
  ore_viaggio: number;
  note: string | null;
};

export type RapportiniRiga = {
  id: string;
  dipendenteId: string;
  dipendenteNome: string;
  data: string;
  stato: string;
  /** Giornata congelata con ore (timbrature) non riportate nel rapportino. */
  oreNonConteggiate?: boolean;
  /** Bozza di una giornata passata/chiusa: anomalia da gestire (giorno aperto o ore oltre soglia). */
  daVerificare?: boolean;
  /** La giornata ha ancora un turno aperto (uscita mancante). */
  aperta?: boolean;
  /** È stata timbrata almeno una pausa pranzo nella giornata. */
  pausaTimbrata?: boolean;
  inviatoAt: string | null;
  note: string | null;
  totale: { ord: number; straord: number; viaggio: number };
  nRighe: number;
  righe: RigaCommessa[];
  timbrature: TimbraturaItem[];
};

export type FiltriRapportini = {
  from: string;
  to: string;
  stato: string;
  dipendente: string;
};

export type DipendenteItem = { id: string; nome: string };
export type CommessaPickerItem = { id: string; titolo: string };
export type CantierePickerItem = { id: string; nome: string };

// Giorno corrente in formato YYYY-MM-DD (client-side, fuso locale) — per il dialog "Registra ore".
function oggiLocale(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface Props {
  righe: RapportiniRiga[];
  filtri: FiltriRapportini;
  dipendenti: DipendenteItem[];
  commesse: CommessaPickerItem[];
  cantieri: CantierePickerItem[];
  giorniAperti: GiornataAperta[];
  /** Giorno corrente in Europe/Rome (YYYY-MM-DD): separa "oggi" dallo storico. */
  oggi: string;
  /** Soglia (ore) anomalia turno, per-tenant (`anomalia_turno_ore_max`). Default 10. */
  sogliaOre?: number;
  /** Soglia (ore) turno "lungo" oltre cui ci si aspetta la pausa pranzo. Default 5. */
  sogliaPausaOre?: number;
}

function fmtOre(n: number): string {
  return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
}

/** "Lunedì 16 giugno" da una data YYYY-MM-DD. */
function fmtGiornoLungo(data: string): string {
  try {
    const d = new Date(`${data}T12:00:00`);
    const s = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return data;
  }
}

export function RapportiniClient({
  righe,
  filtri,
  dipendenti,
  commesse,
  cantieri,
  giorniAperti,
  oggi,
  sogliaOre = 10,
  sogliaPausaOre = 5,
}: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  // Filtri locali controllati
  const [from, setFrom] = React.useState(filtri.from);
  const [to, setTo] = React.useState(filtri.to);
  const [dipendente, setDipendente] = React.useState(filtri.dipendente);

  // Mostra solo le giornate "anomale" (da verificare)
  const [soloAnomalie, setSoloAnomalie] = React.useState(false);

  // Espansione righe
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [versioniFor, setVersioniFor] = React.useState<{ id: string; nome: string; data: string } | null>(null);

  // Dialog "Correggi giornata" (pausa pranzo + correzione ore a mano)
  const [correggiFor, setCorreggiFor] = React.useState<{
    dipendenteId: string;
    dipendenteNome: string;
    data: string;
    oreLavorate: number;
    righe: CorreggiRiga[];
  } | null>(null);

  function openCorreggi(riga: RapportiniRiga) {
    const righeMod: CorreggiRiga[] = riga.righe
      .filter((r): r is RigaCommessa & { targetId: string; targetTipo: 'commessa' | 'cantiere' } =>
        r.targetId != null && r.targetTipo != null,
      )
      .map((r) => ({
        targetId: r.targetId,
        targetTipo: r.targetTipo,
        titolo: r.commessaTitolo,
        ord: r.ore_ordinarie,
        straord: r.ore_straordinarie,
        viaggio: r.ore_viaggio,
      }));
    setCorreggiFor({
      dipendenteId: riga.dipendenteId,
      dipendenteNome: riga.dipendenteNome,
      data: riga.data,
      oreLavorate: riga.totale.ord + riga.totale.straord,
      righe: righeMod,
    });
  }

  // Dialog registra ore
  const [registraOpen, setRegistraOpen] = React.useState(false);
  const [regDipendenteId, setRegDipendenteId] = React.useState('');
  const [regTarget, setRegTarget] = React.useState(''); // "c:<id>" cantiere | "k:<id>" commessa
  const [regData, setRegData] = React.useState(oggiLocale());
  const [regOrdinarie, setRegOrdinarie] = React.useState(0);
  const [regViaggio, setRegViaggio] = React.useState(0);
  const [regStraordinari, setRegStraordinari] = React.useState(0);
  const [regNote, setRegNote] = React.useState('');
  const [regError, setRegError] = React.useState('');
  const [isRegPending, startRegAction] = React.useTransition();

  // Ricalcolo presenze dalle timbrature (riparazione giornate bloccate)
  const [isRicalcolo, startRicalcolo] = React.useTransition();
  const [ricalcoloMsg, setRicalcoloMsg] = React.useState<string | null>(null);

  function openRegistra() {
    setRegDipendenteId(dipendenti[0]?.id ?? '');
    setRegTarget('');
    setRegData(oggiLocale());
    setRegOrdinarie(0);
    setRegViaggio(0);
    setRegStraordinari(0);
    setRegError('');
    setRegistraOpen(true);
  }

  function handleRegistra() {
    setRegError('');
    if (!regDipendenteId) { setRegError('Seleziona un dipendente.'); return; }
    if (!regTarget) { setRegError('Seleziona una commessa o un cantiere.'); return; }
    if (!regData) { setRegError('Inserisci la data.'); return; }

    const isCommessa = regTarget.startsWith('k:');
    const isCantiere = regTarget.startsWith('c:');
    const targetId = regTarget.slice(2);

    startRegAction(async () => {
      const res = await registraOrePerDipendente({
        dipendenteId: regDipendenteId,
        commessaId: isCommessa ? targetId : undefined,
        cantiereId: isCantiere ? targetId : undefined,
        data: regData,
        ore_ordinarie: regOrdinarie,
        ore_viaggio: regViaggio,
        ore_straordinarie: regStraordinari,
        note: regNote.trim() || undefined,
      });
      if (!res.ok) {
        setRegError(res.error);
        return;
      }
      setRegistraOpen(false);
      router.refresh();
    });
  }

  function applyFiltri(overrides: Partial<{ from: string; to: string; dipendente: string }>) {
    const f = { from, to, dipendente, ...overrides };
    const qs = new URLSearchParams();
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);
    if (f.dipendente) qs.set('dipendente', f.dipendente);
    startTransition(() => {
      router.push('/office/kantiere/rapportini?' + qs.toString());
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exportQs = new URLSearchParams();
  if (filtri.from) exportQs.set('from', filtri.from);
  if (filtri.to) exportQs.set('to', filtri.to);
  if (filtri.dipendente) exportQs.set('dipendente', filtri.dipendente);
  const exportHref = '/api/office/kantiere/rapportini/export?' + exportQs.toString();

  // Giornata "fantasma": il guscio bozza creato aprendo il rapportino senza mai
  // timbrare (0 timbrature e 0 ore). Non è una presenza → non va mostrata.
  const èVuota = (r: RapportiniRiga) =>
    r.timbrature.length === 0 &&
    r.totale.ord === 0 &&
    r.totale.straord === 0 &&
    r.totale.viaggio === 0;

  // Giornate di OGGI (provvisorie: i turni possono essere ancora aperti).
  const oggiRighe = righe.filter((r) => r.data === oggi && !èVuota(r));
  // Storico = giornate passate (definitive), eventualmente filtrate alle sole anomalie.
  const storicoTutte = righe.filter((r) => r.data < oggi && !èVuota(r));
  const storicoRighe = soloAnomalie ? storicoTutte.filter((r) => r.daVerificare) : storicoTutte;

  // Anomalie (da verificare) nello storico: giornate passate non finalizzate.
  const nAnomalie = storicoTutte.filter((r) => r.daVerificare).length;

  // Raggruppa lo storico per giorno (le righe arrivano già ordinate per data desc).
  const gruppi: { giorno: string; righe: RapportiniRiga[] }[] = [];
  for (const r of storicoRighe) {
    const last = gruppi[gruppi.length - 1];
    if (last && last.giorno === r.data) last.righe.push(r);
    else gruppi.push({ giorno: r.data, righe: [r] });
  }

  // Totali (sullo storico visibile)
  const totalOrd = storicoRighe.reduce((s, r) => s + r.totale.ord, 0);
  const totalStraord = storicoRighe.reduce((s, r) => s + r.totale.straord, 0);
  const totalViaggio = storicoRighe.reduce((s, r) => s + r.totale.viaggio, 0);

  // Esito di una giornata: ore lavorate, anomalia (e perché), pausa mancante.
  function esitoRiga(riga: RapportiniRiga) {
    const oreLavorate = riga.totale.ord + riga.totale.straord;
    const pausaMancante =
      !riga.daVerificare && !riga.pausaTimbrata && oreLavorate > sogliaPausaOre + 0.001;
    const motivo = riga.aperta
      ? 'Giorno rimasto aperto'
      : !riga.pausaTimbrata
        ? 'Oltre soglia, pausa non timbrata'
        : 'Oltre soglia';
    return { oreLavorate, pausaMancante, motivo };
  }

  return (
    <div className="space-y-4">
      {/* Promemoria: giornate rimaste aperte da chiudere */}
      <GiornateApertePanel giorni={giorniAperti} />

      {/* Anomalie: giornate passate non finalizzate. Prominente in cima. */}
      {nAnomalie > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 shadow-soft">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              Anomalie da sistemare
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
                {nAnomalie}
              </span>
            </p>
            <p className="text-xs text-amber-800">
              Giornate con il turno rimasto aperto o oltre soglia ore. Apri{' '}
              <span className="font-medium">Modifica</span> per correggerle (es. aggiungere la pausa pranzo dimenticata).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSoloAnomalie((v) => !v)}
            className="ml-auto shrink-0 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            {soloAnomalie ? 'Mostra tutte' : 'Mostra solo anomalie'}
          </button>
        </div>
      ) : null}

      {/* Barra filtri */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Dal</label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  applyFiltri({ from: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Al</label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  applyFiltri({ to: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
              <select
                value={dipendente}
                onChange={(e) => {
                  setDipendente(e.target.value);
                  applyFiltri({ dipendente: e.target.value });
                }}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Tutti i dipendenti</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            {nAnomalie > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={soloAnomalie}
                  onChange={(e) => setSoloAnomalie(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-amber-600"
                />
                Solo anomalie
              </label>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startRicalcolo(async () => {
                    setRicalcoloMsg(null);
                    const res = await ricalcolaPresenzePeriodo({ da: from, a: to });
                    setRicalcoloMsg(
                      res.ok ? `Ricalcolate ${res.giorni} giornate dalle timbrature.` : 'Ricalcolo non riuscito.',
                    );
                    router.refresh();
                  })
                }
                disabled={isRicalcolo}
                title="Riallinea le ore alle timbrature del periodo"
              >
                {isRicalcolo ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                Ricalcola dalle timbrature
              </Button>
              <Button variant="default" size="sm" onClick={openRegistra}>
                <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Registra ore
              </Button>
              <a
                href={exportHref}
                className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Esporta CSV
              </a>
              <LiveRefresh intervalMs={60000} />
            </div>
          </div>
          {ricalcoloMsg ? (
            <p className="mt-2 text-xs text-muted-foreground">{ricalcoloMsg}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* OGGI — giornate in corso (provvisorie). Nascoste quando si filtrano le anomalie. */}
      {oggiRighe.length > 0 && !soloAnomalie ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-emerald-50/60 px-4 py-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                In corso oggi
                <span className="font-normal text-emerald-800/80">· {fmtGiornoLungo(oggi)}</span>
              </p>
              <span className="text-xs text-emerald-800/70">Dati provvisori, si finalizzano a fine giornata</span>
            </div>
            <ul className="divide-y divide-border">
              {oggiRighe.map((riga) => {
                const ore = riga.totale.ord + riga.totale.straord;
                return (
                  <li key={riga.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <span className="min-w-[10rem] font-medium text-foreground">{riga.dipendenteNome}</span>
                    <TimbratureSommario timbrature={riga.timbrature} />
                    <span className="ml-auto tabular-nums text-sm text-muted-foreground">
                      {ore > 0 ? <span className="font-semibold text-foreground">{fmtOre(ore)}</span> : '—'}
                      {riga.totale.viaggio > 0 ? (
                        <span className="ml-1 text-xs">+ {fmtOre(riga.totale.viaggio)} viaggio</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* STORICO — giornate definitive, raggruppate per giorno */}
      {storicoRighe.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {soloAnomalie
            ? 'Nessuna anomalia nel periodo selezionato.'
            : 'Nessuna giornata registrata nel periodo selezionato.'}
        </p>
      ) : (
        <>
          {/* Summary line */}
          <div className="flex items-center gap-4 px-1 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{storicoRighe.length}</span> giornate
            </span>
            <span className="text-border">|</span>
            <span>
              Ord. <span className="tabular-nums font-medium text-foreground">{fmtOre(totalOrd)}</span>
            </span>
            <span>
              Straord. <span className="tabular-nums font-medium text-foreground">{fmtOre(totalStraord)}</span>
            </span>
            <span>
              Viaggio <span className="tabular-nums font-medium text-foreground">{fmtOre(totalViaggio)}</span>
            </span>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 font-medium">Dipendente</th>
                      <th className="px-3 py-2 font-medium">Ore</th>
                      <th className="px-3 py-2 font-medium">Esito</th>
                      <th className="w-40 px-3 py-2" aria-label="Azioni" />
                    </tr>
                  </thead>
                  <tbody>
                    {gruppi.map((g) => (
                      <React.Fragment key={g.giorno}>
                        {/* Intestazione giorno */}
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={5} className="px-3 py-1.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                              {fmtGiornoLungo(g.giorno)}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {g.righe.length} {g.righe.length === 1 ? 'persona' : 'persone'}
                            </span>
                          </td>
                        </tr>
                        {g.righe.map((riga) => {
                          const isOpen = expanded.has(riga.id);
                          const { oreLavorate, pausaMancante, motivo } = esitoRiga(riga);
                          return (
                            <React.Fragment key={riga.id}>
                              <tr
                                className="border-b border-border transition-colors hover:bg-primary-soft/50 cursor-pointer"
                                onClick={() => toggleExpand(riga.id)}
                              >
                                <td className="px-2 py-2 text-muted-foreground">
                                  {isOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">{riga.dipendenteNome}</div>
                                  <div className="mt-0.5">
                                    <TimbratureSommario timbrature={riga.timbrature} />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="tabular-nums text-base font-semibold text-foreground">
                                      {fmtOre(oreLavorate)}
                                    </span>
                                    {riga.totale.straord > 0 ? (
                                      <span className="text-[11px] text-muted-foreground">
                                        di cui {fmtOre(riga.totale.straord)} str.
                                      </span>
                                    ) : null}
                                  </div>
                                  {riga.totale.viaggio > 0 ? (
                                    <div className="text-[11px] tabular-nums text-muted-foreground">
                                      + {fmtOre(riga.totale.viaggio)} viaggio
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2">
                                  {riga.daVerificare ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                      {motivo}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Regolare
                                      </span>
                                      {pausaMancante ? (
                                        <span
                                          title={`Pausa pranzo non timbrata in una giornata oltre ${fmtOre(sogliaPausaOre)}. Controlla se è stata fatta e, se sì, aggiungila con Modifica.`}
                                          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                                        >
                                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                          <Coffee className="h-3 w-3" aria-hidden="true" />
                                        </span>
                                      ) : null}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant={riga.daVerificare ? 'outline' : 'ghost'}
                                      size="sm"
                                      onClick={() => openCorreggi(riga)}
                                      title="Correggi le ore / aggiungi pausa (resta tracciato nello storico)"
                                    >
                                      <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                      Modifica
                                    </Button>
                                    {riga.stato !== 'bozza' ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setVersioniFor({ id: riga.id, nome: riga.dipendenteNome, data: riga.data })
                                        }
                                        title="Cronologia delle modifiche"
                                      >
                                        <History className="h-3.5 w-3.5" aria-hidden="true" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>

                              {isOpen && (
                                <tr className="border-b border-border bg-muted/20">
                                  <td colSpan={5} className="px-6 py-4">
                                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                      {/* Colonna sinistra: righe commessa */}
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          Righe commessa
                                        </p>
                                        {riga.righe.length === 0 ? (
                                          <p className="text-xs text-muted-foreground">Nessuna riga commessa.</p>
                                        ) : (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="text-left text-muted-foreground border-b border-border/40">
                                                <th className="pb-1.5 pr-4 font-medium">Commessa / Cantiere</th>
                                                <th className="pb-1.5 pr-3 font-medium text-right">Ord.</th>
                                                <th className="pb-1.5 pr-3 font-medium text-right">Straord.</th>
                                                <th className="pb-1.5 pr-3 font-medium text-right">Viaggio</th>
                                                <th className="pb-1.5 font-medium">Note</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {riga.righe.map((r, j) => (
                                                <tr key={j} className="border-b border-border/30">
                                                  <td className="py-1.5 pr-4 font-medium text-foreground">
                                                    {r.commessaTitolo}
                                                  </td>
                                                  <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                    {fmtOre(r.ore_ordinarie)}
                                                  </td>
                                                  <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                    {fmtOre(r.ore_straordinarie)}
                                                  </td>
                                                  <td className="py-1.5 pr-3 tabular-nums text-right text-muted-foreground">
                                                    {fmtOre(r.ore_viaggio)}
                                                  </td>
                                                  <td className="py-1.5 text-muted-foreground max-w-[200px] truncate">
                                                    {r.note ?? <span className="select-none opacity-40">·</span>}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                        {riga.note ? (
                                          <p className="mt-3 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">Nota:</span> {riga.note}
                                          </p>
                                        ) : null}
                                        {riga.oreNonConteggiate ? (
                                          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            <span>
                                              Sono arrivate timbrature dopo la finalizzazione: usa{' '}
                                              <span className="font-medium">Ricalcola dalle timbrature</span> per
                                              riallineare le ore.
                                            </span>
                                          </p>
                                        ) : null}
                                      </div>

                                      {/* Colonna destra: timeline timbrature */}
                                      <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          Timbrature del giorno
                                        </p>
                                        <TimbratureRiepilogo timbrature={riga.timbrature} />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog Registra ore */}
      <Dialog open={registraOpen} onOpenChange={(open) => { if (!open) setRegistraOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registra ore per dipendente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Dipendente */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
              <select
                value={regDipendenteId}
                onChange={(e) => setRegDipendenteId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleziona dipendente...</option>
                {dipendenti.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>

            {/* Target: commessa o cantiere */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commessa o cantiere</label>
              <select
                value={regTarget}
                onChange={(e) => setRegTarget(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleziona...</option>
                {commesse.length > 0 && (
                  <optgroup label="Commesse">
                    {commesse.map((c) => (
                      <option key={c.id} value={`k:${c.id}`}>{c.titolo}</option>
                    ))}
                  </optgroup>
                )}
                {cantieri.length > 0 && (
                  <optgroup label="Cantieri">
                    {cantieri.map((k) => (
                      <option key={k.id} value={`c:${k.id}`}>{k.nome}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Data */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <input
                type="date"
                value={regData}
                onChange={(e) => setRegData(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Ore */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore ordinarie</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regOrdinarie}
                  onChange={(e) => setRegOrdinarie(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore viaggio</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regViaggio}
                  onChange={(e) => setRegViaggio(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Straordinari</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regStraordinari}
                  onChange={(e) => setRegStraordinari(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note (opzionale)</label>
              <textarea
                value={regNote}
                onChange={(e) => setRegNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Note aggiuntive..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {regError ? (
              <p className="text-xs text-destructive">{regError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistraOpen(false)} disabled={isRegPending}>
              Annulla
            </Button>
            <Button onClick={handleRegistra} disabled={isRegPending}>
              {isRegPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Registra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cronologia versioni */}
      <VersioniDialog rapportino={versioniFor} onClose={() => setVersioniFor(null)} />

      {/* Dialog Correggi giornata (pausa pranzo + correzione ore) */}
      {correggiFor ? (
        <CorreggiGiornataDialog
          open={!!correggiFor}
          onOpenChange={(open) => { if (!open) setCorreggiFor(null); }}
          dipendenteId={correggiFor.dipendenteId}
          dipendenteNome={correggiFor.dipendenteNome}
          data={correggiFor.data}
          oreLavorate={correggiFor.oreLavorate}
          sogliaOre={sogliaOre}
          righe={correggiFor.righe}
        />
      ) : null}
    </div>
  );
}
