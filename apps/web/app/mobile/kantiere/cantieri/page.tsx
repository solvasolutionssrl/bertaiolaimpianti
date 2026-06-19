import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, ChevronRight } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../../_lib/guard';

export const metadata: Metadata = {
  title: 'Cantieri',
};

export const dynamic = 'force-dynamic';

const STATO_LABEL: Record<string, string> = {
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  chiuso: 'Chiuso',
};

export default async function CantieriMobilePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  const { data: cantieriRaw } = await supabase
    .from('cantieri' as never)
    .select('id, codice, nome, indirizzo, stato')
    .eq('tenant_id', ctx.tenantId)
    .order('stato', { ascending: true })
    .order('nome', { ascending: true });

  const cantieri =
    (cantieriRaw as
      | {
          id: string;
          codice: string | null;
          nome: string | null;
          indirizzo: string | null;
          stato: string;
        }[]
      | null) ?? [];

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Kantiere
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Cantieri</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {cantieri.length === 0
            ? 'Nessun cantiere'
            : `${cantieri.length} ${cantieri.length === 1 ? 'cantiere' : 'cantieri'}`}
        </p>
      </header>

      {cantieri.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Nessun cantiere disponibile.
        </div>
      ) : (
        <div className="space-y-2">
          {cantieri.map((c) => (
            <Link
              key={c.id}
              href={`/mobile/kantiere/cantieri/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft active:scale-[0.99] transition-transform"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {titoloCase(c.nome ?? '') || c.codice || 'Cantiere'}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {c.codice ? <span className="font-mono">{c.codice}</span> : null}
                  {c.indirizzo ? <span className="truncate">{c.indirizzo}</span> : null}
                  <span>{STATO_LABEL[c.stato] ?? c.stato}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
