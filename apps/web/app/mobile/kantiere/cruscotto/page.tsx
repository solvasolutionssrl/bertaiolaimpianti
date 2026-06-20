import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardCheck, Users, MapPin, Timer, LogIn, LogOut } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../../_lib/guard';

export const metadata: Metadata = { title: 'Cruscotto Kantiere' };
export const dynamic = 'force-dynamic';

function formatOra(ts: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatData(d: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(d + 'T00:00:00'));
}

type Timb = {
  id: string;
  tipo: 'ingresso' | 'uscita';
  ts: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
};
type Rapp = { id: string; data: string; dipendente_id: string | null };

export default async function CruscottoKantierePage() {
  const ctx = await guardMobile();
  // Solo gestione (admin/office). I tecnici non hanno il cruscotto.
  if (ctx.role !== 'admin' && ctx.role !== 'office') redirect('/mobile/kantiere');

  const supabase = createServerSupabase();
  const inizioGiorno = new Date();
  inizioGiorno.setHours(0, 0, 0, 0);

  const [rappRes, dipRes, cantRes, timbOggiRes, ultimeRes] = await Promise.all([
    // rapportini da approvare (stato 'inviato')
    supabase
      .from('rapportini' as never)
      .select('id, data, dipendente_id', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .eq('stato', 'inviato')
      .order('data', { ascending: false })
      .limit(6),
    supabase
      .from('dipendenti' as never)
      .select('id, nome, cognome', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .eq('stato_attivo', true),
    supabase
      .from('cantieri' as never)
      .select('id, nome', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .eq('stato', 'attivo'),
    supabase
      .from('timbrature' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .gte('ts', inizioGiorno.toISOString()),
    supabase
      .from('timbrature' as never)
      .select('id, tipo, ts, dipendente_id, cantiere_id')
      .eq('tenant_id', ctx.tenantId)
      .order('ts', { ascending: false })
      .limit(8),
  ]);

  const rappDaApprovare = (rappRes.data as Rapp[] | null) ?? [];
  const nRappDaApprovare = rappRes.count ?? rappDaApprovare.length;
  const dipendenti = (dipRes.data as { id: string; nome: string; cognome: string }[] | null) ?? [];
  const nDipendenti = dipRes.count ?? dipendenti.length;
  const nCantieri = cantRes.count ?? ((cantRes.data as unknown[] | null)?.length ?? 0);
  const cantieri = (cantRes.data as { id: string; nome: string | null }[] | null) ?? [];
  const nTimbOggi = timbOggiRes.count ?? 0;
  const ultime = (ultimeRes.data as Timb[] | null) ?? [];

  const dipMap = new Map(dipendenti.map((d) => [d.id, `${d.nome} ${d.cognome}`]));
  const cantMap = new Map(cantieri.map((c) => [c.id, c.nome ?? '']));

  const kpis = [
    { label: 'Da approvare', value: nRappDaApprovare, icon: ClipboardCheck, accent: nRappDaApprovare > 0 },
    { label: 'Timbrature oggi', value: nTimbOggi, icon: Timer, accent: false },
    { label: 'Dipendenti', value: nDipendenti, icon: Users, accent: false },
    { label: 'Cantieri', value: nCantieri, icon: MapPin, accent: false },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col gap-6 p-4">
      <header className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cruscotto</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Panoramica cantieri</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Monitora rapportini, presenze e attività.</p>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={
              'rounded-2xl border p-4 shadow-soft ' +
              (k.accent ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-border bg-card')
            }
          >
            <k.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-2xl font-semibold tabular-nums">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Rapportini da approvare */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Rapportini da approvare
          </p>
          {nRappDaApprovare > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {nRappDaApprovare}
            </span>
          ) : null}
        </div>
        {rappDaApprovare.length > 0 ? (
          <div className="space-y-2">
            {rappDaApprovare.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {titoloCase(dipMap.get(r.dipendente_id ?? '') ?? 'Dipendente')}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Giornata del {formatData(r.data)}
                  </span>
                </span>
                <ClipboardCheck className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">
              L’approvazione si effettua dall’ufficio (desktop).
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Nessun rapportino in attesa. Tutto in regola.
          </p>
        )}
      </section>

      {/* Ultime timbrature */}
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ultime timbrature
        </p>
        {ultime.length > 0 ? (
          <div className="space-y-2">
            {ultime.map((t) => {
              const ingresso = t.tipo === 'ingresso';
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft"
                >
                  <span
                    className={
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' +
                      (ingresso ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40' : 'bg-muted text-muted-foreground')
                    }
                  >
                    {ingresso ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {titoloCase(dipMap.get(t.dipendente_id ?? '') ?? 'Dipendente')}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {ingresso ? 'Ingresso' : 'Uscita'}
                      {t.cantiere_id ? ` · ${titoloCase(cantMap.get(t.cantiere_id) ?? '')}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {formatOra(t.ts)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Nessuna timbratura registrata.
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Link
          href="/mobile/kantiere/cantieri"
          className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold shadow-soft active:scale-[0.99] transition-transform"
        >
          Cantieri
        </Link>
        <Link
          href="/mobile/kantiere/ore"
          className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold shadow-soft active:scale-[0.99] transition-transform"
        >
          Ore
        </Link>
      </div>
    </div>
  );
}
