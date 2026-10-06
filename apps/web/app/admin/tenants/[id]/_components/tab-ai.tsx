'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Mic, Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';
import {
  accettaVocabolario,
  nomeModelloPlausibile,
} from '@kommessa/api/trascrizione';

import { aggiornaModelloTrascrizione } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

/**
 * Quale modello di trascrizione usa QUESTO cliente.
 *
 * ## Qui non c'è nessun catalogo, ed è il punto
 *
 * La versione precedente elencava in codice nome, prezzo e descrizione di ogni
 * modello OpenAI. Si rompeva da sola: andava riscritta a mano a ogni nuovo
 * modello, e finché nessuno la riscriveva ogni cliente restava fermo alla
 * scelta del giorno dell'installazione.
 *
 * Ora l'elenco arriva dal database (`platform_settings`, riga
 * `modelli_trascrizione`) ed è solo un **suggerimento**: il campo libero in
 * fondo accetta qualunque nome, così un modello uscito stamattina si prova
 * subito.
 *
 * Dei modelli non diciamo più né il prezzo né quanto sono bravi: sono cose di
 * OpenAI, cambiano senza avvisarci, e una tabella di prezzi vecchia è peggio di
 * nessuna tabella. L'unica cosa che dichiariamo è quella che il nostro codice
 * sa davvero, perché la deduce dal nome: **se accetta il vocabolario del
 * cliente**, cioè i comuni dell'anagrafica e le lavorazioni a catalogo.
 */

export function TabAi({
  tenantId,
  tenantNome,
  currentModel,
  predefinitoPiattaforma,
  proposti,
}: {
  tenantId: string;
  tenantNome: string;
  /** La scelta di questo cliente. `null` = segue il predefinito. */
  currentModel: string | null;
  /** Il predefinito di piattaforma, da `platform_settings`. */
  predefinitoPiattaforma: string | null;
  /** I nomi che il pannello propone. Suggerimenti, non permessi. */
  proposti: string[];
}) {
  const router = useRouter();
  const alert = useAlert();
  const [scelto, setScelto] = React.useState<string | null>(currentModel);
  const [altro, setAltro] = React.useState(
    currentModel && !proposti.includes(currentModel) ? currentModel : '',
  );
  const [salvando, setSalvando] = React.useState(false);

  const cambiato = scelto !== currentModel;
  const altroStorto = altro.trim().length > 0 && !nomeModelloPlausibile(altro);

  async function salva() {
    setSalvando(true);
    const r = await aggiornaModelloTrascrizione({ tenantId, model: scelto });
    setSalvando(false);
    if (!r.ok) {
      await alert({ title: 'Non salvato', body: r.error });
      return;
    }
    router.refresh();
  }

  // La voce «segue il predefinito» è un'opzione come le altre, in cima.
  const voci: Array<{ valore: string | null; etichetta: string }> = [
    { valore: null, etichetta: 'Segue il predefinito di piattaforma' },
    ...proposti.map((p) => ({ valore: p, etichetta: p })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Mic aria-hidden="true" className="h-4 w-4 text-primary" />
            Trascrizione delle note vocali
          </p>
          <p className="text-sm text-muted-foreground">
            Quale modello trascrive l&apos;audio dettato dai tecnici di{' '}
            <strong>{tenantNome}</strong>. Lasciandolo sul predefinito, il
            cliente segue le scelte di piattaforma e si aggiorna da solo quando
            cambiamo modello per tutti.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {voci.map((v) => {
          const attiva = scelto === v.valore;
          const vocab = v.valore ? accettaVocabolario(v.valore) : null;
          return (
            <button
              key={v.valore ?? '(predefinito)'}
              type="button"
              onClick={() => {
                setScelto(v.valore);
                setAltro('');
              }}
              className={cn(
                'flex items-start justify-between gap-3 rounded-lg border p-3 text-left transition',
                attiva ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40',
              )}
            >
              <span className="min-w-0 space-y-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{v.etichetta}</span>
                  {v.valore === null && predefinitoPiattaforma ? (
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      oggi: {predefinitoPiattaforma}
                    </Badge>
                  ) : null}
                  {v.valore === currentModel ? (
                    <Badge variant="outline" className="text-[10px]">
                      Attivo
                    </Badge>
                  ) : null}
                </span>
                {vocab === true ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <Sparkles aria-hidden="true" className="h-3 w-3" />
                    Riceve il vocabolario del cliente: comuni in anagrafica e
                    lavorazioni a catalogo
                  </span>
                ) : null}
                {vocab === false ? (
                  <span className="block text-xs text-muted-foreground">
                    Non riceve il vocabolario del cliente: i nomi dei paesi
                    vengono trascritti a orecchio
                  </span>
                ) : null}
              </span>
              {attiva ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <label
            htmlFor="modello-altro"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Un altro modello
          </label>
          <p className="text-xs text-muted-foreground">
            Il nome esatto come lo chiama OpenAI. Serve per provare subito un
            modello appena uscito, senza aspettare un aggiornamento dell&apos;app.
          </p>
          <Input
            id="modello-altro"
            value={altro}
            onChange={(e) => {
              setAltro(e.target.value);
              const v = e.target.value.trim();
              setScelto(v.length > 0 ? v : null);
            }}
            placeholder="per esempio gpt-transcribe-2"
            className={cn('font-mono text-sm', altroStorto && 'border-destructive')}
            aria-invalid={altroStorto}
          />
          {altroStorto ? (
            <p className="text-xs text-destructive">
              Lettere, cifre, punti e trattini. Senza spazi e senza virgole.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {cambiato ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setScelto(currentModel);
              setAltro(
                currentModel && !proposti.includes(currentModel) ? currentModel : '',
              );
            }}
            disabled={salvando}
          >
            Annulla
          </Button>
        ) : null}
        <Button size="sm" onClick={salva} disabled={!cambiato || altroStorto || salvando}>
          {salvando ? (
            <>
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              Salvo
            </>
          ) : (
            'Applica'
          )}
        </Button>
      </div>
    </div>
  );
}
