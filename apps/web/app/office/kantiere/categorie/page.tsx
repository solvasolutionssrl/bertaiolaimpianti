import { notFound } from 'next/navigation';

import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';

import { CategorieClient } from './_components/categorie-client';

export const dynamic = 'force-dynamic';

/**
 * `/office/kantiere/categorie` — il registro delle categorie di cantiere e la
 * coda dei valori arrivati dal gestionale ma non ancora smistati.
 *
 * Vive in una pagina sua e non dentro Impostazioni Kantiere perche' li' tutto
 * e' un unico modulo con un solo tasto Salva: un elenco che si modifica riga
 * per riga combatterebbe con quel modello.
 */

export interface CategoriaRiga {
  id: string;
  nome: string;
  attiva: boolean;
  origine: string;
  /** Quanti cantieri la usano adesso: dice se si può eliminare. */
  usata: number;
  /** Valori del gestionale che le sono stati agganciati. */
  valoriEsterni: string[];
}

export interface DaSmistareRiga {
  valoreEsterno: string;
  vistoAl: string;
  /** Quanti cantieri portano ancora addosso il valore grezzo. */
  cantieri: number;
}

export default async function CategoriePage() {
  const ctx = await requireTenantContext();
  if (!['owner', 'admin', 'office'].includes(ctx.role)) notFound();

  const supabase = createServerSupabase();

  const [catRes, cantieriRes, modRes] = await Promise.all([
    supabase
      .from('cantiere_categorie' as never)
      .select('id, nome, attiva, origine')
      .eq('tenant_id', ctx.tenantId)
      .order('nome'),
    supabase.from('cantieri' as never).select('categoria').eq('tenant_id', ctx.tenantId),
    supabase
      .from('tenant_modules' as never)
      .select('attivo, config')
      .eq('tenant_id', ctx.tenantId)
      .eq('module_code', 'integrazione')
      .maybeSingle(),
  ]);

  const mod = modRes.data as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  const sistema =
    mod?.attivo && typeof mod.config?.sistema === 'string' ? mod.config.sistema : null;

  // Quanti cantieri per ciascun valore di categoria, contati sul dato vero.
  const conteggio = new Map<string, number>();
  for (const r of (cantieriRes.data ?? []) as unknown as { categoria: string | null }[]) {
    const v = (r.categoria ?? '').trim();
    if (v) conteggio.set(v, (conteggio.get(v) ?? 0) + 1);
  }

  let mappature: { valore_esterno: string; categoria_id: string | null; visto_al: string }[] = [];
  if (sistema) {
    const { data } = await supabase
      .from('categoria_mappature' as never)
      .select('valore_esterno, categoria_id, visto_al')
      .eq('tenant_id', ctx.tenantId)
      .eq('sistema', sistema)
      .order('visto_al', { ascending: false });
    mappature = (data ?? []) as unknown as typeof mappature;
  }

  const esterniPerCategoria = new Map<string, string[]>();
  for (const m of mappature) {
    if (!m.categoria_id) continue;
    const lista = esterniPerCategoria.get(m.categoria_id) ?? [];
    lista.push(m.valore_esterno);
    esterniPerCategoria.set(m.categoria_id, lista);
  }

  const categorie: CategoriaRiga[] = (
    (catRes.data ?? []) as unknown as {
      id: string;
      nome: string;
      attiva: boolean;
      origine: string;
    }[]
  ).map((c) => ({
    id: c.id,
    nome: c.nome,
    attiva: c.attiva,
    origine: c.origine,
    usata: conteggio.get(c.nome) ?? 0,
    valoriEsterni: esterniPerCategoria.get(c.id) ?? [],
  }));

  const daSmistare: DaSmistareRiga[] = mappature
    .filter((m) => !m.categoria_id)
    .map((m) => ({
      valoreEsterno: m.valore_esterno,
      vistoAl: m.visto_al,
      cantieri: conteggio.get(m.valore_esterno) ?? 0,
    }));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Categorie cantiere</h1>
        <p className="text-sm text-muted-foreground">
          Il vocabolario con cui si classificano i lavori.
          {sistema
            ? ' I valori che arrivano dal gestionale si agganciano a queste: quello che non riconosciamo resta qui sotto, in attesa che tu decida.'
            : null}
        </p>
      </header>
      <CategorieClient
        categorie={categorie}
        daSmistare={daSmistare}
        sistema={sistema}
      />
    </div>
  );
}
