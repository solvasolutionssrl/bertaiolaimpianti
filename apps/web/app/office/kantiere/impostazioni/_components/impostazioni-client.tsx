'use client';

import * as React from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Calculator,
  KeyRound,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, Input, Label, cn } from '@kommessa/ui';
import { salvaImpostazioniKantiere } from '../../../_actions/kantiere-impostazioni';
import { useConfirm } from '@/app/_components/confirm-provider';

type AnomalieConfig = {
  incomplete: boolean;
  straordinari: boolean;
  senza_rapportino: boolean;
  modificato: boolean;
  festivo: boolean;
  weekend: boolean;
  ore_eccessive: boolean;
};

interface Props {
  soglia: number;
  sede: string;
  anomalie: AnomalieConfig;
  anomalie_ore_max: number;
  arrotondamentoViaggio: number;
  arrotondamentoOre: number;
  autoApprovaRapportini: boolean;
  anomaliaTurnoOreMax: number;
  sogliaPausaPranzoOre: number;
  sogliaAutoSpegnimentoPausaOre: number;
  kontabilitaAttiva: boolean;
  // Turni & calcoli
  tolleranzaChiusuraMin: number;
  splitFineTurnoAttivo: boolean;
  kmSwitchAttivo: boolean;
  passoMinutiStepper: number;
  avvioTurnoLibero: boolean;
  registraGiornataAttivo: boolean;
  codiceAzienda: string | null;
}

const ANOMALIE_ETICHETTE: { key: keyof AnomalieConfig; label: string }[] = [
  { key: 'incomplete', label: 'Giornate incomplete (ingresso/uscita sbilanciati)' },
  { key: 'straordinari', label: 'Ore straordinarie' },
  { key: 'senza_rapportino', label: 'Dipendenti senza rapportino' },
  { key: 'modificato', label: "Rapportini modificati dopo l'invio" },
  { key: 'festivo', label: 'Ore in giorno festivo' },
  { key: 'weekend', label: 'Ore nel weekend' },
  { key: 'ore_eccessive', label: 'Ore giornaliere oltre soglia (possibile doppio inserimento)' },
];

/** Formatta un valore in ORE (decimale) come "H:MM". Es. 1.5 → "1:30". */
function oreLabel(h: number): string {
  const totMin = Math.max(0, Math.round(h * 60));
  return `${Math.floor(totMin / 60)}:${String(totMin % 60).padStart(2, '0')}`;
}

type SezioneId = 'ore' | 'turni' | 'approvazione' | 'anomalie' | 'cantieri' | 'kontabilita';

const SEZIONI: { id: SezioneId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ore', label: 'Ore e calcolo', icon: Clock },
  { id: 'turni', label: 'Turni & calcoli', icon: SlidersHorizontal },
  { id: 'approvazione', label: 'Approvazione presenze', icon: CheckCircle2 },
  { id: 'anomalie', label: 'Anomalie da segnalare', icon: AlertTriangle },
  { id: 'cantieri', label: 'Cantieri', icon: MapPin },
  { id: 'kontabilita', label: 'Kontabilità', icon: Calculator },
];

/** Riga toggle compatta riusabile. */
function ToggleRow({
  id,
  checked,
  onChange,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <label htmlFor={id} className="cursor-pointer space-y-0.5">
        <span className="block text-sm font-medium leading-snug">{title}</span>
        {description ? (
          <span className="block text-xs leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

/** Intestazione di sezione con icona accent. */
function SezioneHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ImpostazioniClient({
  soglia,
  sede,
  anomalie,
  anomalie_ore_max,
  arrotondamentoViaggio,
  arrotondamentoOre,
  autoApprovaRapportini,
  anomaliaTurnoOreMax,
  sogliaPausaPranzoOre,
  sogliaAutoSpegnimentoPausaOre,
  kontabilitaAttiva,
  tolleranzaChiusuraMin,
  splitFineTurnoAttivo,
  kmSwitchAttivo,
  passoMinutiStepper,
  avvioTurnoLibero,
  registraGiornataAttivo,
  codiceAzienda,
}: Props) {
  const askConfirm = useConfirm();
  const [sezione, setSezione] = React.useState<SezioneId>('ore');
  const [sogliaOreOrdinarie, setSogliaOreOrdinarie] = React.useState<number>(soglia);
  const [sedePartenzaDefault, setSedePartenzaDefault] = React.useState<string>(sede);
  const [anomalieState, setAnomalieState] = React.useState<AnomalieConfig>(anomalie);
  const [oreMax, setOreMax] = React.useState<number>(anomalie_ore_max);
  const [arrViaggio, setArrViaggio] = React.useState<number>(arrotondamentoViaggio);
  const [arrOre, setArrOre] = React.useState<number>(arrotondamentoOre);
  const [autoApprova, setAutoApprova] = React.useState<boolean>(autoApprovaRapportini);
  const [sogliaTurno, setSogliaTurno] = React.useState<number>(anomaliaTurnoOreMax);
  const [sogliaPausa, setSogliaPausa] = React.useState<number>(sogliaPausaPranzoOre);
  const [sogliaAutoPausa, setSogliaAutoPausa] = React.useState<number>(sogliaAutoSpegnimentoPausaOre);
  const [kontabilita, setKontabilita] = React.useState<boolean>(kontabilitaAttiva);
  // Turni & calcoli
  const [tolleranza, setTolleranza] = React.useState<number>(tolleranzaChiusuraMin);
  const [splitAttivo, setSplitAttivo] = React.useState<boolean>(splitFineTurnoAttivo);
  const [kmSwitch, setKmSwitch] = React.useState<boolean>(kmSwitchAttivo);
  const [passoMin, setPassoMin] = React.useState<number>(passoMinutiStepper);
  const [avvioLibero, setAvvioLibero] = React.useState<boolean>(avvioTurnoLibero);
  const [registraGiornata, setRegistraGiornata] = React.useState<boolean>(registraGiornataAttivo);
  const [esito, setEsito] = React.useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function toggleAnomalia(key: keyof AnomalieConfig) {
    setAnomalieState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function salvaOra() {
    setEsito(null);
    startTransition(async () => {
      const result = await salvaImpostazioniKantiere({
        sogliaOreOrdinarie,
        sedePartenzaDefault,
        anomalie: anomalieState,
        anomalie_ore_max: oreMax,
        arrotondamentoViaggioMin: arrViaggio,
        arrotondamentoOreMin: arrOre,
        autoApprovaRapportini: autoApprova,
        anomaliaTurnoOreMax: sogliaTurno,
        sogliaPausaPranzoOre: sogliaPausa,
        sogliaAutoSpegnimentoPausaOre: sogliaAutoPausa,
        kontabilitaAttiva: kontabilita,
        tolleranzaChiusuraMin: tolleranza,
        splitFineTurnoAttivo: splitAttivo,
        kmSwitchAttivo: kmSwitch,
        passoMinutiStepper: passoMin as 5 | 10 | 15 | 30,
        avvioTurnoLibero: avvioLibero,
        registraGiornataAttivo: registraGiornata,
      });
      setEsito(result);
    });
  }

  async function handleSalva() {
    // Modifiche che incidono sui turni / approvazioni futuri: conferma esplicita.
    const cambiatoViaggio = arrViaggio !== arrotondamentoViaggio;
    const cambiatoOre = arrOre !== arrotondamentoOre;
    const cambiatoAutoApprova = autoApprova !== autoApprovaRapportini;
    const cambiatoSogliaTurno = sogliaTurno !== anomaliaTurnoOreMax;

    const parti: string[] = [];
    if (cambiatoViaggio) parti.push(`tempo di viaggio arrotondato a ${arrViaggio} min`);
    if (cambiatoOre)
      parti.push(
        arrOre === 0
          ? 'ore lavoro senza arrotondamento (dettaglio pieno)'
          : `ore lavoro arrotondate a ${arrOre} min`,
      );
    if (cambiatoAutoApprova)
      parti.push(
        autoApprova
          ? 'auto-approvazione delle giornate attiva'
          : 'auto-approvazione delle giornate disattivata',
      );
    if (cambiatoSogliaTurno) parti.push(`soglia anomalia turno a ${sogliaTurno} ore`);
    if (sogliaPausa !== sogliaPausaPranzoOre)
      parti.push(`promemoria pausa pranzo oltre ${sogliaPausa} ore di turno`);
    if (sogliaAutoPausa !== sogliaAutoSpegnimentoPausaOre)
      parti.push(`auto-spegnimento pausa dimenticata dopo ${oreLabel(sogliaAutoPausa)}`);

    if (parti.length > 0) {
      const ok = await askConfirm({
        title: 'Confermi le modifiche?',
        description: `Da ora in avanti: ${parti.join('; ')}. Vale solo per i turni e le giornate calcolati d'ora in poi; quanto già registrato non cambia.`,
        confirmLabel: 'Sì, applica',
        cancelLabel: 'Annulla',
      });
      if (!ok) return;
    }
    salvaOra();
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 960 }}>
      {/* Codice azienda: chip compatto sola lettura. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Codice azienda (accesso tecnici):</span>
        {codiceAzienda ? (
          <code className="rounded bg-background px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
            {codiceAzienda}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">non impostato, contatta SOLVA</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* Section nav */}
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
                  attiva
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
          {sezione === 'ore' && (
            <div className="space-y-5">
              <SezioneHeader
                icon={Clock}
                title="Ore e calcolo"
                description="Soglia di straordinario e arrotondamenti di viaggio e ore lavorate."
              />
              <div className="space-y-1.5">
                <Label htmlFor="soglia-ore">Soglia ore ordinarie al giorno</Label>
                <Input
                  id="soglia-ore"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={sogliaOreOrdinarie}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setSogliaOreOrdinarie(v);
                  }}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Le ore oltre questa soglia diventano straordinario.
                </p>
              </div>

              <div className="grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="arr-viaggio">Tempo di viaggio, arrotonda a (min)</Label>
                  <Input
                    id="arr-viaggio"
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    value={arrViaggio}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setArrViaggio(Math.min(60, Math.max(1, v)));
                    }}
                    className="w-32"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Il tempo stimato di un viaggio viene arrotondato a questo passo. Es. con 5: 4 min
                    contano 5, 12 min contano 10. Vale per i viaggi timbrati{' '}
                    <strong>da ora in poi</strong>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="arr-ore">Ore di lavoro, arrotonda a (min)</Label>
                  <Input
                    id="arr-ore"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={arrOre}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setArrOre(Math.min(60, Math.max(0, v)));
                    }}
                    className="w-32"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <strong>0 = nessun arrotondamento</strong> (consigliato): le ore restano al
                    minuto e potrai arrotondarle a fine mese nel report. Imposta un valore (es. 15)
                    solo per arrotondare già i turni futuri.
                  </p>
                </div>
              </div>
            </div>
          )}

          {sezione === 'turni' && (
            <div className="space-y-5">
              <SezioneHeader
                icon={SlidersHorizontal}
                title="Turni & calcoli"
                description="Come i tecnici avviano e chiudono i turni e come si calcolano le ore alla chiusura."
              />

              <div className="space-y-1.5">
                <Label htmlFor="tolleranza">Tolleranza chiusura (min)</Label>
                <Input
                  id="tolleranza"
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={tolleranza}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setTolleranza(Math.min(30, Math.max(0, v)));
                  }}
                  className="w-32"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Quando si dividono le ore tra più cantieri, se la somma è entro questi minuti dal
                  totale si salva lo stesso (l&apos;ultimo cantiere assorbe il piccolo resto). Evita
                  di dover pareggiare i minuti dispari, es. un turno di 7:03. <strong>Default 5.</strong>
                </p>
              </div>

              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="passo">Passo dei tasti +/- (min)</Label>
                <select
                  id="passo"
                  value={passoMin}
                  onChange={(e) => setPassoMin(parseInt(e.target.value, 10))}
                  className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {[5, 10, 15, 30].map((p) => (
                    <option key={p} value={p}>
                      {p} min
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Di quanti minuti aumentano o diminuiscono i tasti +/- quando si inseriscono le ore.
                  <strong> Default 15.</strong>
                </p>
              </div>

              <div className="space-y-4 border-t border-border pt-4">
                <ToggleRow
                  id="split-attivo"
                  checked={splitAttivo}
                  onChange={() => setSplitAttivo((v) => !v)}
                  title="Split «cosa hai fatto oggi» alla chiusura"
                  description={
                    <>
                      Alla chiusura manuale del turno il tecnico può dividere le ore tra più
                      cantieri. Se disattivi, la chiusura resta su un solo cantiere.
                    </>
                  }
                />
                <ToggleRow
                  id="avvio-libero"
                  checked={avvioLibero}
                  onChange={() => setAvvioLibero((v) => !v)}
                  title="Avvio turno su qualsiasi cantiere"
                  description={
                    <>
                      I tecnici vedono e possono avviare un turno su <strong>tutti</strong> i
                      cantieri. Se disattivi, vedono solo quelli con un QR attivo.
                    </>
                  }
                />
                <ToggleRow
                  id="km-switch"
                  checked={kmSwitch}
                  onChange={() => setKmSwitch((v) => !v)}
                  title="Km del tragitto tra cantieri (cambio cantiere)"
                  description={
                    <>
                      Quando un tecnico cambia cantiere durante il turno, calcola i km del tragitto
                      e li attribuisce al nuovo cantiere. Richiede il provider Google.{' '}
                      <strong>Default disattivo.</strong>
                    </>
                  }
                />
                <ToggleRow
                  id="registra-giornata"
                  checked={registraGiornata}
                  onChange={() => setRegistraGiornata((v) => !v)}
                  title="Registra giornata senza timbrature"
                  description={
                    <>
                      Permette al tecnico di registrare una giornata anche se non ha mai timbrato
                      (inserendo inizio, fine e cantieri).
                    </>
                  }
                />
              </div>
            </div>
          )}

          {sezione === 'approvazione' && (
            <div className="space-y-5">
              <SezioneHeader
                icon={CheckCircle2}
                title="Approvazione presenze"
                description="Auto-approvazione delle giornate e soglia di anomalia per turno."
              />
              <ToggleRow
                id="auto-approva"
                checked={autoApprova}
                onChange={() => setAutoApprova((v) => !v)}
                title="Auto-approva le giornate"
                description={
                  <>
                    Le giornate con turno chiuso ed entro la soglia di ore vengono approvate in
                    automatico. Le giornate ancora aperte o oltre soglia restano sempre{' '}
                    <strong>da verificare</strong>. Se disattivi, ogni giornata va verificata a
                    mano.
                  </>
                }
              />
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="soglia-turno">Soglia anomalia turno (ore)</Label>
                <Input
                  id="soglia-turno"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={sogliaTurno}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setSogliaTurno(v);
                  }}
                  className="w-32"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Le giornate con più ore lavorate di questo valore (pause escluse) vengono segnalate
                  come <strong>da verificare</strong> invece di essere approvate in automatico. Vale
                  per le giornate calcolate <strong>da ora in poi</strong>.
                </p>
              </div>
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="soglia-pausa">Promemoria pausa pranzo (ore di turno)</Label>
                <Input
                  id="soglia-pausa"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={sogliaPausa}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setSogliaPausa(v);
                  }}
                  className="w-32"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Quando si chiude un turno più lungo di questo valore <strong>senza aver timbrato
                  una pausa</strong>, l&apos;app (sia da QR sia dal tasto in-app) ricorda di
                  dichiarare la pausa pranzo e propone 30/45/60 min. Se la pausa è già timbrata, nessun
                  avviso.
                </p>
              </div>
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="soglia-auto-pausa">Auto-spegnimento pausa dimenticata (ore)</Label>
                <Input
                  id="soglia-auto-pausa"
                  type="number"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={sogliaAutoPausa}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setSogliaAutoPausa(Math.min(8, Math.max(0.5, v)));
                  }}
                  className="w-32"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Se una pausa pranzo resta avviata più a lungo di questo tempo, viene{' '}
                  <strong>chiusa in automatico</strong> e il turno riprende da solo: vengono scalati
                  esattamente {oreLabel(sogliaAutoPausa)} di pausa. Serve a non perdere ore quando ci
                  si dimentica di riprendere il turno. Vale <strong>da ora in poi</strong>.
                </p>
              </div>
            </div>
          )}

          {sezione === 'anomalie' && (
            <div className="space-y-4">
              <SezioneHeader
                icon={AlertTriangle}
                title="Anomalie da segnalare"
                description="Controlli eseguiti nella pagina Anomalie."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {ANOMALIE_ETICHETTE.map(({ key, label }) => (
                  <ToggleRow
                    key={key}
                    id={`anomalia-${key}`}
                    checked={anomalieState[key]}
                    onChange={() => toggleAnomalia(key)}
                    title={label}
                  />
                ))}
              </div>

              {anomalieState.ore_eccessive && (
                <div className="space-y-1.5 border-t border-border pt-4">
                  <Label htmlFor="ore-max">Ore massime giornaliere (soglia doppio inserimento)</Label>
                  <Input
                    id="ore-max"
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={oreMax}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setOreMax(v);
                    }}
                    className="w-32"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Se la somma di ore ordinarie e straordinarie supera questo valore in un giorno,
                    viene segnalata come possibile doppio inserimento.
                  </p>
                </div>
              )}
            </div>
          )}

          {sezione === 'cantieri' && (
            <div className="space-y-5">
              <SezioneHeader
                icon={MapPin}
                title="Cantieri"
                description="Punto di partenza usato come base per i nuovi cantieri."
              />
              <div className="space-y-1.5">
                <Label htmlFor="sede-partenza">Sede di partenza predefinita</Label>
                <Input
                  id="sede-partenza"
                  type="text"
                  placeholder="es. Via Roma 1, Milano"
                  maxLength={300}
                  value={sedePartenzaDefault}
                  onChange={(e) => setSedePartenzaDefault(e.target.value)}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Usata come base per i nuovi cantieri; serve al calcolo dei chilometri di viaggio.
                </p>
              </div>
            </div>
          )}

          {sezione === 'kontabilita' && (
            <div className="space-y-5">
              <SezioneHeader
                icon={Calculator}
                title="Kontabilità"
                description="Modulo di gestione contabile collegato alle presenze."
              />
              <ToggleRow
                id="kontabilita-attiva"
                checked={kontabilita}
                onChange={() => setKontabilita((v) => !v)}
                title={
                  <span className="inline-flex items-center gap-2">
                    Modulo Kontabilità attivo
                    <span
                      className={cn(
                        'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium leading-none',
                        kontabilita
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {kontabilita ? 'Attivo' : 'Disattivo'}
                    </span>
                  </span>
                }
                description={
                  <>
                    Se attivo, le voci di Kontabilità sono disponibili per il tenant. Disattivalo per
                    nascondere il modulo senza perdere i dati già registrati.
                  </>
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Barra azioni */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSalva} disabled={isPending}>
          {isPending ? 'Salvataggio...' : 'Salva'}
        </Button>
        {esito !== null && esito.ok && <span className="text-sm text-green-600">Salvato</span>}
        {esito !== null && !esito.ok && (
          <span className="text-sm text-destructive">
            Errore: {(esito as { ok: false; error: string }).error}
          </span>
        )}
      </div>
    </div>
  );
}
