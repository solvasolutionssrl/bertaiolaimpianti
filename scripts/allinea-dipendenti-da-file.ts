/**
 * Allinea lo stato «in forza» dei dipendenti a un elenco fornito dal cliente.
 *
 * PERCHE' ESISTE, e perche' e' una-tantum e non un meccanismo: lo stato di un
 * dipendente e' un **dato nostro**, che l'ufficio mantiene in Kommessa. Alcuni
 * gestionali lo espongono, altri no — ERGO oggi non lo manda, e il cliente lo
 * ha su un foglio a parte. Questo script serve a partire allineati; da li' in
 * avanti lo stato lo governa l'ufficio, e se un domani il gestionale imparasse
 * a dirlo arriverebbe dal campo canonico `attiva` di `POST /letture` senza
 * cambiare niente.
 *
 * Il file e' un foglio con: id sul gestionale · cognome · nome · reparto ·
 * «X» se in forza. Le colonne si passano da riga di comando, cosi' il prossimo
 * cliente con un foglio diverso non richiede di riscrivere lo script.
 *
 * SICUREZZA
 *   - DRY-RUN di default.
 *   - Tocca SOLO i dipendenti gia' collegati al gestionale: chi non lo e' non
 *     compare nel foglio in modo affidabile, e chiuderlo sarebbe un'ipotesi.
 *   - Chiudere non cancella niente: le ore gia' registrate restano.
 *   - Segnala, senza toccarli, i casi che richiedono una persona.
 *
 * Uso:
 *   pnpm tsx scripts/allinea-dipendenti-da-file.ts --tenant=FPMIMP --file=…xlsx
 *   … --apply
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const QUI = dirname(fileURLToPath(import.meta.url));
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

function env() {
  const raw = readFileSync(resolve(QUI, '../apps/web/.env.local'), 'utf8');
  const leggi = (k: string) =>
    raw.split('\n').find((r) => r.startsWith(`${k}=`))?.slice(k.length + 1).trim()
      .replace(/^["']|["']$/g, '') ?? '';
  return { url: leggi('NEXT_PUBLIC_SUPABASE_URL'), key: leggi('SUPABASE_SERVICE_ROLE_KEY') };
}

/** Colonne, per indice 0-based. Sovrascrivibili: ogni cliente ha il suo foglio. */
const COL = {
  externalId: Number(arg('col-id') ?? 0),
  cognome: Number(arg('col-cognome') ?? 1),
  nome: Number(arg('col-nome') ?? 2),
  attivo: Number(arg('col-attivo') ?? 4),
};
/** Cosa conta come «in forza». Tutto il resto e' un no. */
const SEGNO_ATTIVO = (arg('segno') ?? 'X').toUpperCase();

interface RigaFile {
  externalId: string;
  nome: string;
  attivo: boolean;
}

function leggiFoglio(percorso: string): RigaFile[] {
  const wb = XLSX.readFile(percorso);
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const righe = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const out: RigaFile[] = [];
  for (const r of righe) {
    const id = r[COL.externalId];
    // Le intestazioni non hanno un id numerico: si scartano da sole, senza
    // dover sapere quante righe di titolo ha questo foglio in particolare.
    if (id === undefined || id === null || Number.isNaN(Number(id))) continue;
    const cognome = String(r[COL.cognome] ?? '').trim();
    const nome = String(r[COL.nome] ?? '').trim();
    out.push({
      externalId: String(id).trim(),
      nome: `${cognome} ${nome}`.trim(),
      attivo: String(r[COL.attivo] ?? '').trim().toUpperCase() === SEGNO_ATTIVO,
    });
  }
  return out;
}

/**
 * Confronto insensibile all'ORDINE delle parole: «Xu Guangxiang» e
 * «Guangxiang Xu» sono la stessa persona, e su un nome non italiano quale sia
 * il cognome non lo sappiamo ne' noi ne' il gestionale. Senza questo, la rete
 * di sicurezza qui sotto griderebbe al lupo su un abbinamento corretto — e una
 * rete che suona a vuoto e' una rete che si impara a ignorare.
 */
const chiave = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .sort()
    .join('');

async function main() {
  const slug = arg('tenant');
  const percorso = arg('file');
  if (!slug || !percorso) throw new Error('Servono --tenant=SLUG e --file=percorso');
  const applica = flag('apply');

  const { url, key } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: t } = await db.from('tenants').select('id, nome').eq('slug', slug).maybeSingle();
  if (!t) throw new Error(`Tenant ${slug} inesistente`);
  const tenantId = (t as { id: string }).id;

  const { data: mod } = await db
    .from('tenant_modules').select('config')
    .eq('tenant_id', tenantId).eq('module_code', 'integrazione').maybeSingle();
  const sistema = (mod as { config?: { sistema?: string } } | null)?.config?.sistema;
  if (!sistema) throw new Error('Gestionale non configurato per questo cliente');

  const file = leggiFoglio(percorso);
  const perId = new Map(file.map((r) => [r.externalId, r]));
  console.log(`\n▸ ${(t as { nome: string }).nome} · ${file.length} righe nel foglio`);
  console.log(`  in forza: ${file.filter((r) => r.attivo).length} · non in forza: ${file.filter((r) => !r.attivo).length}`);
  console.log(`  ${applica ? 'SCRITTURA' : 'prova (nessuna scrittura)'}\n`);

  const { data: mapRaw } = await db
    .from('integrazione_mappature').select('entita_id, external_id')
    .eq('tenant_id', tenantId).eq('sistema', sistema).eq('entita', 'dipendente');
  const mappe = (mapRaw ?? []) as { entita_id: string; external_id: string }[];

  const { data: dipRaw } = await db
    .from('dipendenti').select('id, nome, cognome, codice_interno, stato_attivo')
    .eq('tenant_id', tenantId);
  const dip = new Map(
    ((dipRaw ?? []) as { id: string; nome: string; cognome: string; codice_interno: string | null; stato_attivo: boolean }[])
      .map((d) => [d.id, d]),
  );

  const cambi: { id: string; nome: string; da: boolean; a: boolean }[] = [];
  const discordanti: string[] = [];

  for (const m of mappe) {
    const d = dip.get(m.entita_id);
    const f = perId.get(m.external_id);
    if (!d || !f) continue;
    // Rete di sicurezza: se il nome nel foglio non e' quello del dipendente a
    // cui la mappatura punta, il foglio o la mappatura sono sbagliati — e in
    // dubbio non si tocca lo stato di nessuno.
    if (chiave(`${d.cognome} ${d.nome}`) !== chiave(f.nome)) {
      discordanti.push(`id=${m.external_id} noi «${d.cognome} ${d.nome}» foglio «${f.nome}»`);
      continue;
    }
    if (d.stato_attivo !== f.attivo) {
      cambi.push({ id: d.id, nome: `${d.cognome} ${d.nome}`, da: d.stato_attivo, a: f.attivo });
    }
  }

  if (discordanti.length > 0) {
    console.log('  ⚠ NOMI DISCORDANTI — non toccati:');
    for (const r of discordanti) console.log(`    ${r}`);
    console.log();
  }

  console.log(`  ── da cambiare: ${cambi.length} ──`);
  for (const c of cambi) {
    console.log(`    ${c.nome.padEnd(26)} ${c.da ? 'in forza' : 'chiuso'} → ${c.a ? 'in forza' : 'CHIUSO'}`);
  }
  console.log();

  if (!applica) {
    console.log('  Prova. Rilancia con --apply.\n');
    return;
  }
  for (const c of cambi) {
    const { error } = await db
      .from('dipendenti')
      .update({ stato_attivo: c.a, updated_at: new Date().toISOString() })
      .eq('id', c.id).eq('tenant_id', tenantId);
    if (error) console.log(`    ✗ ${c.nome}: ${error.message}`);
  }
  console.log(`  ✓ ${cambi.length} dipendenti allineati.\n`);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
