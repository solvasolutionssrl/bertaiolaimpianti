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
  Download,
  Check,
  Pencil,
  History,
  Coffee,
  MapPin,
  Car,
  Users,
} from 'lucide-react';
import { Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@kommessa/ui';
import { registraOrePerDipendente, ricalcolaPresenzePeriodo } from '../../../_actions/kantiere-rapportini';
import { BollinoAffidabilita, CronologiaGiornataPannello } from '../../_components/cronologia-giornata';
import type { Affidabilita } from '@kommessa/api/kantiere-cronologia';
import { cantiereImputabile } from '@kommessa/api/stato-lavoro';
import { useConfirm } from '@/app/_components/confirm-provider';
import {
  TimbratureRiepilogo,
  TimbratureSommario,
  GiornataFlow,
  useTotaleGiornata,
} from '../../_components/timbrature-riepilogo';
import { GiornateApertePanel } from './giornate-aperte-panel';
import { LeMieOre } from './le-mie-ore';
import type { MiaGiornata } from '@/app/office/_lib/mia-giornata';
import { TimbriTerminale, titoloPassaggi } from '../../_components/timbri-terminale';
import { CompilaGiornataDialog, type ModoCompila } from '../../_components/compila-giornata-dialog';
import { ETICHETTA_STATO_TIMBRO, type TimbroGiornataVista } from '@/app/_lib/timbro/vista';
import type { GiornataAperta } from '@/app/office/_actions/kantiere-rapportini';
import {
  CorreggiGiornataDialog,
  type CorreggiRiga,
  type CorreggiTratta,
} from '../../_components/correggi-giornata-dialog';
import { LiveRefresh } from '@/app/_components/live-refresh';
import { Scelta } from '@/app/_components/scelta';
import { luogoDaValore, valoreLuogo } from '@kommessa/api/sottocantieri';

export type TimbraturaItem = {
  tipo: string;
  ts: string;
  origine: string | null;
  commessaTitolo: string | null;
  pausa?: boolean | null;
  /** Quando la riga è stata inserita (ISO) — per "aggiunta il …" sulle manuali. */
  createdAt?: string | null;
  /** Nome di chi ha inserito la riga (per le manuali). */
  creatoNome?: string | null;
  /** true se è la RIPRESA di una pausa chiusa in automatico (dimenticata oltre soglia). */
  autoChiusa?: boolean | null;
};

/** Tratta di viaggio della giornata (andata sede→cantiere, ritorno cantiere→sede). */
export type ViaggioTratta = {
  /** Id della riga `timbratura_viaggio`: e' come si indirizza la tratta da correggere. */
  id: string;
  direzione: 'andata' | 'ritorno';
  sede: string;
  cantiere: string;
  km: number;
  minuti: number;
  autista: boolean;
  /** Cantiere di partenza (switch cantiere→cantiere) → mostra "A → B". */
  daCantiere?: string | null;
};

export type RigaCommessa = {
  /** Id del target (commessa o cantiere). Null se la riga non è collegata. */
  targetId: string | null;
  targetTipo: 'commessa' | 'cantiere' | null;
  /** La fase del cantiere, se la riga e' per fase. */
  sottocantiereId?: string | null;
  commessaTitolo: string;
  /** Lavoro entro l'orario ordinario (ord + straord = lavoro). */
  ore_ordinarie: number;
  ore_straordinarie: number;
  /** Viaggio totale. */
  ore_viaggio: number;
  lavoro: number;
  /** Quota mostrata: lavoro e viaggio entro l'orario ordinario. */
  ordinarie: number;
  viaggio_eccedente: number;
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
  /** Km di viaggio della giornata (somma distanza_km da timbratura_viaggio). */
  viaggioKm?: number;
  /** Tratte di viaggio della giornata (per il dettaglio espanso). */
  viaggi?: ViaggioTratta[];
  inviatoAt: string | null;
  note: string | null;
  totale: { ord: number; straord: number; viaggio: number; lavoro: number; ordinarie: number; viaggioEccedente: number };
  nRighe: number;
  righe: RigaCommessa[];
  timbrature: TimbraturaItem[];
  /** Quanto fidarsi delle ore: tutta timbrata, in parte a mano, corretta dall'ufficio. */
  affidabilita?: Affidabilita;
  /** Modifiche vere arrivate quando la giornata era già approvata. */
  modificheDopoApprovazione?: number;
  /**
   * La giornata vista dai timbri del terminale, se ce ne sono. Una riga con
   * `id` che comincia per `timbro:` non ha ancora un rapportino: e' la
   * presenza timbrata in attesa di essere ripartita.
   */
  timbro?: TimbroGiornataVista;
};

export type FiltriRapportini = {
  from: string;
  to: string;
  stato: string;
  dipendente: string;
  /** Id del cantiere: tiene solo le giornate che hanno ore su quel cantiere. */
  cantiere: string;
};

export type DipendenteItem = { id: string; nome: string; modalita?: 'ufficio' | 'esterno' };
export type CommessaPickerItem = { id: string; titolo: string };
/** `stato` serve solo a segnare i chiusi e a chiedere conferma prima di scrivere. */
export type CantierePickerItem = {
  id: string;
  nome: string;
  stato?: string | null;
  codice?: string | null;
  cliente?: string | null;
  /** Le fasi aperte del cantiere (23/10/2026): figli nella tendina di «Registra ore». */
  sottocantieri?: { id: string; nome: string; codice: string | null }[];
};

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
  /** Le giornate timbrate al terminale nel periodo, per il pannello «da ripartire». */
  timbroGiornate?: TimbroGiornataVista[];
  /** Sedi, mezzi e impostazioni per «Compila giornata» da scrivania. */
  compila?: {
    sedi: { id: string; nome: string; tipo: string; isDefault: boolean }[];
    sediPerCantiere: Record<string, string[]>;
    mezzi: { id: string; targa: string; modello: string | null }[];
    impostazioni: { passoMinuti: number; stepViaggio: number; sogliaPausaPranzoOre: number; splitAttivo: boolean; tolleranzaChiusuraMin: number; arrotondamentoTimbriMin?: number };
  };
  /** Giorno corrente in Europe/Rome (YYYY-MM-DD): separa "oggi" dallo storico. */
  oggi: string;
  /** La giornata di chi guarda, se ha una scheda dipendente: accende la zona «Le mie ore». */
  mia?: MiaGiornata | null;
  /** Soglia (ore) anomalia turno, per-tenant (`anomalia_turno_ore_max`). Default 10. */
  sogliaOre?: number;
  /** Soglia (ore) turno "lungo" oltre cui ci si aspetta la pausa pranzo. Default 5. */
  sogliaPausaOre?: number;
}

/** Minuti → "H:MM". */
function minToColon(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Ore decimali → "H:MM" (es. 7.5 → "7:30"). Formato ore usato ovunque in tabella. */
function fmtOreColon(ore: number): string {
  return minToColon(ore * 60);
}

/** Etichetta viaggio: "12 km · 2:36" (km solo se noti). */
function fmtViaggio(km: number, ore: number): string {
  return `${km > 0 ? `${Math.round(km)} km · ` : ''}${fmtOreColon(ore)}`;
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

/** Etichette dei target (cantiere/commessa) su cui la persona ha speso tempo. */
function targetLabels(riga: RapportiniRiga): string[] {
  const labels = new Set<string>();
  for (const r of riga.righe) if (r.commessaTitolo) labels.add(r.commessaTitolo);
  if (labels.size === 0) for (const t of riga.timbrature) if (t.commessaTitolo) labels.add(t.commessaTitolo);
  return [...labels];
}

/** Pill compatte del cantiere/commessa (max 2 + "+N"). */
function CantierePills({ labels }: { labels: string[] }) {
  if (labels.length === 0) return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const shown = labels.slice(0, 2);
  const extra = labels.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((l) => (
        <span
          key={l}
          title={l}
          // Con la fase («Cantiere › Fase», 23/10/2026) l'etichetta e' piu' lunga:
          // a 12rem due pillole dello stesso cantiere si leggevano uguali.
          className="inline-flex max-w-[17rem] items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80"
        >
          <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{l}</span>
        </span>
      ))}
      {extra > 0 ? <span className="text-[11px] text-muted-foreground">+{extra}</span> : null}
    </span>
  );
}

/** Dettaglio espanso condiviso (storico + oggi): righe commessa + timeline timbrature. */
function DettaglioGiornata({ riga, onModifica }: { riga: RapportiniRiga; onModifica?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Righe commessa */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Righe commessa
        </p>
        {riga.righe.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessuna riga commessa.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/40">
                <th className="pb-1 pr-4 font-medium">Commessa / Cantiere</th>
                <th className="pb-1 pr-3 font-medium text-right">Lavoro</th>
                <th className="pb-1 pr-3 font-medium text-right">Viaggio</th>
                <th className="pb-1 pr-3 font-medium text-right" title="Lavoro e viaggio entro l'orario ordinario">Ordinarie</th>
                <th className="pb-1 pr-3 font-medium text-right">Straord.</th>
                <th className="pb-1 pr-3 font-medium text-right" title="Viaggio oltre l'orario ordinario">Viaggio ecc.</th>
                <th className="pb-1 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {riga.righe.map((r, j) => (
                <tr key={j} className="border-b border-border/30">
                  <td className="py-1 pr-4 font-medium text-foreground">{r.commessaTitolo}</td>
                  <td className="py-1 pr-3 tabular-nums text-right text-foreground">{fmtOreColon(r.lavoro)}</td>
                  <td className="py-1 pr-3 tabular-nums text-right text-foreground">{fmtOreColon(r.ore_viaggio)}</td>
                  <td className="py-1 pr-3 tabular-nums text-right text-muted-foreground">{fmtOreColon(r.ordinarie)}</td>
                  <td className="py-1 pr-3 tabular-nums text-right text-muted-foreground">{fmtOreColon(r.ore_straordinarie)}</td>
                  <td className="py-1 pr-3 tabular-nums text-right text-muted-foreground">{fmtOreColon(r.viaggio_eccedente)}</td>
                  <td className="py-1 text-muted-foreground max-w-[200px] truncate">
                    {r.note ?? <span className="select-none opacity-40">·</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {riga.note ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Nota:</span> {riga.note}
          </p>
        ) : null}
        {riga.oreNonConteggiate ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Sono arrivate timbrature dopo la finalizzazione: usa{' '}
              <span className="font-medium">Ricalcola dalle timbrature</span> per riallineare le ore.
            </span>
          </p>
        ) : null}
        {onModifica ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={onModifica}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Modifica giornata
          </Button>
        ) : null}
      </div>

      {/* Timeline timbrature + viaggio */}
      <div className="space-y-3">
        {riga.timbro ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {titoloPassaggi(riga.timbro.timbri)}
            </p>
            <TimbriTerminale timbri={riga.timbro.timbri} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Presenza {minToColon(riga.timbro.nettoMin)}
              {riga.timbro.pausaTimbrataMin > 0 ? ` · pausa timbrata ${minToColon(riga.timbro.pausaTimbrataMin)}` : ''}
              {' · '}
              {ETICHETTA_STATO_TIMBRO[riga.timbro.stato]}
              {riga.timbro.motivo ? ` — ${riga.timbro.motivo}` : ''}
            </p>
          </div>
        ) : null}
        <div>
          {/* Le timbrature sui cantieri: QR, app, capo o a mano. Ogni riga
              dice la sua origine (OrigineLine); il registro del badge sta
              nel blocco sopra, con le sue pillole. */}
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Timbrature sui cantieri
          </p>
          <TimbratureRiepilogo timbrature={riga.timbrature} />
        </div>

        {riga.viaggi && riga.viaggi.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Viaggio
            </p>
            <ul className="space-y-1">
              {riga.viaggi.map((v, i) => {
                // Switch cantiere→cantiere: origine = cantiere di partenza.
                const da = v.daCantiere || (v.direzione === 'andata' ? v.sede : v.cantiere || 'cantiere');
                const a = v.direzione === 'andata' ? v.cantiere || 'cantiere' : v.sede;
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-sky-200/70 bg-sky-50/60 px-2.5 py-1.5 text-xs"
                  >
                    <Car className="h-3 w-3 shrink-0 text-sky-600" aria-hidden="true" />
                    <span className="font-medium capitalize text-sky-900">{v.direzione}</span>
                    <span className="text-sky-800">
                      {da} <span className="text-sky-400">→</span> {a}
                    </span>
                    <span className="ml-auto tabular-nums font-medium text-sky-700">
                      {v.autista && v.km > 0 ? `${Math.round(v.km)} km · ` : ''}
                      {minToColon(v.minuti)}
                    </span>
                    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                      {v.autista ? 'autista' : 'passeggero'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Riga "In corso oggi" come riga di tabella (colonne allineate allo storico).
 * Niente esito: le pill della giornata occupano lo spazio Ore+Esito (colSpan 2);
 * il totale ore LIVE va nell'ultima colonna, sempre popolato.
 */
/** «tu» accanto al nome: la riga e' di chi guarda, e in alto c'e' la sua zona. */
function TagTu() {
  return (
    <span className="ml-1.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px align-middle text-[10px] font-semibold text-primary" data-tag-tu>
      tu
    </span>
  );
}

function OggiRow({
  riga,
  isOpen,
  onToggle,
  mioId = null,
}: {
  riga: RapportiniRiga;
  isOpen: boolean;
  onToggle: () => void;
  mioId?: string | null;
}) {
  const { minuti } = useTotaleGiornata(riga.timbrature);
  const labels = targetLabels(riga);
  return (
    <>
      <tr
        className="border-b border-border cursor-pointer bg-emerald-50/50 transition-colors hover:bg-emerald-100/50"
        onClick={onToggle}
      >
        <td className="px-2 py-1.5 align-top text-muted-foreground">
          {isOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5" />}
        </td>
        <td className="px-2.5 py-1.5 align-top">
          <div className="text-[13px] font-medium text-foreground">
            {riga.dipendenteNome}
            {mioId === riga.dipendenteId ? <TagTu /> : null}
          </div>
        </td>
        <td className="px-2.5 py-1.5 align-top">
          <CantierePills labels={labels} />
        </td>
        <td className="px-2.5 py-1.5 align-top" colSpan={2}>
          {riga.timbro && riga.timbrature.length === 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <TimbriTerminale timbri={riga.timbro.timbri} />
              <span className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                {ETICHETTA_STATO_TIMBRO[riga.timbro.stato]}
              </span>
            </div>
          ) : (
            <GiornataFlow
              timbrature={riga.timbrature}
              oreViaggio={riga.totale.viaggio}
              kmViaggio={riga.viaggioKm ?? 0}
              minutiLavoro={Math.round((riga.totale.ord + riga.totale.straord) * 60)}
            />
          )}
        </td>
        <td className="px-2 py-1.5 text-right align-top">
          <span className="tabular-nums text-sm font-semibold text-foreground">{minToColon(minuti)}</span>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-b border-border bg-emerald-50/30">
          <td colSpan={6} className="px-4 py-3">
            <DettaglioGiornata riga={riga} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function RapportiniClient({
  righe,
  filtri,
  dipendenti,
  commesse,
  cantieri,
  giorniAperti,
  timbroGiornate = [],
  compila,
  oggi,
  mia = null,
  sogliaOre = 10,
  sogliaPausaOre = 5,
}: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  // «Compila giornata» da scrivania: la scatola timbrata di una persona, o la
  // giornata di chi non ha ne' badge ne' app. Un dialog solo, due modi.
  const [modoCompila, setModoCompila] = React.useState<ModoCompila | null>(null);
  const [scegliCompila, setScegliCompila] = React.useState<{ dipendenteId: string; giorno: string } | null>(null);
  const setRipartisciFor = (g: TimbroGiornataVista | null) =>
    setModoCompila(g ? { tipo: 'scatola', vista: g, dipendenteId: g.dipendenteId, dipendenteNome: g.dipendenteNome } : null);
  const datiCompila = (dipendenteId: string | null) => ({
    // Con le fasi, se il cantiere ne ha: la tendina del dialog le mostra come figli.
    cantieri: cantieri.map((c) => ({ id: c.id, nome: c.nome, codice: c.codice ?? null, cliente: c.cliente ?? null, ...(c.sottocantieri ? { sottocantieri: c.sottocantieri } : {}) })),
    sedi: compila?.sedi ?? [],
    sediPerCantiere: compila?.sediPerCantiere ?? {},
    mezzi: compila?.mezzi ?? [],
    ultimoMezzoId: null,
    modalitaLavoro: (dipendenti.find((d) => d.id === dipendenteId)?.modalita ?? 'esterno') as 'ufficio' | 'esterno',
    impostazioni: compila?.impostazioni ?? { passoMinuti: 15, stepViaggio: 5, sogliaPausaPranzoOre: 5, splitAttivo: true, tolleranzaChiusuraMin: 5 },
  });
  // Le giornate timbrate che chiedono una mano: da ripartire, da chiudere, o
  // che non tornano. Quelle di oggi ancora aperte no: stanno lavorando.
  const timbroDaFareTutte = timbroGiornate.filter(
    (g) =>
      g.stato === 'da_ripartire' ||
      g.stato === 'da_chiudere' ||
      g.stato === 'da_verificare' ||
      (g.stato === 'presenza_aperta' && g.giorno < oggi),
  );
  // Chi guarda ha una scheda dipendente: le SUE cose stanno in «Le mie ore»,
  // il resto della pagina parla degli altri. Senza scheda, la pagina e' tutta
  // «gli altri» e non cambia niente.
  const mioId = mia?.dipendenteId ?? null;
  const timbroDaFare = mioId ? timbroDaFareTutte.filter((g) => g.dipendenteId !== mioId) : timbroDaFareTutte;
  const timbroMie = mioId ? timbroDaFareTutte.filter((g) => g.dipendenteId === mioId) : [];
  const giorniApertiAltri = mioId ? giorniAperti.filter((g) => g.dipendenteId !== mioId) : giorniAperti;
  const giorniApertiMie = mioId ? giorniAperti.filter((g) => g.dipendenteId === mioId) : [];

  // Filtri locali controllati
  const [from, setFrom] = React.useState(filtri.from);
  const [to, setTo] = React.useState(filtri.to);
  const [dipendente, setDipendente] = React.useState(filtri.dipendente);
  const [cantiere, setCantiere] = React.useState(filtri.cantiere);

  // Mostra solo le giornate "anomale" (da verificare)
  const [soloAnomalie, setSoloAnomalie] = React.useState(false);

  // Espansione righe (condivisa tra "oggi" e storico)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [versioniFor, setVersioniFor] = React.useState<{ id: string; nome: string; data: string } | null>(null);

  // Dialog "Correggi giornata" (pausa pranzo + correzione ore a mano)
  const [correggiFor, setCorreggiFor] = React.useState<{
    dipendenteId: string;
    dipendenteNome: string;
    data: string;
    oreLavorate: number;
    righe: CorreggiRiga[];
    tratte: CorreggiTratta[];
  } | null>(null);

  function openCorreggi(riga: RapportiniRiga) {
    const righeMod: CorreggiRiga[] = riga.righe
      .filter((r): r is RigaCommessa & { targetId: string; targetTipo: 'commessa' | 'cantiere' } =>
        r.targetId != null && r.targetTipo != null,
      )
      .map((r) => ({
        // Con la fase, il target della riga e' `<cantiere>/<fase>`: due fasi
        // dello stesso cantiere sono due righe distinte anche per il dialog.
        targetId: r.targetTipo === 'cantiere' ? valoreLuogo(r.targetId, r.sottocantiereId) : r.targetId,
        targetTipo: r.targetTipo,
        titolo: r.commessaTitolo,
        lavoro: r.lavoro,
        viaggio: r.ore_viaggio,
      }));
    // Le tratte si leggono come nel dettaglio espanso, così l'etichetta nel
    // dialog è la stessa frase che si vede nell'elenco.
    const tratteMod: CorreggiTratta[] = (riga.viaggi ?? []).map((v) => {
      const da = v.daCantiere || (v.direzione === 'andata' ? v.sede : v.cantiere || 'cantiere');
      const a = v.direzione === 'andata' ? v.cantiere || 'cantiere' : v.sede;
      return {
        id: v.id,
        etichetta: `${v.direzione === 'andata' ? 'Andata' : 'Ritorno'} · ${da} → ${a}`,
        km: Math.round(v.km),
        minuti: v.minuti,
        autista: v.autista,
      };
    });
    setCorreggiFor({
      dipendenteId: riga.dipendenteId,
      dipendenteNome: riga.dipendenteNome,
      data: riga.data,
      oreLavorate: riga.totale.ord + riga.totale.straord,
      righe: righeMod,
      tratte: tratteMod,
    });
  }

  // Dialog registra ore
  const [registraOpen, setRegistraOpen] = React.useState(false);
  const [regDipendenteId, setRegDipendenteId] = React.useState('');
  const [regTarget, setRegTarget] = React.useState(''); // "c:<id>" cantiere | "k:<id>" commessa
  const [regData, setRegData] = React.useState(oggiLocale());
  const [regLavoro, setRegLavoro] = React.useState(0);
  const [regViaggio, setRegViaggio] = React.useState(0);
  const [regNote, setRegNote] = React.useState('');
  const [regError, setRegError] = React.useState('');
  const [isRegPending, startRegAction] = React.useTransition();
  const chiediConferma = useConfirm();

  // Ricalcolo presenze dalle timbrature (riparazione giornate bloccate)
  const [isRicalcolo, startRicalcolo] = React.useTransition();
  const [ricalcoloMsg, setRicalcoloMsg] = React.useState<string | null>(null);

  function openRegistra() {
    setRegDipendenteId(dipendenti[0]?.id ?? '');
    setRegTarget('');
    setRegData(oggiLocale());
    setRegLavoro(0);
    setRegViaggio(0);
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
    // Un cantiere puo' arrivare come `<cantiere>/<fase>`.
    const luogo = isCantiere ? luogoDaValore(regTarget.slice(2)) : null;
    const targetId = isCantiere ? (luogo?.cantiereId ?? '') : regTarget.slice(2);
    const sottocantiereId = luogo?.sottocantiereId ?? null;

    startRegAction(async () => {
      // Su un cantiere chiuso l'ufficio puo' scrivere lo stesso, ma lo deve
      // sapere: si chiede una volta e si passa `forzato`. Dall'app la stessa
      // scrittura viene rifiutata e basta.
      const cantiereScelto = isCantiere ? cantieri.find((k) => k.id === targetId) : undefined;
      const forzato = !!cantiereScelto && !cantiereImputabile(cantiereScelto.stato);
      if (forzato) {
        const procedi = await chiediConferma({
          title: 'Il cantiere è chiuso',
          description: `"${cantiereScelto!.nome}" non è più in lavorazione. Registrare comunque le ore?`,
          confirmLabel: 'Registra',
        });
        if (!procedi) return;
      }

      const res = await registraOrePerDipendente({
        dipendenteId: regDipendenteId,
        commessaId: isCommessa ? targetId : undefined,
        cantiereId: isCantiere ? targetId : undefined,
        ...(sottocantiereId ? { sottocantiereId } : {}),
        data: regData,
        ore_lavoro: regLavoro,
        ore_viaggio: regViaggio,
        note: regNote.trim() || undefined,
        ...(forzato ? { forzato: true } : {}),
      });
      if (!res.ok) {
        // I codici non si mostrano a schermo: a leggerli e' una persona.
        setRegError(
          res.error === 'CANTIERE_CHIUSO'
            ? 'Il cantiere è chiuso. Ripetere l’operazione: verrà richiesta una conferma.'
            : res.error === 'FASE_RICHIESTA'
              ? 'Questo cantiere ha delle fasi: indicare su quale si è lavorato.'
              : res.error,
        );
        return;
      }
      setRegistraOpen(false);
      router.refresh();
    });
  }

  function applyFiltri(
    overrides: Partial<{ from: string; to: string; dipendente: string; cantiere: string }>,
  ) {
    const f = { from, to, dipendente, cantiere, ...overrides };
    const qs = new URLSearchParams();
    if (f.from) qs.set('from', f.from);
    if (f.to) qs.set('to', f.to);
    if (f.dipendente) qs.set('dipendente', f.dipendente);
    if (f.cantiere) qs.set('cantiere', f.cantiere);
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
  // Stesso filtro anche nell'export: un CSV con piu' righe di quelle a schermo
  // sarebbe peggio di un export mancante.
  if (filtri.cantiere) exportQs.set('cantiere', filtri.cantiere);
  const exportHref = '/api/office/kantiere/rapportini/export?' + exportQs.toString();

  // Giornata "fantasma": il guscio bozza creato aprendo il rapportino senza mai
  // timbrare (0 timbrature e 0 ore). Non è una presenza → non va mostrata.
  const èVuota = (r: RapportiniRiga) =>
    !r.timbro &&
    r.timbrature.length === 0 &&
    r.totale.ord === 0 &&
    r.totale.straord === 0 &&
    r.totale.viaggio === 0;

  // Giornate di OGGI (provvisorie: i turni possono essere ancora aperti).
  const oggiRighe = righe.filter((r) => r.data === oggi && !èVuota(r));
  // Storico = giornate passate (definitive), eventualmente filtrate alle sole anomalie.
  const storicoTutte = righe.filter((r) => r.data < oggi && !èVuota(r));
  const storicoRighe = soloAnomalie ? storicoTutte.filter((r) => r.daVerificare) : storicoTutte;
  const mostraOggi = oggiRighe.length > 0 && !soloAnomalie;

  // Anomalie (da verificare) nello storico: giornate passate non finalizzate.
  const nAnomalie = storicoTutte.filter((r) => r.daVerificare).length;
  const nAnomalieMie = mioId ? storicoTutte.filter((r) => r.daVerificare && r.dipendenteId === mioId).length : 0;

  // Raggruppa lo storico per giorno (le righe arrivano già ordinate per data desc).
  const gruppi: { giorno: string; righe: RapportiniRiga[] }[] = [];
  for (const r of storicoRighe) {
    const last = gruppi[gruppi.length - 1];
    if (last && last.giorno === r.data) last.righe.push(r);
    else gruppi.push({ giorno: r.data, righe: [r] });
  }

  // Totali (sullo storico visibile)
  const totalOrd = storicoRighe.reduce((s, r) => s + r.totale.ordinarie, 0);
  const totalStraord = storicoRighe.reduce((s, r) => s + r.totale.straord, 0);
  const totalViaggioEcc = storicoRighe.reduce((s, r) => s + r.totale.viaggioEccedente, 0);

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

  // Barra filtri — in cima alla card unica (giorni di oggi + storico).
  // Una riga sola, tutto alto 40px come i tasti dell'ufficio: i filtri a
  // sinistra, le azioni a destra. Sotto i 1280px va a capo fra i due gruppi.
  const campo = 'h-10 w-[8.25rem] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const filtriBar = (
    <div className="border-b border-border p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-medium text-muted-foreground">Dal</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              applyFiltri({ from: e.target.value });
            }}
            className={campo}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[11px] font-medium text-muted-foreground">Al</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              applyFiltri({ to: e.target.value });
            }}
            className={campo}
          />
        </div>
        <div className="flex w-32 flex-col gap-0.5">
          <label className="text-[11px] font-medium text-muted-foreground">Dipendente</label>
          <Scelta
            opzioni={dipendenti.map((d) => ({ valore: d.id, etichetta: d.nome }))}
            valore={dipendente || null}
            onCambia={(v) => {
              setDipendente(v ?? '');
              applyFiltri({ dipendente: v ?? '' });
            }}
            etichettaNessuno="Tutti i dipendenti"
            segnaposto="Tutti i dipendenti"
            segnapostoRicerca="Cerca persona…"
            className="h-10 [&>button]:h-10 [&>button]:min-h-0 [&>button]:py-0"
            aria-label="Dipendente"
          />
        </div>
        <div className="flex w-44 flex-col gap-0.5">
          <label className="text-[11px] font-medium text-muted-foreground">Cantiere</label>
          {/* Cercabile per nome, codice e cliente: su FPM i cantieri sono
              centinaia, e un menu di sistema non si cerca. */}
          <Scelta
            opzioni={cantieri.map((k) => ({
              valore: k.id,
              etichetta: k.stato === 'chiuso' ? `${k.nome} · chiuso` : k.nome,
              dettaglio: [k.codice, k.cliente].filter(Boolean).join(' · ') || undefined,
            }))}
            valore={cantiere || null}
            onCambia={(v) => {
              setCantiere(v ?? '');
              applyFiltri({ cantiere: v ?? '' });
            }}
            etichettaNessuno="Tutti i cantieri"
            segnaposto="Tutti i cantieri"
            segnapostoRicerca="Cerca cantiere, codice, cliente…"
            className="h-10 [&>button]:h-10 [&>button]:min-h-0 [&>button]:py-0"
            aria-label="Cantiere"
          />
        </div>
        {nAnomalie > 0 ? (
          /* Un interruttore a icona: nella barra lo spazio e' contato, e la
             frase per esteso sta gia' nel riquadro ambra qui sopra. */
          <button
            type="button"
            aria-pressed={soloAnomalie}
            aria-label="Solo anomalie"
            title={soloAnomalie ? 'Mostra tutte le giornate' : `Mostra solo le anomalie (${nAnomalie})`}
            onClick={() => setSoloAnomalie((v) => !v)}
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded-md border text-amber-700 transition-colors',
              soloAnomalie ? 'border-amber-400 bg-amber-100' : 'border-input bg-background hover:bg-amber-50',
            ].join(' ')}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
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
            title="Ricalcola dalle timbrature del periodo"
            aria-label="Ricalcola dalle timbrature"
            className="w-10 px-0"
          >
            {isRicalcolo ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <Button variant="default" size="sm" onClick={() => setScegliCompila({ dipendenteId: dipendenti[0]?.id ?? '', giorno: oggi })}>
            <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Compila giornata
          </Button>
          <Button variant="outline" size="sm" onClick={openRegistra} title="Solo ore per cantiere, senza orari né viaggio">
            Registra ore
          </Button>
          {/* Ricalcola ed Esporta sono tasti rari: solo l'icona, con il
              nome al passaggio del mouse, cosi' la barra sta su una riga. */}
          <Button asChild variant="outline" size="sm" className="w-10 px-0">
            <a href={exportHref} title="Esporta CSV del periodo" aria-label="Esporta CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
          <LiveRefresh intervalMs={60000} className="h-10" compatto />
        </div>
      </div>
      {ricalcoloMsg ? <p className="mt-2 text-[11px] text-muted-foreground">{ricalcoloMsg}</p> : null}
    </div>
  );

  const vuoto = oggiRighe.length === 0 && storicoRighe.length === 0;

  return (
    <div className="space-y-3">
      {mia ? (
        <>
          <LeMieOre
            mia={mia}
            timbroOggi={timbroGiornate.find((g) => g.dipendenteId === mioId && g.giorno === oggi) ?? null}
            timbro={timbroMie}
            giorniAperti={giorniApertiMie}
            nAnomalie={nAnomalieMie}
            onRipartisci={(g) => setRipartisciFor(g)}
            onVediLeMie={(anomalie) => {
              setDipendente(mia.dipendenteId);
              setSoloAnomalie(anomalie);
              applyFiltri({ dipendente: mia.dipendenteId });
            }}
          />
          <h2 className="flex items-center gap-1.5 pt-1 text-sm font-semibold" data-zona-squadra>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Dipendenti
            <span className="font-normal text-muted-foreground">· le giornate degli altri, da sistemare e da controllare</span>
          </h2>
        </>
      ) : null}
      {/* Promemoria: giornate rimaste aperte da chiudere */}
      {timbroDaFare.length > 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-sky-900">
              Giornate timbrate al terminale da completare · {timbroDaFare.length}
            </p>
            <p className="text-[11px] text-sky-800/80">
              La presenza c’è, le ore non sono ancora sui cantieri: finché non si ripartisce non entrano nei conti.
            </p>
          </div>
          <ul className="mt-1.5 divide-y divide-sky-200/60">
            {timbroDaFare.map((g) => (
              <li key={g.chiave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
                <span className="w-[8.5rem] shrink-0 font-medium text-foreground">{g.dipendenteNome}</span>
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{fmtGiornoLungo(g.giorno)}</span>
                <TimbriTerminale timbri={g.timbri} compatto />
                <span className="ml-auto inline-flex items-center gap-2">
                  <span
                    className={[
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      g.stato === 'da_verificare' || g.stato === 'presenza_aperta'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-sky-300 bg-white text-sky-800',
                    ].join(' ')}
                    title={g.motivo ?? undefined}
                  >
                    {ETICHETTA_STATO_TIMBRO[g.stato]}
                  </span>
                  {g.stato === 'da_ripartire' || g.stato === 'da_chiudere' ? (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setRipartisciFor(g)}>
                      Ripartisci
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <GiornateApertePanel giorni={giorniApertiAltri} />
      <CompilaGiornataDialog
        open={modoCompila != null}
        onOpenChange={(o) => {
          if (!o) setModoCompila(null);
        }}
        modo={modoCompila}
        dati={datiCompila(
          modoCompila?.tipo === 'scatola' ? (modoCompila.dipendenteId ?? null) : modoCompila?.tipo === 'registra_altro' ? modoCompila.dipendenteId : null,
        )}
      />
      {/* Chi compilare, e quando: poi il dialog grande. */}
      <Dialog open={scegliCompila != null} onOpenChange={(o) => { if (!o) setScegliCompila(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compila giornata</DialogTitle>
          </DialogHeader>
          {scegliCompila ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dipendente</label>
                <select
                  value={scegliCompila.dipendenteId}
                  onChange={(e) => setScegliCompila({ ...scegliCompila, dipendenteId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seleziona…</option>
                  {dipendenti.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Giorno</label>
                <input
                  type="date"
                  max={oggi}
                  value={scegliCompila.giorno}
                  onChange={(e) => setScegliCompila({ ...scegliCompila, giorno: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Orari, pausa, cantieri e viaggio di una giornata senza timbrature: per chi non ha né badge né app.
                Per una giornata già timbrata si usa «Modifica giornata».
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setScegliCompila(null)}>Annulla</Button>
                <Button
                  size="sm"
                  disabled={!scegliCompila.dipendenteId || !scegliCompila.giorno}
                  onClick={() => {
                    const d = dipendenti.find((x) => x.id === scegliCompila.dipendenteId);
                    if (!d) return;
                    setModoCompila({ tipo: 'registra_altro', dipendenteId: d.id, dipendenteNome: d.nome, giorno: scegliCompila.giorno });
                    setScegliCompila(null);
                  }}
                >
                  Avanti
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Anomalie: giornate passate non finalizzate. Prominente in cima. */}
      {nAnomalie > 0 ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 shadow-soft">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              Anomalie da correggere
              <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white">
                {nAnomalie}
              </span>
            </p>
            <p className="text-[11px] text-amber-800">
              Giornate con il turno rimasto aperto o oltre soglia ore. Apri{' '}
              <span className="font-medium">Modifica</span> per correggerle (es. pausa pranzo dimenticata).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSoloAnomalie((v) => !v)}
            className="ml-auto shrink-0 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            {soloAnomalie ? 'Mostra tutte' : 'Mostra solo anomalie'}
          </button>
        </div>
      ) : null}

      {/* Card unica: filtri in alto, poi tabella con "In corso oggi" + storico. */}
      <Card>
        <CardContent className="p-0">
          {filtriBar}

          {vuoto ? (
            <p className="p-4 text-sm text-muted-foreground">
              {soloAnomalie
                ? 'Nessuna anomalia nel periodo selezionato.'
                : 'Nessuna giornata registrata nel periodo selezionato.'}
            </p>
          ) : (
            <>
              {/* Summary (storico) */}
              {storicoRighe.length > 0 ? (
                <div className="flex items-center gap-3 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{storicoRighe.length}</span> giornate
                  </span>
                  <span className="text-border">|</span>
                  <span>
                    Ordinarie <span className="tabular-nums font-medium text-foreground">{fmtOreColon(totalOrd)}</span>
                  </span>
                  <span>
                    Straord. <span className="tabular-nums font-medium text-foreground">{fmtOreColon(totalStraord)}</span>
                  </span>
                  <span>
                    Viaggio ecc. <span className="tabular-nums font-medium text-foreground">{fmtOreColon(totalViaggioEcc)}</span>
                  </span>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-7 px-2 py-1.5" />
                      <th className="px-2.5 py-1.5 font-medium">Dipendente</th>
                      <th className="px-2.5 py-1.5 font-medium">Cantiere</th>
                      <th className="px-2.5 py-1.5 font-medium">Ore</th>
                      <th className="px-2.5 py-1.5 font-medium">Esito</th>
                      <th className="w-20 px-2.5 py-1.5" aria-label="Azioni" />
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── In corso oggi ── */}
                    {mostraOggi ? (
                      <>
                        <tr className="border-b border-border bg-emerald-50/60">
                          <td colSpan={6} className="px-2.5 py-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                              <span className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                </span>
                                In corso oggi
                                <span className="font-normal text-emerald-800/80">· {fmtGiornoLungo(oggi)}</span>
                              </span>
                              <span className="text-[11px] text-emerald-800/70">
                                Dati provvisori, si finalizzano a fine giornata
                              </span>
                            </div>
                          </td>
                        </tr>
                        {oggiRighe.map((riga) => (
                          <OggiRow
                            key={riga.id}
                            riga={riga}
                            isOpen={expanded.has(riga.id)}
                            onToggle={() => toggleExpand(riga.id)}
                            mioId={mioId}
                          />
                        ))}
                      </>
                    ) : null}

                    {/* ── Storico per giorno ── */}
                    {gruppi.map((g) => (
                      <React.Fragment key={g.giorno}>
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={6} className="px-2.5 py-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                              {fmtGiornoLungo(g.giorno)}
                            </span>
                            <span className="ml-2 text-[11px] text-muted-foreground">
                              {g.righe.length} {g.righe.length === 1 ? 'persona' : 'persone'}
                            </span>
                          </td>
                        </tr>
                        {g.righe.map((riga) => {
                          const isOpen = expanded.has(riga.id);
                          const { oreLavorate, pausaMancante, motivo } = esitoRiga(riga);
                          const labels = targetLabels(riga);
                          return (
                            <React.Fragment key={riga.id}>
                              <tr
                                className="border-b border-border transition-colors hover:bg-primary-soft/50 cursor-pointer"
                                onClick={() => toggleExpand(riga.id)}
                              >
                                <td className="px-2 py-1.5 align-top text-muted-foreground">
                                  {isOpen ? (
                                    <ChevronDown className="mt-0.5 h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="mt-0.5 h-3.5 w-3.5" />
                                  )}
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                    <span className="text-[13px] font-medium text-foreground">{riga.dipendenteNome}</span>
                                    {mioId === riga.dipendenteId ? <TagTu /> : null}
                                    {riga.affidabilita ? (
                                      <BollinoAffidabilita
                                        affidabilita={riga.affidabilita}
                                        modificheDopoApprovazione={riga.modificheDopoApprovazione}
                                        onClick={() =>
                                          setVersioniFor({ id: riga.id, nome: riga.dipendenteNome, data: riga.data })
                                        }
                                      />
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5">
                                    <TimbratureSommario
                                      timbrature={riga.timbrature}
                                      minutiLavoro={Math.round((riga.totale.ord + riga.totale.straord) * 60)}
                                    />
                                  </div>
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <CantierePills labels={labels} />
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="tabular-nums text-sm font-semibold text-foreground">
                                      {fmtOreColon(oreLavorate)}
                                    </span>
                                    {riga.totale.straord > 0 ? (
                                      <span className="text-[10px] text-muted-foreground">
                                        di cui {fmtOreColon(riga.totale.straord)} str.
                                      </span>
                                    ) : null}
                                  </div>
                                  {riga.totale.viaggio > 0 ? (
                                    <div className="text-[10px] tabular-nums text-muted-foreground">
                                      + viaggio {fmtViaggio(riga.viaggioKm ?? 0, riga.totale.viaggio)}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-2.5 py-1.5 align-top">
                                  {riga.timbro && riga.id.startsWith('timbro:') ? (
                                    <span
                                      title={riga.timbro.motivo ?? undefined}
                                      className={[
                                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                        riga.timbro.stato === 'da_verificare' || riga.timbro.stato === 'presenza_aperta'
                                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                                          : 'border-sky-300 bg-sky-50 text-sky-800',
                                      ].join(' ')}
                                    >
                                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                      {ETICHETTA_STATO_TIMBRO[riga.timbro.stato]}
                                    </span>
                                  ) : riga.daVerificare ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                      {motivo}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Regolare
                                      </span>
                                      {pausaMancante ? (
                                        <span
                                          title={`Pausa pranzo non timbrata in una giornata oltre ${fmtOreColon(sogliaPausaOre)}. Verificare se la pausa è stata effettuata e, in tal caso, inserirla con Modifica.`}
                                          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                                        >
                                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                          <Coffee className="h-3 w-3" aria-hidden="true" />
                                        </span>
                                      ) : null}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-right align-top" onClick={(e) => e.stopPropagation()}>
                                  {riga.timbro && riga.id.startsWith('timbro:') ? (
                                    riga.timbro.stato === 'da_ripartire' || riga.timbro.stato === 'da_chiudere' ? (
                                      <Button size="sm" variant="outline" className="h-7" onClick={() => setRipartisciFor(riga.timbro!)}>
                                        Ripartisci
                                      </Button>
                                    ) : null
                                  ) : (
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Modifica giornata"
                                      onClick={() => openCorreggi(riga)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Cronologia della giornata"
                                      aria-label="Cronologia della giornata"
                                      onClick={() =>
                                        setVersioniFor({ id: riga.id, nome: riga.dipendenteNome, data: riga.data })
                                      }
                                    >
                                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                                    </Button>
                                  </div>
                                  )}
                                </td>
                              </tr>

                              {isOpen && (
                                <tr className="border-b border-border bg-muted/20">
                                  <td colSpan={6} className="px-4 py-3">
                                    <DettaglioGiornata riga={riga} onModifica={() => openCorreggi(riga)} />
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
            </>
          )}
        </CardContent>
      </Card>

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

            {/* Target: commessa o cantiere (con le fasi come figli). Una tendina
                cercabile, non un menu di sistema: su FPM i cantieri sono centinaia. */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Commessa o cantiere</label>
              <Scelta
                opzioni={[
                  ...commesse.map((c) => ({ valore: `k:${c.id}`, etichetta: c.titolo, gruppo: 'Commesse' })),
                  // I chiusi restano scegliibili (l'ufficio puo' sempre
                  // registrare) ma si vedono: al salvataggio si conferma.
                  ...cantieri.map((k) => ({
                    valore: `c:${k.id}`,
                    etichetta: cantiereImputabile(k.stato) ? k.nome : `${k.nome} · chiuso`,
                    dettaglio: [k.codice, k.cliente].filter(Boolean).join(' · ') || undefined,
                    gruppo: 'Cantieri',
                    ...(k.sottocantieri && k.sottocantieri.length > 0
                      ? {
                          figli: k.sottocantieri.map((f) => ({
                            valore: `c:${valoreLuogo(k.id, f.id)}`,
                            etichetta: f.codice ? `${f.codice} · ${f.nome}` : f.nome,
                          })),
                        }
                      : {}),
                  })),
                ]}
                valore={regTarget || null}
                onCambia={(v) => setRegTarget(v ?? '')}
                segnaposto="Seleziona…"
                segnapostoRicerca="Cerca cantiere, fase, codice, cliente…"
                aria-label="Commessa o cantiere"
              />
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

            {/* Ore pure: le quote si derivano dall'orario ordinario giornaliero */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore di lavoro</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={regLavoro}
                  onChange={(e) => setRegLavoro(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ore di viaggio</label>
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
            </div>
            <p className="text-xs text-muted-foreground">
              Ordinarie, straordinarie e viaggio eccedente si calcolano dall&apos;orario ordinario
              giornaliero delle impostazioni.
            </p>

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

      {/* Cronologia della giornata: pannello laterale, si legge accanto all'elenco */}
      <CronologiaGiornataPannello rapportino={versioniFor} onClose={() => setVersioniFor(null)} />

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
          tratte={correggiFor.tratte}
        />
      ) : null}
    </div>
  );
}
