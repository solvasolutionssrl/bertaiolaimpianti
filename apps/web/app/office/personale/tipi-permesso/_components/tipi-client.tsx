'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Scale, Clock, CalendarDays, FileCheck2, Settings } from 'lucide-react';
import { Card, CardContent, Badge } from '@kommessa/ui';
import {
  PERMESSO_TIPI,
  RETRIBUITO_LABEL,
  UNITA_LABEL,
  type Retribuito,
} from '@kommessa/api/permessi-tipi';

function tonoRetribuito(r: Retribuito): string {
  if (r === 'no') return 'border-slate-200 bg-slate-50 text-slate-600';
  if (r === 'parziale') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export function TipiClient({ attivi, canManage }: { attivi: string[]; canManage: boolean }) {
  const set = new Set(attivi);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/office/personale/permessi"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Ferie e permessi
        </Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Scale className="h-5 w-5 text-primary" />
            Tipi di permesso e normativa
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Riferimenti normativi consultabili per ogni tipo. I valori di monte-ore variano per
            contratto/livello: sono indicativi.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/office/impostazioni/personale"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40"
          >
            <Settings className="h-4 w-4" /> Gestisci tipi
          </Link>
        ) : null}
      </header>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {PERMESSO_TIPI.map((t) => (
            <div key={t.codice} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold">{t.label}</span>
                  {set.has(t.codice) ? (
                    <Badge
                      variant="outline"
                      className="border-primary/30 bg-primary/5 text-[10px] font-medium text-primary"
                    >
                      Attivo
                    </Badge>
                  ) : null}
                  <Badge
                    variant="outline"
                    className="gap-1 border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600"
                  >
                    {t.unita === 'ore' ? <Clock className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
                    {UNITA_LABEL[t.unita]}
                  </Badge>
                  <Badge variant="outline" className={'text-[10px] font-medium ' + tonoRetribuito(t.retribuito)}>
                    {RETRIBUITO_LABEL[t.retribuito]}
                  </Badge>
                  {t.richiedeGiustificativo ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-sky-200 bg-sky-50 text-[10px] font-medium text-sky-700"
                    >
                      <FileCheck2 className="h-3 w-3" /> Giustificativo
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.descrizione} <span className="text-foreground/60">· {t.riferimento}</span>
                </p>
              </div>
              <a
                href={t.fonte}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/40"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Consulta riferimento
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fonti verificabili (INPS, INAIL, guide CCNL). Catalogo estendibile con tipi personalizzati
        dalle Impostazioni.
      </p>
    </div>
  );
}
