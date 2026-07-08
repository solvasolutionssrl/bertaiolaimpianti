import { notFound } from 'next/navigation';
import { Scale, FileCheck2, Clock, CalendarDays } from 'lucide-react';
import { Card, CardContent, Badge } from '@kommessa/ui';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import {
  PERMESSO_TIPI,
  RETRIBUITO_LABEL,
  UNITA_LABEL,
  type Retribuito,
} from '@kommessa/api/permessi-tipi';
import { leggiConfigDipendenti } from '../../../_lib/dipendenti-config';

export const dynamic = 'force-dynamic';

function tonoRetribuito(r: Retribuito): string {
  if (r === 'no') return 'border-slate-200 bg-slate-50 text-slate-600';
  if (r === 'parziale') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export default async function TipiPermessoPage() {
  const ctx = await requireTenantContext();
  const cfg = await leggiConfigDipendenti(createServerSupabase(), ctx.tenantId);
  if (!cfg.ferieAttiva) notFound();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Scale className="h-5 w-5 text-primary" />
          Tipi di permesso e riferimenti normativi
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          I tipi di ferie e permesso richiedibili dai dipendenti, con il riferimento normativo o
          contrattuale. Set base per una PMI impiantistica (CCNL Metalmeccanico come riferimento). I
          valori di monte-ore e giorni variano per contratto, livello e anzianità, e vanno verificati
          in busta paga: qui sono indicativi.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {PERMESSO_TIPI.map((t) => (
          <Card key={t.codice} className="overflow-hidden">
            <CardContent className="space-y-2.5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">{t.label}</h2>
                <Badge
                  variant="outline"
                  className="gap-1 border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600"
                >
                  {t.unita === 'ore' ? (
                    <Clock className="h-3 w-3" />
                  ) : (
                    <CalendarDays className="h-3 w-3" />
                  )}
                  {UNITA_LABEL[t.unita]}
                </Badge>
                <Badge
                  variant="outline"
                  className={'text-[10px] font-medium ' + tonoRetribuito(t.retribuito)}
                >
                  {RETRIBUITO_LABEL[t.retribuito]}
                </Badge>
                {t.richiedeGiustificativo ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-sky-200 bg-sky-50 text-[10px] font-medium text-sky-700"
                  >
                    <FileCheck2 className="h-3 w-3" />
                    Giustificativo
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-foreground/90">{t.descrizione}</p>
              <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">Riferimento:</span> {t.riferimento}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="py-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground/80">Note</p>
          Il catalogo è estendibile (append-only): si possono aggiungere tipi opzionali (permesso 104
          per il lavoratore stesso, congedo straordinario biennale art. 42 D.Lgs 151, malattia del
          figlio, allattamento, diritto allo studio 150 ore, donazione midollo, permessi sindacali,
          aspettativa, congedo per gravi motivi familiari, ecc.) senza toccare i dati esistenti.
          Documentazione completa e fonti in{' '}
          <span className="font-mono">documentazione_generale/08_LOGICHE/Permessi_Ferie_Normativa_IT.md</span>.
        </CardContent>
      </Card>
    </div>
  );
}
