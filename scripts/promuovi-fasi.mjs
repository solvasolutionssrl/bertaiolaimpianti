/**
 * Promuove le FASI (sottocantieri) dall'area di sosta ai cantieri collegati,
 * per un cliente, senza aspettare la chiusura notturna del giro di lettura.
 *
 *   npx tsx scripts/promuovi-fasi.mjs --tenant FPMIMP          # dry-run: solo conteggi
 *   npx tsx scripts/promuovi-fasi.mjs --tenant FPMIMP --apply  # scrive
 *
 * Stessa logica pura del server (`@kommessa/api/fasi-gestionale`): crea,
 * aggiorna nome/codice, collega per codice una fase scritta a mano, lascia in
 * sosta chi non ha il cantiere padre collegato. Mai chiude ne' cancella.
 * Service role da apps/web/.env.local; non stampa mai segreti.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cantierePerExternalDa, pianificaFasiDalGestionale } from '../packages/api/src/fasi-gestionale.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const slug = args[args.indexOf('--tenant') + 1];
if (!args.includes('--tenant') || !slug) throw new Error('Uso: --tenant <slug> [--apply]');

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }),
);
const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!BASE || !KEY) throw new Error('Env mancante');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function get(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function post(path, body, extra = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation', ...extra }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  // Con `return=minimal` il corpo e' vuoto: non e' un errore.
  const testo = await r.text();
  return testo ? JSON.parse(testo) : [];
}
async function patch(path, body) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
}

const [tenant] = await get(`tenants?select=id,slug,app_mode&slug=eq.${encodeURIComponent(slug)}`);
if (!tenant) throw new Error(`Cliente ${slug} non trovato`);
const T = tenant.id;
const [mod] = await get(`tenant_modules?select=attivo,config&tenant_id=eq.${T}&module_code=eq.integrazione`);
if (!mod?.attivo) throw new Error('Modulo integrazione spento');
const sistema = mod.config?.sistema;
if (!sistema) throw new Error('Gestionale non scelto');

const sostaRaw = await get(`integrazione_staging?select=external_id,nome,external_codice,dati&tenant_id=eq.${T}&sistema=eq.${sistema}&entita=eq.sottocantiere`);
const sosta = sostaRaw.map((r) => ({
  externalId: r.external_id,
  nome: r.nome ?? '',
  externalCodice: r.external_codice,
  externalCantiereId: typeof r.dati?.externalCantiereId === 'string' ? r.dati.externalCantiereId : null,
  descrizione: typeof r.dati?.descrizione === 'string' ? r.dati.descrizione : null,
}));
const mapCant = await get(`integrazione_mappature?select=external_id,entita_id&tenant_id=eq.${T}&sistema=eq.${sistema}&entita=eq.cantiere`);
const cantieri = await get(`cantieri?select=id,codice_commessa,stato,nome&tenant_id=eq.${T}`);
const fasi = await get(`sottocantieri?select=id,cantiere_id,nome,codice,origine_gestionale_al&tenant_id=eq.${T}`);
const mapFasi = await get(`integrazione_mappature?select=external_id,entita_id&tenant_id=eq.${T}&sistema=eq.${sistema}&entita=eq.sottocantiere`);
const mappe = (r) => r.map((m) => ({ externalId: m.external_id, entitaId: m.entita_id }));
const adesso = new Date().toISOString();

const piano = pianificaFasiDalGestionale({
  sosta,
  cantierePerExternal: cantierePerExternalDa(mappe(mapCant), cantieri.map((c) => ({ id: c.id, codiceCommessa: c.codice_commessa }))),
  fasiNostre: fasi.map((f) => ({ id: f.id, cantiereId: f.cantiere_id, nome: f.nome, codice: f.codice, origineGestionaleAl: f.origine_gestionale_al })),
  mappature: mappe(mapFasi),
  adesso,
});

// I «senza padre», spiegati: il padre esiste ma e' chiuso / non collegato / sconosciuto.
const perCodice = new Map(cantieri.map((c) => [(c.codice_commessa ?? '').trim(), c]));
const spiegazione = { chiuso: 0, nonCollegato: 0, sconosciuto: 0 };
for (const s of piano.senzaPadre) {
  const c = s.externalCantiereId ? perCodice.get(s.externalCantiereId) : null;
  if (!c) spiegazione.sconosciuto += 1;
  else if (c.stato === 'chiuso') spiegazione.chiuso += 1;
  else spiegazione.nonCollegato += 1;
}
const padriOrfani = [...new Set(piano.senzaPadre.map((s) => s.externalCantiereId))];

console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} · ${slug} · gestionale ${sistema}`);
console.log(`in sosta: ${sosta.length} · cantieri collegati: ${mapCant.length} · fasi gia' nostre: ${fasi.length}`);
console.log(`da creare: ${piano.crea.length} · da aggiornare: ${piano.aggiorna.length} · da collegare: ${piano.mappa.filter((m) => m.entitaId).length} · senza padre: ${piano.senzaPadre.length}`);
console.log(`senza padre, perche': ${JSON.stringify(spiegazione)} · padri distinti: ${padriOrfani.length} ${padriOrfani.slice(0, 10).join(' ')}`);
const perCantiere = new Map();
for (const c of piano.crea) perCantiere.set(c.cantiereId, (perCantiere.get(c.cantiereId) ?? 0) + 1);
console.log(`cantieri che ricevono fasi: ${perCantiere.size}`);

if (!APPLY) process.exit(0);

let create = 0, aggiornate = 0, collegate = 0, errori = 0;
const idPerExternal = new Map();
for (const c of piano.crea) {
  try {
    const [row] = await post('sottocantieri', { tenant_id: T, cantiere_id: c.cantiereId, nome: c.nome, codice: c.codice, descrizione: c.descrizione, stato: 'attivo', origine_gestionale_al: adesso });
    idPerExternal.set(c.externalId, row.id);
    create += 1;
  } catch (e) { errori += 1; console.error('fase non creata', c.externalId, String(e.message).slice(0, 120)); }
}
for (const a of piano.aggiorna) {
  const { id, ...campi } = a;
  const body = { ...(campi.nome !== undefined ? { nome: campi.nome } : {}), ...(campi.codice !== undefined ? { codice: campi.codice } : {}), ...(campi.origineGestionaleAl !== undefined ? { origine_gestionale_al: campi.origineGestionaleAl } : {}) };
  try { await patch(`sottocantieri?id=eq.${id}&tenant_id=eq.${T}`, body); aggiornate += 1; } catch (e) { errori += 1; console.error('fase non aggiornata', id, String(e.message).slice(0, 120)); }
}
const righe = piano.mappa.map((m) => ({ externalId: m.externalId, entitaId: m.entitaId ?? idPerExternal.get(m.externalId) ?? null, nuova: m.nuova })).filter((m) => m.entitaId);
for (let i = 0; i < righe.length; i += 100) {
  const lotto = righe.slice(i, i + 100);
  try {
    await post('integrazione_mappature?on_conflict=tenant_id,sistema,entita,external_id', lotto.map((m) => ({ tenant_id: T, sistema, entita: 'sottocantiere', entita_id: m.entitaId, external_id: m.externalId, origine: 'automatico' })), { Prefer: 'resolution=merge-duplicates,return=minimal' });
    collegate += lotto.filter((m) => m.nuova && !idPerExternal.has(m.externalId)).length;
  } catch (e) { errori += lotto.length; console.error('mappature non scritte', String(e.message).slice(0, 160)); }
}
console.log(`FATTO · create ${create} · aggiornate ${aggiornate} · collegate (a mano) ${collegate} · mappature scritte ${righe.length} · errori ${errori}`);
