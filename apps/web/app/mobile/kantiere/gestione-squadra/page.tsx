import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Clock, Users } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { titoloCase } from '@/app/mobile/_lib/display-case';
import {
  leggiSogliaPausaPranzoOre,
  leggiSogliaAutoSpegnimentoPausa,
} from '@/app/_lib/kantiere-config';

import { guardMobile } from '../../_lib/guard';
import { sonoCapoSquadra, squadraDelCapo } from '../_lib/capo';
import { GestioneSquadraClient } from './_components/gestione-squadra-client';
import type { ViaggioContestoCantiere } from './_components/gestione-squadra-client';

export const metadata: Metadata = {
  title: 'Gestione squadra',
};

export const dynamic = 'force-dynamic';

export default async function GestioneSquadraPage() {
  const ctx = await guardMobile();

  // Solo i capi accedono a questa pagina; gli altri tornano ai cantieri.
  const capo = await sonoCapoSquadra(ctx.tenantId, ctx.userId);
  if (!capo) redirect('/mobile/kantiere/cantieri');

  const gruppi = await squadraDelCapo(ctx.tenantId, ctx.userId);
  const [sogliaPausaPranzoOre, sogliaAutoSpegnimentoPausaOre] = await Promise.all([
    leggiSogliaPausaPranzoOre(createServerSupabase(), ctx.tenantId),
    leggiSogliaAutoSpegnimentoPausa(createServerSupabase(), ctx.tenantId),
  ]);

  // Contesto viaggio di ritorno per il dialog "Termina turno" che il capo
  // compila per ogni membro: sedi selezionabili per cantiere (default tenant +
  // sedi associate al cantiere, solo attive) + parco mezzi attivo (tenant-wide).
  // Mirror della logica della scheda cantiere (`cantieri/[id]`).
  const supabase = createServerSupabase();
  const cantieriIds = gruppi.map((g) => g.cantiereId);

  const viaggioByCantiere: Record<string, ViaggioContestoCantiere> = {};
  let mezzi: { id: string; targa: string; modello: string | null }[] = [];

  if (cantieriIds.length > 0) {
    const [sediRes, assocRes, mezziRes] = await Promise.all([
      supabase
        .from('sedi' as never)
        .select('id, nome, tipo, is_default')
        .eq('tenant_id', ctx.tenantId)
        .eq('attivo', true),
      supabase
        .from('cantiere_sede' as never)
        .select('cantiere_id, sede_id')
        .eq('tenant_id', ctx.tenantId)
        .in('cantiere_id', cantieriIds),
      supabase
        .from('mezzi' as never)
        .select('id, targa, modello')
        .eq('tenant_id', ctx.tenantId)
        .eq('attivo', true)
        .order('targa'),
    ]);

    const allSedi =
      (sediRes.data as
        | { id: string; nome: string; tipo: string; is_default: boolean }[]
        | null) ?? [];
    const sedeDefaultId = allSedi.find((s) => s.is_default)?.id ?? null;

    // Mappa cantiere → set di sedi associate.
    const assocByCantiere = new Map<string, Set<string>>();
    for (const r of (assocRes.data as { cantiere_id: string; sede_id: string }[] | null) ?? []) {
      const set = assocByCantiere.get(r.cantiere_id) ?? new Set<string>();
      set.add(r.sede_id);
      assocByCantiere.set(r.cantiere_id, set);
    }

    for (const cid of cantieriIds) {
      const assocIds = assocByCantiere.get(cid) ?? new Set<string>();
      const sedi = allSedi
        .filter((s) => s.is_default || assocIds.has(s.id))
        .map((s) => ({ id: s.id, nome: titoloCase(s.nome), tipo: s.tipo }));
      viaggioByCantiere[cid] = { sedi, sedeDefaultId };
    }

    mezzi = (
      (mezziRes.data as { id: string; targa: string; modello: string | null }[] | null) ?? []
    ).map((m) => ({ id: m.id, targa: m.targa, modello: m.modello }));
  }

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Gestione squadra
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Stato dei tuoi ragazzi e timbrature per conto loro (ingresso, pausa pranzo, fine turno).
          Possono comunque timbrare anche da soli con il QR.
        </p>
      </header>

      {/* Le ore personali del capo non hanno più uno slot dedicato nel
          bottom-nav (sostituito da Spese): le rendiamo raggiungibili da qui. */}
      <Link
        href="/mobile/kantiere/ore"
        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-soft active:scale-[0.99] transition-transform"
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">Le mie ore</span>
            <span className="block text-xs text-muted-foreground">Il tuo rapportino di oggi</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      <GestioneSquadraClient
        gruppi={gruppi}
        viaggioByCantiere={viaggioByCantiere}
        mezzi={mezzi}
        sogliaPausaPranzoOre={sogliaPausaPranzoOre}
        sogliaAutoSpegnimentoPausaOre={sogliaAutoSpegnimentoPausaOre}
      />
    </div>
  );
}
