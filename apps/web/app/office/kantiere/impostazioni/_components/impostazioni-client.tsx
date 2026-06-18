'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Label } from '@kommessa/ui';
import { salvaImpostazioniKantiere } from '../../../_actions/kantiere-impostazioni';

interface Props {
  soglia: number;
  sede: string;
}

export function ImpostazioniClient({ soglia, sede }: Props) {
  const [sogliaOreOrdinarie, setSogliaOreOrdinarie] = React.useState<number>(soglia);
  const [sedePartenzaDefault, setSedePartenzaDefault] = React.useState<string>(sede);
  const [esito, setEsito] = React.useState<{ ok: true } | { ok: false; error: string } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSalva() {
    setEsito(null);
    startTransition(async () => {
      const result = await salvaImpostazioniKantiere({ sogliaOreOrdinarie, sedePartenzaDefault });
      setEsito(result);
    });
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
