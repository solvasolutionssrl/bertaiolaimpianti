/**
 * Abbinamento delle anagrafiche fra Kommessa e il gestionale del cliente,
 * eseguito da riga di comando invece che dalla pagina d'ufficio.
 *
 * Usa **lo stesso motore** della UI (`@kommessa/api/integrazione-abbina`): se
 * qui girasse un algoritmo diverso, i due strumenti proporrebbero cose diverse
 * e nessuno dei due sarebbe piu' credibile.
 *
 * SICUREZZA
 *   - DRY-RUN di default: senza `--apply` non scrive niente.
 *   - Conferma solo i `certo`, a meno di `--includi=probabile`.
 *   - MAI cancella e MAI tocca un abbinamento gia' confermato dall'ufficio.
 *   - Non crea cantieri: la creazione e' un'altra decisione, e sta altrove.
 *
 * Uso:
 *   pnpm tsx scripts/abbina-gestionale.ts --tenant=FPMIMP
 *   pnpm tsx scripts/abbina-gestionale.ts --tenant=FPMIMP --apply
 *   pnpm tsx scripts/abbina-gestionale.ts --tenant=FPMIMP --includi=probabile --apply
 *   pnpm tsx scripts/abbina-gestionale.ts --tenant=FPMIMP --entita=dipendente --apply
 *
 * ⚠️ Sui DIPENDENTI il codice non si guarda mai — si abbina solo per nome.
 *    Le nostre matricole e quelle del gestionale sono due numerazioni diverse
 *    che si somigliano: su FPM `00003` e' Benedetti e il `3` di ERGO e'
 *    Biscaro. Confrontarle produce accoppiamenti sbagliati che non danno
 *    nessun errore e mandano le ore sulla busta paga di un altro.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  proponiAbbinamenti,
  type CandidatoEsterno,
  type CandidatoNostro,
} from '../packages/api/src/integrazione-abbina';

const QUI = dirname(fileURLToPath(import.meta.url));

function env(): { url: string; key: string } {
  const raw = readFileSync(resolve(QUI, '../apps/web/.env.local'), 'utf8');
  const leggi = (k: string) =>
    raw
      .split('\n')
      .find((r) => r.startsWith(`${k}=`))
      ?.slice(k.length + 1)
      .trim()
      .replace(/^["']|["']$/g, '') ?? '';
  const url = leggi('NEXT_PUBLIC_SUPABASE_URL');
  const key = leggi('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Credenziali assenti in apps/web/.env.local');
  return { url, key };
}

const arg = (n: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string): boolean => process.argv.includes(`--${n}`);

async function main() {
  const slug = arg('tenant');
  if (!slug) throw new Error('Serve --tenant=SLUG');
  const applica = flag('apply');
  const includiProbabili = arg('includi') === 'probabile';
  const entitaScelta = arg('entita') === 'dipendente' ? 'dipendente' : 'commessa';

  const { url, key } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: t } = await db
    .from('tenants')
    .select('id, nome, slug, app_mode')
    .eq('slug', slug)
    .maybeSingle();
  if (!t) throw new Error(`Tenant ${slug} inesistente`);
  const tenantId = (t as { id: string }).id;
  const inKantiere = (t as { app_mode: string }).app_mode !== 'kommessa';

  const { data: mod } = await db
    .from('tenant_modules')
    .select('attivo, config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'integrazione')
    .maybeSingle();
  const sistema = (mod as { config?: { sistema?: string } } | null)?.config?.sistema;
  if (!(mod as { attivo?: boolean } | null)?.attivo || !sistema) {
    throw new Error('Modulo integrazione spento o gestionale non scelto');
  }

  console.log(`\n▸ ${(t as { nome: string }).nome} · gestionale "${sistema}"`);
  console.log(`  modalita: ${applica ? 'SCRITTURA' : 'prova (nessuna scrittura)'}\n`);

  if (entitaScelta === 'dipendente') {
    await abbinaDipendenti(db, tenantId, sistema, applica, includiProbabili);
    return;
  }

  // --- i nostri -----------------------------------------------------------
  const nostriRaw = inKantiere
    ? (
        await db
          .from('cantieri')
          .select('id, nome, codice, codice_commessa, cliente_nome')
          .eq('tenant_id', tenantId)
      ).data
    : (
        await db
          .from('commesse')
          .select('id, nome_cartella, codice_interno, descrizione_ai_finale')
          .eq('tenant_id', tenantId)
          .not('stato', 'in', '(archiviata)')
      ).data;

  const etichetta = new Map<string, string>();
  const nostri: CandidatoNostro[] = (
    (nostriRaw ?? []) as unknown as Record<string, string | null>[]
  ).map((r) => {
    const id = r.id as string;
    etichetta.set(id, `${r.codice ?? r.codice_interno ?? '?'} · ${r.nome ?? r.nome_cartella}`);
    return {
      id,
      codice: r.codice_commessa ?? r.codice_interno ?? null,
      nome: (r.nome ?? r.descrizione_ai_finale ?? r.nome_cartella ?? '') || '(senza nome)',
      cliente: r.cliente_nome ?? null,
    };
  });

  // --- i loro -------------------------------------------------------------
  const { data: stagingRaw } = await db
    .from('integrazione_staging')
    .select('external_id, nome, external_codice, cliente_nome, attiva')
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'commessa');

  const esterni: CandidatoEsterno[] = (
    (stagingRaw ?? []) as unknown as {
      external_id: string;
      nome: string | null;
      external_codice: string | null;
      cliente_nome: string | null;
    }[]
  ).map((r) => ({
    externalId: r.external_id,
    codice: r.external_codice,
    nome: r.nome ?? r.external_id,
    cliente: r.cliente_nome,
  }));

  // --- gia' confermati ----------------------------------------------------
  const { data: mapRaw } = await db
    .from('integrazione_mappature')
    .select('entita_id, external_id')
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .in('entita', ['cantiere', 'commessa']);
  const gia = ((mapRaw ?? []) as unknown as { entita_id: string; external_id: string }[]).map(
    (m) => ({ nostroId: m.entita_id, externalId: m.external_id }),
  );

  console.log(`  nostri: ${nostri.length} · dal gestionale: ${esterni.length} · gia' collegati: ${gia.length}\n`);

  // --- proposta -----------------------------------------------------------
  const proposte = proponiAbbinamenti(nostri, esterni, gia);
  const per = (f: string) => proposte.filter((p) => p.forza === f);
  const perId = new Map(esterni.map((e) => [e.externalId, e]));

  for (const f of ['certo', 'probabile', 'debole', 'nessuno'] as const) {
    const gruppo = per(f);
    console.log(`  ${f.toUpperCase().padEnd(10)} ${String(gruppo.length).padStart(4)}`);
  }
  console.log();

  for (const f of ['probabile', 'debole'] as const) {
    const gruppo = per(f);
    if (gruppo.length === 0) continue;
    console.log(`  ── ${f} (da guardare a occhio) ──`);
    for (const p of gruppo.slice(0, 30)) {
      const e = p.externalId ? perId.get(p.externalId) : undefined;
      console.log(
        `    ${etichetta.get(p.nostroId)}\n      → ${p.externalId} ${e?.nome ?? ''}  [${p.motivo}]`,
      );
    }
    console.log();
  }

  const dispersi = per('nessuno');
  if (dispersi.length > 0) {
    console.log(`  ── dispersi: nostri senza corrispondenza (${dispersi.length}) ──`);
    for (const p of dispersi) console.log(`    ${etichetta.get(p.nostroId)}`);
    console.log();
  }

  const abbinati = new Set(
    [...gia.map((g) => g.externalId), ...proposte.map((p) => p.externalId)].filter(Boolean),
  );
  const soloLoro = esterni.filter((e) => !abbinati.has(e.externalId));
  console.log(`  ── solo sul gestionale, da creare: ${soloLoro.length} ──\n`);

  // --- scrittura ----------------------------------------------------------
  const daScrivere = [...per('certo'), ...(includiProbabili ? per('probabile') : [])].filter(
    (p): p is typeof p & { externalId: string } => !!p.externalId,
  );

  if (!applica) {
    console.log(
      `  Prova: scriverei ${daScrivere.length} abbinamenti. Rilancia con --apply.\n`,
    );
    return;
  }

  const entita = inKantiere ? 'cantiere' : 'commessa';
  const righe = daScrivere.map((p) => ({
    tenant_id: tenantId,
    sistema,
    entita,
    entita_id: p.nostroId,
    external_id: p.externalId,
    external_dati: {
      externalCodice: perId.get(p.externalId)?.codice ?? null,
      nome: perId.get(p.externalId)?.nome ?? null,
      clienteNome: perId.get(p.externalId)?.cliente ?? null,
    },
    // `automatico`: distingue cio' che ha deciso la macchina da cio' che ha
    // guardato una persona. La pagina d'ufficio protegge i `manuale` dai
    // ri-abbinamenti; questi restano correggibili.
    origine: 'automatico',
  }));

  for (let i = 0; i < righe.length; i += 200) {
    const lotto = righe.slice(i, i + 200);
    const { error } = await db
      .from('integrazione_mappature')
      .upsert(lotto, { onConflict: 'tenant_id,sistema,entita,entita_id' });
    if (error) throw new Error(`Scrittura fallita al lotto ${i}: ${error.message}`);
    console.log(`  scritti ${Math.min(i + lotto.length, righe.length)}/${righe.length}`);
  }
  console.log(`\n  ✓ ${righe.length} abbinamenti confermati.\n`);
}

/**
 * Dipendenti: stesso motore, ma con il **codice azzerato da entrambe le
 * parti**. Non e' una semplificazione — e' la protezione contro l'unico modo
 * in cui questo abbinamento puo' sbagliare in silenzio.
 */
async function abbinaDipendenti(
  db: ReturnType<typeof createClient>,
  tenantId: string,
  sistema: string,
  applica: boolean,
  includiProbabili: boolean,
) {
  const { data: nostriRaw } = await db
    .from('dipendenti')
    .select('id, nome, cognome, codice_interno, stato_attivo')
    .eq('tenant_id', tenantId);

  const etichetta = new Map<string, string>();
  const nostri: CandidatoNostro[] = (
    (nostriRaw ?? []) as unknown as {
      id: string;
      nome: string;
      cognome: string;
      codice_interno: string | null;
      stato_attivo: boolean;
    }[]
  ).map((d) => {
    const nome = `${d.cognome} ${d.nome}`.trim();
    etichetta.set(d.id, `${d.codice_interno ?? '?'} · ${nome}${d.stato_attivo ? '' : ' (non in forza)'}`);
    // `codice: null` deliberato: vedi l'avvertenza in testa al file.
    return { id: d.id, codice: null, nome, cliente: null };
  });

  const { data: stagingRaw } = await db
    .from('integrazione_staging')
    .select('external_id, nome')
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'dipendente');

  const esterni: CandidatoEsterno[] = (
    (stagingRaw ?? []) as unknown as { external_id: string; nome: string | null }[]
  ).map((r) => ({
    externalId: r.external_id,
    codice: null,
    nome: r.nome ?? r.external_id,
    cliente: null,
  }));

  const { data: mapRaw } = await db
    .from('integrazione_mappature')
    .select('entita_id, external_id')
    .eq('tenant_id', tenantId)
    .eq('sistema', sistema)
    .eq('entita', 'dipendente');
  const gia = ((mapRaw ?? []) as unknown as { entita_id: string; external_id: string }[]).map(
    (m) => ({ nostroId: m.entita_id, externalId: m.external_id }),
  );

  console.log(`  nostri: ${nostri.length} · dal gestionale: ${esterni.length} · gia' collegati: ${gia.length}`);
  console.log('  (abbinamento SOLO per nome: i codici sono due numerazioni diverse)\n');

  const proposte = proponiAbbinamenti(nostri, esterni, gia);
  const perId = new Map(esterni.map((e) => [e.externalId, e]));
  for (const f of ['certo', 'probabile', 'debole', 'nessuno'] as const) {
    console.log(`  ${f.toUpperCase().padEnd(10)} ${String(proposte.filter((p) => p.forza === f).length).padStart(4)}`);
  }
  console.log();

  for (const f of ['probabile', 'debole', 'nessuno'] as const) {
    const g = proposte.filter((p) => p.forza === f);
    if (g.length === 0) continue;
    console.log(`  ── ${f} ──`);
    for (const p of g) {
      const e = p.externalId ? perId.get(p.externalId) : undefined;
      console.log(`    ${etichetta.get(p.nostroId)}${e ? `\n      → ${p.externalId} ${e.nome}  [${p.motivo}]` : ''}`);
    }
    console.log();
  }

  const daScrivere = [
    ...proposte.filter((p) => p.forza === 'certo'),
    ...(includiProbabili ? proposte.filter((p) => p.forza === 'probabile') : []),
  ].filter((p): p is typeof p & { externalId: string } => !!p.externalId);

  if (!applica) {
    console.log(`  Prova: scriverei ${daScrivere.length} abbinamenti. Rilancia con --apply.\n`);
    return;
  }

  const { error } = await db.from('integrazione_mappature').upsert(
    daScrivere.map((p) => ({
      tenant_id: tenantId,
      sistema,
      entita: 'dipendente',
      entita_id: p.nostroId,
      external_id: p.externalId,
      external_dati: { nome: perId.get(p.externalId)?.nome ?? null },
      origine: 'automatico',
    })),
    { onConflict: 'tenant_id,sistema,entita,entita_id' },
  );
  if (error) throw new Error(`Scrittura fallita: ${error.message}`);
  console.log(`  ✓ ${daScrivere.length} dipendenti collegati.\n`);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
