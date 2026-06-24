'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label } from '@kommessa/ui';
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

export function ImpostazioniClient({
  soglia,
  sede,
  anomalie,
  anomalie_ore_max,
  arrotondamentoViaggio,
  arrotondamentoOre,
}: Props) {
  const askConfirm = useConfirm();
  const [sogliaOreOrdinarie, setSogliaOreOrdinarie] = React.useState<number>(soglia);
  const [sedePartenzaDefault, setSedePartenzaDefault] = React.useState<string>(sede);
  const [anomalieState, setAnomalieState] = React.useState<AnomalieConfig>(anomalie);
  const [oreMax, setOreMax] = React.useState<number>(anomalie_ore_max);
  const [arrViaggio, setArrViaggio] = React.useState<number>(arrotondamentoViaggio);
  const [arrOre, setArrOre] = React.useState<number>(arrotondamentoOre);
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
      });
      setEsito(result);
    });
  }

  async function handleSalva() {
    // Cambiare l'arrotondamento incide sui turni futuri: conferma esplicita.
    const cambiatoViaggio = arrViaggio !== arrotondamentoViaggio;
    const cambiatoOre = arrOre !== arrotondamentoOre;
    if (cambiatoViaggio || cambiatoOre) {
      const parti: string[] = [];
      if (cambiatoViaggio)
        parti.push(`tempo di viaggio arrotondato a ${arrViaggio} min`);
      if (cambiatoOre)
        parti.push(
          arrOre === 0
            ? 'ore lavoro senza arrotondamento (dettaglio pieno)'
            : `ore lavoro arrotondate a ${arrOre} min`,
        );
      const ok = await askConfirm({
        title: 'Confermi la modifica degli arrotondamenti?',
        description: `Da ora in avanti: ${parti.join('; ')}. Vale solo per i turni timbrati d'ora in poi; i turni già registrati non cambiano.`,
        confirmLabel: 'Sì, applica',
        cancelLabel: 'Annulla',
      });
      if (!ok) return;
    }
    salvaOra();
  }

  return (
    <div className="space-y-4" style={{ maxWidth: 640 }}>
      {/* Card: Calcolo ore */}
      <Card>
        <CardHeader>
          <CardTitle>Calcolo ore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
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
        </CardContent>
      </Card>

      {/* Card: Arrotondamenti */}
      <Card>
        <CardHeader>
          <CardTitle>Arrotondamenti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="arr-viaggio">Tempo di viaggio — arrotonda a (minuti)</Label>
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
            <p className="text-xs text-muted-foreground">
              Quando si timbra un viaggio, il tempo stimato viene arrotondato a
              questo passo. Es. con 5: un viaggio di 4 minuti conta 5 minuti, uno
              di 12 conta 10. Vale per i viaggi timbrati <strong>da ora in poi</strong>.
            </p>
          </div>

          <div className="space-y-1 border-t border-border pt-4">
            <Label htmlFor="arr-ore">Ore di lavoro — arrotonda a (minuti)</Label>
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
            <p className="text-xs text-muted-foreground">
              <strong>0 = nessun arrotondamento</strong> (consigliato): le ore
              vengono raccolte al minuto, con il massimo dettaglio, e potrai
              arrotondarle a fine mese nel report. Imposta un valore (es. 15) solo
              se vuoi arrotondare già le ore dei turni futuri.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card: Cantieri */}
      <Card>
        <CardHeader>
          <CardTitle>Cantieri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sede-partenza">Sede di partenza predefinita</Label>
            <Input
              id="sede-partenza"
              type="text"
              placeholder="es. Via Roma 1, Milano"
              maxLength={300}
              value={sedePartenzaDefault}
              onChange={(e) => setSedePartenzaDefault(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usata come base per i nuovi cantieri; servirà al calcolo dei chilometri di viaggio.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card: Anomalie */}
      <Card>
        <CardHeader>
          <CardTitle>Anomalie da segnalare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Scegli quali controlli vengono eseguiti nella pagina Anomalie.
          </p>
          <div className="space-y-3">
            {ANOMALIE_ETICHETTE.map(({ key, label }) => (
              <div key={key} className="flex items-start gap-3">
                <input
                  id={`anomalia-${key}`}
                  type="checkbox"
                  checked={anomalieState[key]}
                  onChange={() => toggleAnomalia(key)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <label
                  htmlFor={`anomalia-${key}`}
                  className="cursor-pointer text-sm leading-snug"
                >
                  {label}
                </label>
              </div>
            ))}
          </div>

          {/* Ore massime - visibile solo se ore_eccessive e' attivo */}
          {anomalieState.ore_eccessive && (
            <div className="space-y-1 border-t border-border pt-3">
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
              <p className="text-xs text-muted-foreground">
                Se la somma di ore ordinarie e straordinarie supera questo valore in un giorno, viene segnalata come possibile doppio inserimento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Azioni */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSalva} disabled={isPending}>
          {isPending ? 'Salvataggio...' : 'Salva'}
        </Button>
        {esito !== null && esito.ok && (
          <span className="text-sm text-green-600">Salvato</span>
        )}
        {esito !== null && !esito.ok && (
          <span className="text-sm text-destructive">
            Errore: {(esito as { ok: false; error: string }).error}
          </span>
        )}
      </div>
    </div>
  );
}
