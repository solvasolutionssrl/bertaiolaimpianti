import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import type { CategoriaSpesa } from '@kommessa/api/spese';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../../_lib/guard';
import { NuovaSpesa } from './_components/nuova-spesa';
import { SpeseClient, type SpesaRiga } from './_components/spese-client';

export const metadata: Metadata = {
  title: 'Le mie spese',
};

export const dynamic = 'force-dynamic';

export default async function SpeseMobilePage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  // Profilo dipendente dell'utente (filtro di sicurezza extra oltre l'RLS).
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const dipId = (dipRow as { id: string } | null)?.id ?? null;

  let spese: SpesaRiga[] = [];
  const cantieriNomi: Record<string, string> = {};

  if (dipId) {
    const { data: rows } = await supabase
      .from('spese' as never)
      .select(
        'id, cantiere_id, categoria, ragione_sociale, importo_totale, importo_iva, valuta, data_scontrino, created_at, r2_thumb_key, r2_key, foto_mime, numero_persone',
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('dipendente_id', dipId)
      .order('created_at', { ascending: false });
    const raw =
      (rows as
        | {
            id: string;
            cantiere_id: string | null;
            categoria: string;
            ragione_sociale: string | null;
            importo_totale: number | null;
            importo_iva: number | null;
            valuta: string | null;
            data_scontrino: string | null;
            created_at: string | null;
            r2_thumb_key: string | null;
            r2_key: string | null;
            foto_mime: string | null;
            numero_persone: number | null;
          }[]
        | null) ?? [];

    spese = raw.map((r) => ({
      id: r.id,
      cantiereId: r.cantiere_id,
      categoria: r.categoria as CategoriaSpesa,
      ragioneSociale: r.ragione_sociale,
      importoTotale: r.importo_totale,
      valuta: r.valuta,
      dataScontrino: r.data_scontrino,
      createdAt: r.created_at,
      hasThumb: !!r.r2_thumb_key,
      hasFile: !!r.r2_key,
      fotoMime: r.foto_mime,
      numeroPersone: r.numero_persone ?? 1,
    }));

    // Risolvi i nomi dei cantieri referenziati.
    const cantiereIds = [
      ...new Set(spese.map((s) => s.cantiereId).filter((x): x is string => !!x)),
    ];
    if (cantiereIds.length > 0) {
      const { data: cantRows } = await supabase
        .from('cantieri' as never)
        .select('id, nome, codice')
        .eq('tenant_id', ctx.tenantId)
        .in('id', cantiereIds);
      for (const c of (cantRows as
        | { id: string; nome: string | null; codice: string | null }[]
        | null) ?? []) {
        cantieriNomi[c.id] = c.nome ? titoloCase(c.nome) : c.codice || 'Cantiere';
      }
    }
  }

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Kontabilità
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Le mie spese</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scatta lo scontrino: leggo importo e categoria, tu controlli e salvi.
        </p>
      </header>

      <NuovaSpesa />

      <SpeseClient spese={spese} cantieriNomi={cantieriNomi} />
    </div>
  );
}
