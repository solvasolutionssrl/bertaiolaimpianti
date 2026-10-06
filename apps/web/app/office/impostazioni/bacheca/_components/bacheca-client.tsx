'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, MonitorPlay, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, Input, Label } from '@kommessa/ui';
import {
  BACHECA_GIORNI_SESSIONE,
  BACHECA_PASSWORD_MIN,
  urlBacheca,
  validaPasswordBacheca,
} from '@kommessa/api/bacheca';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import {
  accendiBacheca,
  cambiaPasswordBacheca,
  riaccendiBacheca,
  rigeneraIndirizzoBacheca,
  spegniBacheca,
} from '../_actions';

export interface BachecaVista {
  token: string;
  attiva: boolean;
  aperture: number;
  ultimaAperturaAt: string | null;
  createdAt: string;
}

/**
 * Governare la bacheca.
 *
 * Due leve distinte, e tenerle separate è il punto: **cambiare la password**
 * non tocca l'indirizzo (il televisore in ufficio continua a funzionare,
 * perché è già entrato), mentre **rigenerare l'indirizzo** butta fuori tutti.
 * Sono due risposte a due problemi diversi — «la password gira troppo» e «non
 * voglio più che quell'indirizzo funzioni» — e un tasto solo non saprebbe quale
 * dei due stai risolvendo.
 */
export function BachecaClient({
  vista,
  canEdit,
}: {
  vista: BachecaVista | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const avvisa = useAlert();
  const chiedi = useConfirm();
  const [password, setPassword] = React.useState('');
  const [errore, setErrore] = React.useState<string | null>(null);
  const [copiato, setCopiato] = React.useState(false);
  const [inCorso, avvia] = React.useTransition();

  const origine = typeof window !== 'undefined' ? window.location.origin : '';
  const url = vista ? urlBacheca(origine, vista.token) : null;

  async function copia() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      await avvisa({
        title: 'Copia non riuscita',
        body: 'Selezionate l’indirizzo e copiatelo a mano.',
      });
    }
  }

  function salvaPassword(prima: boolean) {
    setErrore(null);
    const v = validaPasswordBacheca(password);
    if (!v.ok) {
      setErrore(v.motivo);
      return;
    }
    avvia(async () => {
      const r = prima
        ? await accendiBacheca({ password })
        : await cambiaPasswordBacheca({ password });
      if (!r.ok) {
        setErrore(r.error);
        return;
      }
      setPassword('');
      router.refresh();
    });
  }

  // ── Non c'è ancora: si accende ──
  if (!vista) {
    return (
      <Card>
        <CardContent className="max-w-xl space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MonitorPlay aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">La bacheca non è ancora accesa.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scegliete una password: quella si batte una volta sul televisore,
                e poi resta aperto per {BACHECA_GIORNI_SESSIONE} giorni. Chi apre
                l’indirizzo senza la password non vede niente — nemmeno di chi è.
              </p>
            </div>
          </div>

          {canEdit ? (
            <div className="space-y-2">
              <Label htmlFor="b_pw">Password della bacheca</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="b_pw"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Almeno ${BACHECA_PASSWORD_MIN} caratteri`}
                  className="max-w-xs font-mono"
                  autoComplete="off"
                />
                <Button size="sm" onClick={() => salvaPassword(true)} disabled={inCorso}>
                  Accendi la bacheca
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                In chiaro di proposito: è una password da ufficio, da leggere
                mentre la si batte sul telecomando. Non è la password di
                nessuno.
              </p>
              {errore ? (
                <p role="alert" className="text-sm text-destructive">
                  {errore}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  // ── C'è: indirizzo, numeri, e le due leve ──
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {vista.attiva ? 'Accesa' : 'Spenta'}
            </p>
            <span className="text-xs text-muted-foreground">
              {vista.aperture === 0
                ? 'mai aperta'
                : `aperta ${vista.aperture} ${vista.aperture === 1 ? 'volta' : 'volte'}`}
              {vista.ultimaAperturaAt
                ? ` · l’ultima ${new Date(vista.ultimaAperturaAt).toLocaleString('it-IT', {
                    timeZone: 'Europe/Rome',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              {url}
            </code>
            <Button size="sm" variant="outline" onClick={copia} className="shrink-0">
              {copiato ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {copiato ? 'Copiato' : 'Copia'}
            </Button>
            {url ? (
              <Button size="sm" variant="outline" asChild className="shrink-0">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Apri
                </a>
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            L’indirizzo si può rileggere da qui: non è il segreto, lo è la
            password.
          </p>
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="b_pw2">Cambia la password</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="b_pw2"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Almeno ${BACHECA_PASSWORD_MIN} caratteri`}
                  className="max-w-xs font-mono"
                  autoComplete="off"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => salvaPassword(false)}
                  disabled={inCorso || password.length === 0}
                >
                  Salva
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                I televisori già aperti restano aperti: la password serve a
                entrare, non a restare.
              </p>
              {errore ? (
                <p role="alert" className="text-sm text-destructive">
                  {errore}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={inCorso}
                onClick={async () => {
                  const ok = await chiedi({
                    title: 'Rigenerare l’indirizzo?',
                    description:
                      'Quello di adesso smette di funzionare subito, e tutti i televisori già aperti vengono chiusi: andranno ribattuti a mano con l’indirizzo nuovo.',
                    confirmLabel: 'Rigenera',
                  });
                  if (!ok) return;
                  avvia(async () => {
                    const r = await rigeneraIndirizzoBacheca();
                    if (!r.ok) {
                      await avvisa({ title: 'Non riuscito', body: r.error });
                      return;
                    }
                    router.refresh();
                  });
                }}
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Rigenera l’indirizzo
              </Button>

              {vista.attiva ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={inCorso}
                  onClick={async () => {
                    const ok = await chiedi({
                      title: 'Spegnere la bacheca?',
                      description:
                        'L’indirizzo smette di mostrare qualcosa. Non si perde niente: riaccendendola torna com’era, stesso indirizzo e stessa password.',
                      confirmLabel: 'Spegni',
                      destructive: true,
                    });
                    if (!ok) return;
                    avvia(async () => {
                      const r = await spegniBacheca();
                      if (!r.ok) await avvisa({ title: 'Non riuscito', body: r.error });
                      router.refresh();
                    });
                  }}
                >
                  Spegni
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={inCorso}
                  onClick={() =>
                    avvia(async () => {
                      const r = await riaccendiBacheca();
                      if (!r.ok) await avvisa({ title: 'Non riuscito', body: r.error });
                      router.refresh();
                    })
                  }
                >
                  Riaccendi
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
