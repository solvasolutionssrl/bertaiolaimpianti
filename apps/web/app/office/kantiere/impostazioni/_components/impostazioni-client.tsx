'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calculator,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  KeyRound,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, Input, Label, cn } from '@kommessa/ui';
import { formattaOreGiornata } from '@kommessa/api/kantiere-ore';
import { quoteGiornata } from '@kommessa/api/kantiere-quote';
import type { AnomalieKantiere, ImpostazioniKantiere } from '@/app/_lib/kantiere-config';
import { salvaImpostazioniKantiere } from '../../../_actions/kantiere-impostazioni';
import { useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  impostazioni: ImpostazioniKantiere;
  codiceAzienda: string | null;
}

/** I valori del modulo, come li invia il salvataggio. Le ore sono decimali. */
interface Valori {
  sogliaOreOrdinarie: number;
  arrotondamentoViaggioMin: number;
  arrotondamentoOreMin: number;
  avvioTurnoLibero: boolean;
  splitFineTurnoAttivo: boolean;
  registraGiornataAttivo: boolean;
  tolleranzaChiusuraMin: number;
  passoMinutiStepper: 5 | 10 | 15 | 30;
  sogliaPausaPranzoOre: number;
  sogliaAutoSpegnimentoPausaOre: number;
  kmSoloAutista: boolean;
  sedePartenzaDefault: string;
  autoApprovaRapportini: boolean;
  anomaliaTurnoOreMax: number;
  anomalie: AnomalieKantiere;
  kontabilitaAttiva: boolean;
}

function valoriDa(imp: ImpostazioniKantiere): Valori {
  return {
    sogliaOreOrdinarie: Math.round((imp.orarioOrdinarioMin / 60) * 100) / 100,
    arrotondamentoViaggioMin: imp.arrotondamentoViaggioMin,
    arrotondamentoOreMin: imp.arrotondamentoOreMin,
    avvioTurnoLibero: imp.avvioTurnoLibero,
    splitFineTurnoAttivo: imp.splitFineTurnoAttivo,
    registraGiornataAttivo: imp.registraGiornataAttivo,
    tolleranzaChiusuraMin: imp.tolleranzaChiusuraMin,
    passoMinutiStepper: imp.passoMinutiStepper as Valori['passoMinutiStepper'],
    sogliaPausaPranzoOre: imp.sogliaPausaPranzoOre,
    sogliaAutoSpegnimentoPausaOre: imp.sogliaAutoSpegnimentoPausaOre,
    kmSoloAutista: imp.kmSoloAutista,
    sedePartenzaDefault: imp.sedePartenzaDefault,
    autoApprovaRapportini: imp.autoApprovaRapportini,
    anomaliaTurnoOreMax: imp.anomaliaTurnoOreMax,
    anomalie: imp.anomalie,
    kontabilitaAttiva: imp.kontabilitaAttiva,
  };
}

/** Ore decimali come si scrivono su una giornata: 1,5 → "1:30". */
const hm = (ore: number) => formattaOreGiornata(Math.max(0, Math.round(ore * 60)));
const hmMin = (minuti: number) => formattaOreGiornata(Math.max(0, Math.round(minuti)));

function dataBreve(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

type SezioneId = 'ore' | 'turni' | 'pause' | 'viaggi' | 'approvazione' | 'anomalie' | 'kontabilita';

const SEZIONI: { id: SezioneId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ore', label: 'Orario e ore', icon: Clock },
  { id: 'turni', label: 'Turni', icon: SlidersHorizontal },
  { id: 'pause', label: 'Pause', icon: Coffee },
  { id: 'viaggi', label: 'Viaggi e chilometri', icon: Car },
  { id: 'approvazione', label: 'Approvazione giornate', icon: CheckCircle2 },
  { id: 'anomalie', label: 'Anomalie', icon: AlertTriangle },
  { id: 'kontabilita', label: 'Kontabilità', icon: Calculator },
];

/** I controlli numerici, con limiti e sezione: servono a validare prima di salvare. */
const LIMITI: {
  chiave: keyof Valori;
  nome: string;
  min: number;
  max: number;
  intero: boolean;
  sezione: SezioneId;
}[] = [
  { chiave: 'sogliaOreOrdinarie', nome: 'Orario ordinario giornaliero', min: 1, max: 24, intero: false, sezione: 'ore' },
  { chiave: 'arrotondamentoViaggioMin', nome: 'Arrotondamento del tempo di viaggio', min: 1, max: 60, intero: true, sezione: 'ore' },
  { chiave: 'arrotondamentoOreMin', nome: 'Arrotondamento delle ore di lavoro', min: 0, max: 60, intero: true, sezione: 'ore' },
  { chiave: 'tolleranzaChiusuraMin', nome: 'Tolleranza sulla ripartizione', min: 0, max: 30, intero: true, sezione: 'turni' },
  { chiave: 'sogliaPausaPranzoOre', nome: 'Promemoria pausa pranzo', min: 1, max: 12, intero: true, sezione: 'pause' },
  { chiave: 'sogliaAutoSpegnimentoPausaOre', nome: 'Chiusura automatica della pausa', min: 0.5, max: 8, intero: false, sezione: 'pause' },
  { chiave: 'anomaliaTurnoOreMax', nome: 'Soglia di verifica', min: 1, max: 24, intero: false, sezione: 'approvazione' },
];

function fuoriLimite(v: unknown, l: (typeof LIMITI)[number]): boolean {
  const n = Number(v);
  return !Number.isFinite(n) || n < l.min || n > l.max || (l.intero && !Number.isInteger(n));
}

const ANOMALIE: { key: keyof AnomalieKantiere; titolo: string; descrizione: string }[] = [
  { key: 'incomplete', titolo: 'Giornate incomplete', descrizione: 'Ingressi e uscite non appaiati sullo stesso cantiere.' },
  { key: 'ore_eccessive', titolo: 'Giornate oltre la soglia di verifica', descrizione: 'Ore di lavoro oltre la soglia della sezione Approvazione giornate.' },
  { key: 'straordinari', titolo: 'Straordinari', descrizione: 'Righe con lavoro oltre l’orario ordinario giornaliero.' },
  { key: 'festivo', titolo: 'Lavoro nei giorni festivi', descrizione: 'Ore registrate nelle festività nazionali.' },
  { key: 'weekend', titolo: 'Lavoro di sabato e domenica', descrizione: 'Ore registrate nel fine settimana.' },
  { key: 'senza_rapportino', titolo: 'Dipendenti senza giornate', descrizione: 'Dipendenti attivi senza giornate registrate nel periodo.' },
  { key: 'modificato', titolo: 'Giornate corrette dal dipendente', descrizione: 'Giornate modificate dal dipendente dopo l’invio.' },
];

// ── elementi della pagina ───────────────────────────────────────────────────

function SezioneHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Un campo: nome, descrizione e predefinito a sinistra, il valore a destra. */
function Campo({
  id,
  etichetta,
  descrizione,
  predefinito,
  errore,
  largo = false,
  children,
}: {
  id: string;
  etichetta: string;
  descrizione: React.ReactNode;
  predefinito?: string;
  errore?: string | null;
  /** Il valore sotto la descrizione, a tutta larghezza (testi lunghi). */
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0',
        !largo && 'sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8',
      )}
    >
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{etichetta}</Label>
        <div className="text-xs leading-relaxed text-muted-foreground">{descrizione}</div>
        {predefinito ? <p className="text-[11px] text-muted-foreground/80">Predefinito: {predefinito}</p> : null}
        {errore ? <p className="text-[11px] font-medium text-destructive">{errore}</p> : null}
      </div>
      <div className={cn(!largo && 'sm:justify-self-end sm:pt-0.5')}>{children}</div>
    </div>
  );
}

function Numero({
  id,
  valore,
  onChange,
  min,
  max,
  step,
  unita,
  errore,
}: {
  id: string;
  valore: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unita: string;
  errore?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(valore) ? valore : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        aria-invalid={errore || undefined}
        className={cn('w-24 text-right tabular-nums', errore && 'border-destructive focus-visible:ring-destructive')}
      />
      <span className="w-7 text-xs text-muted-foreground">{unita}</span>
    </div>
  );
}

function Interruttore({ id, attivo, onChange }: { id: string; attivo: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-right text-xs text-muted-foreground">{attivo ? 'Attivo' : 'Disattivo'}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={attivo}
        onClick={() => onChange(!attivo)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          attivo ? 'border-primary bg-primary' : 'border-border bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform',
            attivo ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}

/** Come l'orario ordinario divide due giornate tipo: lo stesso calcolo delle giornate vere. */
function EsempioQuote({ orarioMin }: { orarioMin: number }) {
  const casi = [
    { lavoro: orarioMin - 60, viaggio: 120 },
    { lavoro: orarioMin + 120, viaggio: 60 },
  ].filter((c) => c.lavoro > 0);
  const th = 'px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground';
  const td = 'px-2 py-1.5 text-right tabular-nums';
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[26rem] text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className={th}>Lavoro</th>
            <th className={th}>Viaggio</th>
            <th className={th}>Ordinarie</th>
            <th className={th}>Straordinarie</th>
            <th className={th}>Viaggio eccedente</th>
          </tr>
        </thead>
        <tbody>
          {casi.map((c) => {
            const { totali: t } = quoteGiornata(
              [{ chiave: 'esempio', minutiLavoro: c.lavoro, minutiViaggio: c.viaggio }],
              orarioMin,
            );
            return (
              <tr key={`${c.lavoro}-${c.viaggio}`} className="border-t border-border">
                <td className={td}>{hmMin(c.lavoro)}</td>
                <td className={td}>{hmMin(c.viaggio)}</td>
                <td className={cn(td, 'font-semibold text-foreground')}>
                  {hmMin(t.minutiOrdinari + t.minutiViaggioOrdinari)}
                </td>
                <td className={td}>{hmMin(t.minutiStraordinari)}</td>
                <td className={td}>{hmMin(t.minutiViaggioEccedenti)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── pagina ──────────────────────────────────────────────────────────────────

export function ImpostazioniClient({ impostazioni, codiceAzienda }: Props) {
  const askConfirm = useConfirm();
  const [sezione, setSezione] = React.useState<SezioneId>('ore');
  const [valori, setValori] = React.useState<Valori>(() => valoriDa(impostazioni));
  // Ultimi valori salvati: dicono cosa è cambiato e cosa confermare.
  const [base, setBase] = React.useState<Valori>(() => valoriDa(impostazioni));
  const [esito, setEsito] = React.useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const imposta = <K extends keyof Valori>(chiave: K, valore: Valori[K]) => {
    setEsito(null);
    setValori((p) => ({ ...p, [chiave]: valore }));
  };

  const errori = new Map(LIMITI.filter((l) => fuoriLimite(valori[l.chiave], l)).map((l) => [l.chiave, l]));
  const erroreDi = (chiave: keyof Valori) => {
    const l = errori.get(chiave);
    if (!l) return null;
    const range = `${String(l.min).replace('.', ',')} e ${String(l.max).replace('.', ',')}`;
    return l.intero ? `Valore intero tra ${range}.` : `Valore tra ${range}.`;
  };
  const sezioniConErrori = new Set([...errori.values()].map((l) => l.sezione));
  const modificato = JSON.stringify(valori) !== JSON.stringify(base);
  const orarioMin = errori.has('sogliaOreOrdinarie')
    ? impostazioni.orarioOrdinarioMin
    : Math.round(valori.sogliaOreOrdinarie * 60);

  function salvaOra() {
    startTransition(async () => {
      const result = await salvaImpostazioniKantiere({
        ...valori,
        sedePartenzaDefault: valori.sedePartenzaDefault.trim(),
      });
      setEsito(result);
      if (result.ok) setBase(valori);
    });
  }

  async function handleSalva() {
    setEsito(null);
    if (errori.size > 0) {
      const primo = [...errori.values()][0]!;
      setSezione(primo.sezione);
      setEsito({ ok: false, error: `Correggere: ${[...errori.values()].map((l) => l.nome).join(', ')}.` });
      return;
    }

    // Le modifiche che cambiano ore, approvazioni o chilometri si confermano.
    const v = valori;
    const parti: string[] = [];
    if (v.sogliaOreOrdinarie !== base.sogliaOreOrdinarie)
      parti.push(`orario ordinario giornaliero ${hm(v.sogliaOreOrdinarie)}`);
    if (v.arrotondamentoViaggioMin !== base.arrotondamentoViaggioMin)
      parti.push(`tempo di viaggio arrotondato a ${v.arrotondamentoViaggioMin} min`);
    if (v.arrotondamentoOreMin !== base.arrotondamentoOreMin)
      parti.push(
        v.arrotondamentoOreMin === 0
          ? 'ore di lavoro senza arrotondamento'
          : `ore di lavoro arrotondate a ${v.arrotondamentoOreMin} min`,
      );
    if (v.autoApprovaRapportini !== base.autoApprovaRapportini)
      parti.push(v.autoApprovaRapportini ? 'approvazione automatica attiva' : 'approvazione automatica disattivata');
    if (v.anomaliaTurnoOreMax !== base.anomaliaTurnoOreMax)
      parti.push(`soglia di verifica ${hm(v.anomaliaTurnoOreMax)}`);
    if (v.sogliaPausaPranzoOre !== base.sogliaPausaPranzoOre)
      parti.push(`promemoria pausa pranzo oltre ${hm(v.sogliaPausaPranzoOre)} di turno`);
    if (v.sogliaAutoSpegnimentoPausaOre !== base.sogliaAutoSpegnimentoPausaOre)
      parti.push(`chiusura automatica della pausa dopo ${hm(v.sogliaAutoSpegnimentoPausaOre)}`);
    if (v.kmSoloAutista !== base.kmSoloAutista)
      parti.push(v.kmSoloAutista ? 'chilometri solo a chi guida' : 'chilometri anche ai passeggeri');

    if (parti.length > 0) {
      const ok = await askConfirm({
        title: 'Confermare le modifiche?',
        description: `Nuovi valori: ${parti.join('; ')}. Si applicano alle giornate registrate o ricalcolate dopo il salvataggio; le altre restano invariate.`,
        confirmLabel: 'Applica',
        cancelLabel: 'Annulla',
      });
      if (!ok) return;
    }
    salvaOra();
  }

  const soglieIncoerenti =
    !errori.has('anomaliaTurnoOreMax') && !errori.has('sogliaOreOrdinarie') && valori.anomaliaTurnoOreMax * 60 < orarioMin;

  return (
    <div className="space-y-4" style={{ maxWidth: 980 }}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Codice azienda (accesso dei dipendenti all’app):</span>
        {codiceAzienda ? (
          <code className="rounded bg-background px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
            {codiceAzienda}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">non impostato</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[210px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Sezioni impostazioni">
          {SEZIONI.map(({ id, label, icon: Icon }) => {
            const attiva = sezione === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSezione(id)}
                aria-current={attiva ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  attiva ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {sezioniConErrori.has(id) ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-label="Valori da correggere" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
          {sezione === 'ore' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={Clock}
                title="Orario e ore"
                description="Classificazione delle ore registrate e arrotondamento dei tempi."
              />
              <div>
                <Campo
                  id="orario-ordinario"
                  etichetta="Orario ordinario giornaliero"
                  predefinito="8:00"
                  errore={erroreDi('sogliaOreOrdinarie')}
                  descrizione={
                    <>
                      Durata della giornata di lavoro ordinaria. Le ore registrate sono sempre lavoro e viaggio
                      effettivi; la classificazione si ricava da questo valore:
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        <li>
                          <strong>ordinarie</strong>: lavoro e viaggio fino all’orario ordinario;
                        </li>
                        <li>
                          <strong>straordinarie</strong>: lavoro oltre l’orario ordinario;
                        </li>
                        <li>
                          <strong>viaggio eccedente</strong>: viaggio oltre l’orario ordinario.
                        </li>
                      </ul>
                      <span className="mt-1 block">
                        Sabato e festivi seguono la stessa classificazione; le maggiorazioni si impostano in Ore e
                        costi, sezione Regole.
                      </span>
                    </>
                  }
                >
                  <Numero
                    id="orario-ordinario"
                    valore={valori.sogliaOreOrdinarie}
                    onChange={(n) => imposta('sogliaOreOrdinarie', n)}
                    min={1}
                    max={24}
                    step={0.25}
                    unita="ore"
                    errore={errori.has('sogliaOreOrdinarie')}
                  />
                </Campo>
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Esempio con orario ordinario di {hmMin(orarioMin)}
                  </p>
                  <EsempioQuote orarioMin={orarioMin} />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {impostazioni.quoteOreDal
                      ? `Il viaggio rientra nelle ore ordinarie per le giornate dal ${dataBreve(impostazioni.quoteOreDal)}. Le giornate precedenti mantengono la classificazione con cui sono state registrate, anche se ricalcolate.`
                      : 'La classificazione vale per tutte le giornate registrate o ricalcolate.'}
                  </p>
                </div>
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <Campo
                  id="arr-viaggio"
                  etichetta="Arrotondamento del tempo di viaggio"
                  predefinito="5 min"
                  errore={erroreDi('arrotondamentoViaggioMin')}
                  descrizione="Passo a cui si arrotonda il tempo stimato di ogni tratta, al multiplo più vicino. Una tratta con tempo maggiore di zero vale almeno un passo. Esempio con 5 min: 4 min diventano 5, 12 min diventano 10."
                >
                  <Numero
                    id="arr-viaggio"
                    valore={valori.arrotondamentoViaggioMin}
                    onChange={(n) => imposta('arrotondamentoViaggioMin', n)}
                    min={1}
                    max={60}
                    step={1}
                    unita="min"
                    errore={errori.has('arrotondamentoViaggioMin')}
                  />
                </Campo>
                <Campo
                  id="arr-ore"
                  etichetta="Arrotondamento delle ore di lavoro"
                  predefinito="0 (nessun arrotondamento)"
                  errore={erroreDi('arrotondamentoOreMin')}
                  descrizione="Passo a cui si arrotondano le ore di lavoro calcolate dalle timbrature. Con 0 le ore sono registrate al minuto."
                >
                  <Numero
                    id="arr-ore"
                    valore={valori.arrotondamentoOreMin}
                    onChange={(n) => imposta('arrotondamentoOreMin', n)}
                    min={0}
                    max={60}
                    step={1}
                    unita="min"
                    errore={errori.has('arrotondamentoOreMin')}
                  />
                </Campo>
              </div>
            </div>
          )}

          {sezione === 'turni' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={SlidersHorizontal}
                title="Turni"
                description="Avvio, chiusura e inserimento delle giornate dall’app."
              />
              <div className="space-y-4">
                <Campo
                  id="avvio-libero"
                  etichetta="Avvio del turno su ogni cantiere"
                  predefinito="attivo"
                  descrizione="Attivo: dall’app il turno si può avviare su qualsiasi cantiere. Disattivo: solo sui cantieri con cartello QR attivo."
                >
                  <Interruttore id="avvio-libero" attivo={valori.avvioTurnoLibero} onChange={(b) => imposta('avvioTurnoLibero', b)} />
                </Campo>
                <Campo
                  id="split-attivo"
                  etichetta="Ripartizione delle ore alla chiusura"
                  predefinito="attivo"
                  descrizione="Attivo: alla chiusura del turno dall’app le ore della giornata si possono ripartire su più cantieri. Disponibile quando la giornata ha un solo ingresso."
                >
                  <Interruttore id="split-attivo" attivo={valori.splitFineTurnoAttivo} onChange={(b) => imposta('splitFineTurnoAttivo', b)} />
                </Campo>
                <Campo
                  id="registra-giornata"
                  etichetta="Registrazione della giornata senza timbrature"
                  predefinito="attivo"
                  descrizione="Attivo: dall’app si può registrare una giornata senza timbrature, indicando ora di inizio, pausa, cantieri e percorso; la fine si calcola."
                >
                  <Interruttore
                    id="registra-giornata"
                    attivo={valori.registraGiornataAttivo}
                    onChange={(b) => imposta('registraGiornataAttivo', b)}
                  />
                </Campo>
                <Campo
                  id="tolleranza"
                  etichetta="Tolleranza sulla ripartizione"
                  predefinito="5 min"
                  errore={erroreDi('tolleranzaChiusuraMin')}
                  descrizione="Alla chiusura del turno con le ore ripartite su più cantieri: differenza massima ammessa tra le ore assegnate e quelle del turno. Entro la tolleranza il salvataggio è consentito e l’ultimo cantiere assorbe la differenza."
                >
                  <Numero
                    id="tolleranza"
                    valore={valori.tolleranzaChiusuraMin}
                    onChange={(n) => imposta('tolleranzaChiusuraMin', n)}
                    min={0}
                    max={30}
                    step={1}
                    unita="min"
                    errore={errori.has('tolleranzaChiusuraMin')}
                  />
                </Campo>
                <Campo
                  id="passo"
                  etichetta="Passo dei tasti + e −"
                  predefinito="15 min"
                  descrizione="Incremento dei tasti + e − nei campi ore dell’app."
                >
                  <select
                    id="passo"
                    value={valori.passoMinutiStepper}
                    onChange={(e) => imposta('passoMinutiStepper', Number(e.target.value) as Valori['passoMinutiStepper'])}
                    className="h-9 w-[7.5rem] rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {[5, 10, 15, 30].map((p) => (
                      <option key={p} value={p}>
                        {p} min
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </div>
          )}

          {sezione === 'pause' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={Coffee}
                title="Pause"
                description="Promemoria e chiusura automatica della pausa pranzo."
              />
              <div className="space-y-4">
                <Campo
                  id="soglia-pausa"
                  etichetta="Promemoria pausa pranzo"
                  predefinito="5:00"
                  errore={erroreDi('sogliaPausaPranzoOre')}
                  descrizione="Durata del turno oltre la quale, alla chiusura senza pausa timbrata, l’app chiede di indicare la pausa pranzo (30, 45 o 60 min). Vale per la chiusura da cartello QR e da app."
                >
                  <Numero
                    id="soglia-pausa"
                    valore={valori.sogliaPausaPranzoOre}
                    onChange={(n) => imposta('sogliaPausaPranzoOre', n)}
                    min={1}
                    max={12}
                    step={1}
                    unita="ore"
                    errore={errori.has('sogliaPausaPranzoOre')}
                  />
                </Campo>
                <Campo
                  id="soglia-auto-pausa"
                  etichetta="Chiusura automatica della pausa"
                  predefinito="1:30"
                  errore={erroreDi('sogliaAutoSpegnimentoPausaOre')}
                  descrizione={
                    <>
                      Durata oltre la quale una pausa rimasta aperta si chiude e il turno riprende. La pausa registrata è
                      pari a questo valore
                      {errori.has('sogliaAutoSpegnimentoPausaOre') ? '' : ` (${hm(valori.sogliaAutoSpegnimentoPausaOre)})`}.
                    </>
                  }
                >
                  <Numero
                    id="soglia-auto-pausa"
                    valore={valori.sogliaAutoSpegnimentoPausaOre}
                    onChange={(n) => imposta('sogliaAutoSpegnimentoPausaOre', n)}
                    min={0.5}
                    max={8}
                    step={0.5}
                    unita="ore"
                    errore={errori.has('sogliaAutoSpegnimentoPausaOre')}
                  />
                </Campo>
              </div>
            </div>
          )}

          {sezione === 'viaggi' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={Car}
                title="Viaggi e chilometri"
                description="Attribuzione del tempo di viaggio e dei chilometri delle tratte."
              />
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-foreground">Regole applicate</p>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">Andata e ritorno</span>: tempo di viaggio prima
                    dell’inizio e dopo la fine del lavoro.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Tratte fra cantieri</span>: tempo di viaggio, non di
                    lavoro; i chilometri vanno al cantiere di destinazione. In Registra giornata il tempo di ogni tratta
                    si può correggere, con un motivo se si scosta dalla stima.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Lavoro dalla sede sul progetto</span>: le ore sono del
                    cantiere; le tratte partono e arrivano alla sede predefinita.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Partenza e rientro</span>: in Registra giornata sono
                    sempre una sede, di default la predefinita; chi lavora tutto il giorno dalla sede non li indica. Avviando
                    o chiudendo il turno dall’app è ammessa anche l’abitazione privata, senza tempo né chilometri.
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <Campo
                  id="km-solo-autista"
                  etichetta="Chilometri solo a chi guida"
                  predefinito="attivo"
                  descrizione="Attivo: su una tratta con più persone il tempo di viaggio vale per ciascuna, i chilometri solo per chi guida il mezzo. Disattivo: i chilometri sono attribuiti anche ai passeggeri. Si applica ai chilometri trasmessi al gestionale."
                >
                  <Interruttore id="km-solo-autista" attivo={valori.kmSoloAutista} onChange={(b) => imposta('kmSoloAutista', b)} />
                </Campo>
                <Campo
                  id="sede-partenza"
                  etichetta="Indirizzo di partenza proposto ai nuovi cantieri"
                  largo
                  descrizione={
                    <>
                      Indirizzo usato come sede di partenza quando si crea un cantiere senza indicarla. La sede
                      predefinita e le sedi collegate ai cantieri si gestiscono nella pagina{' '}
                      <Link href="/office/kantiere/sedi" className="font-medium text-primary hover:underline">
                        Sedi
                      </Link>
                      .
                    </>
                  }
                >
                  <Input
                    id="sede-partenza"
                    type="text"
                    placeholder="es. Via Roma 1, Milano"
                    maxLength={300}
                    value={valori.sedePartenzaDefault}
                    onChange={(e) => imposta('sedePartenzaDefault', e.target.value)}
                  />
                </Campo>
              </div>
            </div>
          )}

          {sezione === 'approvazione' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={CheckCircle2}
                title="Approvazione giornate"
                description="Approvazione automatica delle giornate e soglia oltre la quale restano da verificare."
              />
              <div className="space-y-4">
                <Campo
                  id="auto-approva"
                  etichetta="Approvazione automatica"
                  predefinito="attivo"
                  descrizione="Attivo: una giornata chiusa, non in pausa ed entro la soglia di verifica è approvata automaticamente; le altre restano da verificare. Disattivo: ogni giornata resta da verificare."
                >
                  <Interruttore
                    id="auto-approva"
                    attivo={valori.autoApprovaRapportini}
                    onChange={(b) => imposta('autoApprovaRapportini', b)}
                  />
                </Campo>
                <Campo
                  id="soglia-verifica"
                  etichetta="Soglia di verifica"
                  predefinito="10:00"
                  errore={erroreDi('anomaliaTurnoOreMax')}
                  descrizione="Ore di lavoro giornaliere, pause escluse, oltre le quali la giornata non si approva automaticamente. La stessa soglia è usata dalla pagina Anomalie e dall’avviso della dashboard."
                >
                  <Numero
                    id="soglia-verifica"
                    valore={valori.anomaliaTurnoOreMax}
                    onChange={(n) => imposta('anomaliaTurnoOreMax', n)}
                    min={1}
                    max={24}
                    step={0.5}
                    unita="ore"
                    errore={errori.has('anomaliaTurnoOreMax')}
                  />
                </Campo>
                {soglieIncoerenti ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    La soglia di verifica ({hm(valori.anomaliaTurnoOreMax)}) è inferiore all’orario ordinario (
                    {hmMin(orarioMin)}): le giornate ordinarie complete resteranno da verificare.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {sezione === 'anomalie' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={AlertTriangle}
                title="Anomalie"
                description="Controlli mostrati nella pagina Anomalie."
              />
              <div className="space-y-4">
                {ANOMALIE.map(({ key, titolo, descrizione }) => (
                  <Campo
                    key={key}
                    id={`anomalia-${key}`}
                    etichetta={titolo}
                    descrizione={
                      key === 'ore_eccessive' && !errori.has('anomaliaTurnoOreMax')
                        ? `Ore di lavoro oltre la soglia di verifica (${hm(valori.anomaliaTurnoOreMax)}).`
                        : descrizione
                    }
                  >
                    <Interruttore
                      id={`anomalia-${key}`}
                      attivo={valori.anomalie[key]}
                      onChange={(b) => imposta('anomalie', { ...valori.anomalie, [key]: b })}
                    />
                  </Campo>
                ))}
              </div>
            </div>
          )}

          {sezione === 'kontabilita' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={Calculator}
                title="Kontabilità"
                description="Spese di cantiere registrate dall’app e dall’ufficio."
              />
              <Campo
                id="kontabilita-attiva"
                etichetta="Kontabilità"
                predefinito="attivo"
                descrizione="Attivo: le spese di cantiere sono disponibili nell’app e in ufficio. Disattivo: le pagine delle spese non sono visibili; le spese registrate restano conservate."
              >
                <Interruttore
                  id="kontabilita-attiva"
                  attivo={valori.kontabilitaAttiva}
                  onChange={(b) => imposta('kontabilitaAttiva', b)}
                />
              </Campo>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button size="sm" onClick={() => void handleSalva()} disabled={isPending || !modificato}>
          {isPending ? 'Salvataggio…' : 'Salva'}
        </Button>
        {modificato && !isPending && !esito ? (
          <span className="text-xs text-amber-700">Modifiche non salvate</span>
        ) : null}
        {esito?.ok ? <span className="text-sm text-emerald-700">Salvato</span> : null}
        {esito && !esito.ok ? <span className="text-sm text-destructive">{esito.error}</span> : null}
      </div>
    </div>
  );
}
