'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { Button, Card, CardContent } from '@kommessa/ui';

import { endImpersonation } from '../../admin/_actions/tenants';

/**
 * «Stai guardando l'app come questa persona: esci o continui?»
 *
 * ⚠️ Il ritorno è un tasto, non un collegamento: chiude una sessione e ne apre
 * un'altra, cioè cambia lo stato. Un collegamento lo potrebbe seguire il tasto
 * «indietro», o un prelettura del browser.
 */
export function BivioImpersonazione({
  chi,
  admin,
  dentro,
  scadeAt,
}: {
  chi: string;
  admin: string;
  dentro: string;
  scadeAt: number;
}) {
  const [pending, start] = React.useTransition();

  // Quanto resta, in minuti interi. Si calcola nel client dopo il montaggio:
  // un conto sull'orologio fatto nel render di un componente servito dal
  // server darebbe due valori diversi fra server e browser.
  const [restano, setRestano] = React.useState<number | null>(null);
  React.useEffect(() => {
    const calcola = () => setRestano(Math.max(0, Math.round((scadeAt - Date.now()) / 60000)));
    calcola();
    const id = setInterval(calcola, 30_000);
    return () => clearInterval(id);
  }, [scadeAt]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 p-6">
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Eye className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <h1 className="text-base font-semibold tracking-tight">
                Stai guardando l&apos;app come un&apos;altra persona
              </h1>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{chi}</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            La console di piattaforma non si apre finché sei dentro un cliente: il tuo accesso in
            questo momento è quello di quella persona. Qui scegli.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  // Fa un rimando: sotto questa riga non si arriva.
                  await endImpersonation();
                })
              }
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Torna alla console come {admin}
            </Button>
            <Button asChild size="sm" variant="outline" disabled={pending}>
              <Link href={dentro}>
                Continua a guardare
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {restano !== null ? (
            <p className="text-xs text-muted-foreground">
              {restano > 0
                ? `Si chiude da sé fra ${restano} ${restano === 1 ? 'minuto' : 'minuti'} se non torni prima.`
                : 'Sta scadendo: torna alla console per riprendere il tuo accesso.'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
