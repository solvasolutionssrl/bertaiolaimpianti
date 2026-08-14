/**
 * Archivio delle presenze prima di ripartire puliti.
 *
 * Tira fuori TUTTO quello che c'è di operativo su un tenant Kantiere —
 * timbrature, giornate, ore per cantiere, viaggi, spese — e lo scrive in CSV
 * leggibili **senza il database**: dentro ci sono i nomi delle persone e dei
 * cantieri, non solo i codici interni. Serve a poter cancellare i dati vivi
 * sapendo che restano leggibili fra tre anni.
 *
 *   node scripts/archivio-kantiere/esporta.mjs            # FPMIMP
 *   node scripts/archivio-kantiere/esporta.mjs DEMOC
 *
 * NON cancella niente. È in sola lettura.
 *
 * Le righe di collaudo (le giornate finte create per provare l'integrazione)
 * NON vengono buttate via: finiscono in `99_escluse_collaudo.csv`, così si
 * vede cosa è stato tolto e perché invece di doversi fidare.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!BASE || !KEY) {
  console.error('Mancano NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const SLUG = process.argv[2] ?? 'FPMIMP';

/** Legge una tabella intera, a pagine: PostgREST ne dà 1000 per volta. */
async function leggi(tabella, query) {
  const out = [];
  const PASSO = 1000;
  for (let da = 0; ; da += PASSO) {
    const url = `${BASE}/rest/v1/${tabella}?${query}&limit=${PASSO}&offset=${da}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`${tabella}: ${res.status} ${await res.text()}`);
    const pagina = await res.json();
    out.push(...pagina);
    if (pagina.length < PASSO) return out;
  }
}

// ── formattazione ──────────────────────────────────────────────────────────

/** "2026-08-14 07:32:10" nell'ora di casa nostra, non in UTC. */
function oraLocale(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
}
/** Solo la data, ora di casa nostra. */
function dataLocale(iso) {
  return oraLocale(iso).slice(0, 10);
}
/** 7.5 → "7:30". Le ore si leggono così, non come numero con la virgola. */
function hmm(ore) {
  const n = Number(ore ?? 0);
  if (!Number.isFinite(n)) return '';
  const min = Math.round(n * 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}
function minutiHmm(min) {
  const n = Number(min ?? 0);
  if (!Number.isFinite(n) || n === 0) return '';
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
/** Virgola decimale: è un CSV che si apre in Italia. */
function num(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace('.', ',');
}

/**
 * Punto e virgola come separatore e BOM in testa: è quello che Excel italiano
 * si aspetta. Con la virgola aprirebbe tutto in una colonna sola.
 */
function csv(intestazioni, righe) {
  const cella = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const testo = [
    intestazioni.join(';'),
    ...righe.map((r) => intestazioni.map((h) => cella(r[h])).join(';')),
  ].join('\r\n');
  return '﻿' + testo + '\r\n';
}

// ── raccolta ───────────────────────────────────────────────────────────────

const tenants = await leggi('tenants', `slug=eq.${SLUG}&select=id,nome,slug`);
const tenant = tenants[0];
if (!tenant) {
  console.error(`Nessun cliente con slug ${SLUG}`);
  process.exit(1);
}
const T = `tenant_id=eq.${tenant.id}`;
console.log(`Cliente: ${tenant.nome} (${tenant.slug})\n`);

const [dipendenti, cantieri, sedi, mezzi, timbrature, rapportini, viaggi, spese] =
  await Promise.all([
    leggi('dipendenti', `${T}&select=id,nome,cognome,mansione,stato_attivo,codice_interno`),
    leggi('cantieri', `${T}&select=id,codice,nome,cliente_nome,codice_commessa,indirizzo,categoria`),
    leggi('sedi', `${T}&select=id,nome,indirizzo`),
    leggi('mezzi', `${T}&select=id,targa,modello,tipo`),
    leggi('timbrature', `${T}&select=*&order=ts.asc`),
    leggi('rapportini', `${T}&select=*&order=data.asc`),
    leggi('timbratura_viaggio', `${T}&select=*&order=data.asc`),
    leggi('spese', `${T}&select=*&order=created_at.asc`),
  ]);

// Le righe ore stanno appese ai rapportini: niente tenant_id proprio.
const idRapportini = new Set(rapportini.map((r) => r.id));
const righeOre = (
  await leggi('rapportino_righe', `select=*`)
).filter((r) => idRapportini.has(r.rapportino_id));

const perId = (lista) => new Map(lista.map((x) => [x.id, x]));
const mDip = perId(dipendenti);
const mCan = perId(cantieri);
const mSedi = perId(sedi);
const mMezzi = perId(mezzi);
const mRap = perId(rapportini);

const persona = (id) => {
  const d = mDip.get(id);
  return d ? `${d.cognome ?? ''} ${d.nome ?? ''}`.trim() : '';
};
const cantiere = (id) => {
  const c = mCan.get(id);
  return c ? c.nome ?? '' : '';
};
const codiceCantiere = (id) => mCan.get(id)?.codice ?? '';

// ── cosa è collaudo ────────────────────────────────────────────────────────
// Il marcatore è la NOTA sulla giornata, non il cantiere: sul cantiere di prova
// c'è finita anche attività vera, e cancellare per cantiere la porterebbe via.
const RE_COLLAUDO = /collaudo/i;
const giornateProva = new Set(
  rapportini
    .filter((r) => RE_COLLAUDO.test(r.note ?? ''))
    .map((r) => `${r.dipendente_id}|${r.data}`),
);
const eProva = (dipendenteId, data) => giornateProva.has(`${dipendenteId}|${data}`);

// ── costruzione delle tabelle ──────────────────────────────────────────────

const H_GIORNATE = [
  'data', 'dipendente', 'mansione', 'stato', 'auto_compilato',
  'ore_ordinarie', 'ore_ordinarie_hmm', 'ore_straordinarie', 'ore_straordinarie_hmm',
  'ore_viaggio', 'ore_viaggio_hmm', 'cantieri_del_giorno', 'note',
  'approvato_da', 'approvato_il', 'id_giornata', 'id_dipendente',
];
const H_TIMBRATURE = [
  'data', 'ora', 'dipendente', 'tipo', 'pausa', 'origine', 'auto_chiusa',
  'cantiere', 'codice_cantiere', 'lat', 'lng', 'registrata_il',
  'id_timbratura', 'id_dipendente', 'id_cantiere',
];
const H_ORE = [
  'data', 'dipendente', 'cantiere', 'codice_cantiere', 'commessa_esterna',
  'ore_ordinarie', 'ore_ordinarie_hmm', 'ore_straordinarie', 'ore_straordinarie_hmm',
  'ore_viaggio', 'ore_viaggio_hmm', 'note', 'id_riga', 'id_giornata',
];
const H_VIAGGI = [
  'data', 'dipendente', 'direzione', 'da_cantiere', 'sede', 'cantiere',
  'km', 'minuti_stimati', 'tempo_stimato_hmm', 'minuti_pagati', 'tempo_pagato_hmm',
  'autista', 'mezzo', 'giustificazione', 'id_viaggio', 'id_dipendente',
];
const H_SPESE = [
  'data_scontrino', 'dipendente', 'cantiere', 'codice_cantiere', 'categoria',
  'esercente', 'partita_iva', 'numero_documento', 'imponibile', 'iva',
  'totale', 'valuta', 'pagamento', 'persone', 'stato', 'rimborsabile',
  'note', 'foto_r2', 'creata_il', 'id_spesa',
];

const giornate = [];
const escluse = [];

for (const r of rapportini) {
  const righe = righeOre.filter((x) => x.rapportino_id === r.id);
  const somma = (k) => righe.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  const ord = somma('ore_ordinarie');
  const straord = somma('ore_straordinarie');
  const viagg = somma('ore_viaggio');
  const riga = {
    data: r.data,
    dipendente: persona(r.dipendente_id),
    mansione: mDip.get(r.dipendente_id)?.mansione ?? '',
    stato: r.stato,
    auto_compilato: r.auto_compilato ? 'si' : 'no',
    ore_ordinarie: num(ord),
    ore_ordinarie_hmm: hmm(ord),
    ore_straordinarie: num(straord),
    ore_straordinarie_hmm: hmm(straord),
    ore_viaggio: num(viagg),
    ore_viaggio_hmm: hmm(viagg),
    cantieri_del_giorno: [
      ...new Set(righe.map((x) => cantiere(x.cantiere_id)).filter(Boolean)),
    ].join(' + '),
    note: r.note ?? '',
    approvato_da: r.approvato_da ?? '',
    approvato_il: oraLocale(r.approvato_at),
    id_giornata: r.id,
    id_dipendente: r.dipendente_id,
  };
  if (eProva(r.dipendente_id, r.data)) escluse.push({ tabella: 'giornata', ...riga });
  else giornate.push(riga);
}

const timbRighe = [];
for (const t of timbrature) {
  const data = dataLocale(t.ts);
  const riga = {
    data,
    ora: oraLocale(t.ts).slice(11),
    dipendente: persona(t.dipendente_id),
    tipo: t.tipo,
    pausa: t.pausa ? 'si' : 'no',
    origine: t.origine,
    auto_chiusa: t.auto_chiusa ? 'si' : 'no',
    cantiere: cantiere(t.cantiere_id),
    codice_cantiere: codiceCantiere(t.cantiere_id),
    lat: num(t.geo_lat),
    lng: num(t.geo_lng),
    registrata_il: oraLocale(t.created_at),
    id_timbratura: t.id,
    id_dipendente: t.dipendente_id,
    id_cantiere: t.cantiere_id ?? '',
  };
  if (eProva(t.dipendente_id, data)) escluse.push({ tabella: 'timbratura', ...riga });
  else timbRighe.push(riga);
}

const oreRighe = [];
for (const x of righeOre) {
  const r = mRap.get(x.rapportino_id);
  if (!r) continue;
  const c = mCan.get(x.cantiere_id);
  const riga = {
    data: r.data,
    dipendente: persona(r.dipendente_id),
    cantiere: cantiere(x.cantiere_id),
    codice_cantiere: codiceCantiere(x.cantiere_id),
    commessa_esterna: c?.codice_commessa ?? '',
    ore_ordinarie: num(x.ore_ordinarie),
    ore_ordinarie_hmm: hmm(x.ore_ordinarie),
    ore_straordinarie: num(x.ore_straordinarie),
    ore_straordinarie_hmm: hmm(x.ore_straordinarie),
    ore_viaggio: num(x.ore_viaggio),
    ore_viaggio_hmm: hmm(x.ore_viaggio),
    note: x.note ?? '',
    id_riga: x.id,
    id_giornata: x.rapportino_id,
  };
  if (eProva(r.dipendente_id, r.data)) escluse.push({ tabella: 'riga_ore', ...riga });
  else oreRighe.push(riga);
}

const viaggiRighe = [];
for (const v of viaggi) {
  const m = mMezzi.get(v.mezzo_id);
  const riga = {
    data: v.data,
    dipendente: persona(v.dipendente_id),
    direzione: v.direzione,
    da_cantiere: cantiere(v.da_cantiere_id),
    sede: mSedi.get(v.sede_id)?.nome ?? '',
    cantiere: cantiere(v.cantiere_id),
    km: num(v.distanza_km),
    minuti_stimati: v.durata_stimata_min ?? '',
    tempo_stimato_hmm: minutiHmm(v.durata_stimata_min),
    minuti_pagati: v.durata_confermata_min ?? '',
    tempo_pagato_hmm: minutiHmm(v.durata_confermata_min),
    autista: v.autista ? 'si' : 'no',
    mezzo: m ? `${m.modello ?? ''} ${m.targa ?? ''}`.trim() : '',
    giustificazione: v.giustificazione ?? '',
    id_viaggio: v.id,
    id_dipendente: v.dipendente_id,
  };
  if (eProva(v.dipendente_id, v.data)) escluse.push({ tabella: 'viaggio', ...riga });
  else viaggiRighe.push(riga);
}

const speseRighe = [];
for (const s of spese) {
  const riga = {
    data_scontrino: dataLocale(s.data_scontrino) || dataLocale(s.created_at),
    dipendente: persona(s.dipendente_id),
    cantiere: cantiere(s.cantiere_id),
    codice_cantiere: codiceCantiere(s.cantiere_id),
    categoria: s.categoria ?? '',
    esercente: s.ragione_sociale ?? '',
    partita_iva: s.partita_iva ?? '',
    numero_documento: s.numero_documento ?? '',
    imponibile: num(s.imponibile),
    iva: num(s.importo_iva),
    totale: num(s.importo_totale),
    valuta: s.valuta ?? '',
    pagamento: s.metodo_pagamento ?? '',
    persone: s.numero_persone ?? '',
    stato: s.stato ?? '',
    rimborsabile: s.rimborsabile ? 'si' : 'no',
    note: s.note ?? '',
    foto_r2: s.r2_key ?? '',
    creata_il: oraLocale(s.created_at),
    id_spesa: s.id,
  };
  // Le spese non hanno una "giornata": si riconoscono dalla nota.
  if (RE_COLLAUDO.test(s.note ?? '')) escluse.push({ tabella: 'spesa', ...riga });
  else speseRighe.push(riga);
}

// ── scrittura ──────────────────────────────────────────────────────────────

const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const cartella = join(__dirname, 'esiti', `${SLUG}_${oggi}`);
mkdirSync(cartella, { recursive: true });

const scritti = [
  ['01_giornate.csv', H_GIORNATE, giornate],
  ['02_timbrature.csv', H_TIMBRATURE, timbRighe],
  ['03_ore_per_cantiere.csv', H_ORE, oreRighe],
  ['04_viaggi.csv', H_VIAGGI, viaggiRighe],
  ['05_spese.csv', H_SPESE, speseRighe],
];
for (const [nome, head, righe] of scritti) {
  writeFileSync(join(cartella, nome), csv(head, righe));
  console.log(`  ${nome.padEnd(26)} ${String(righe.length).padStart(5)} righe`);
}

writeFileSync(
  join(cartella, '90_dipendenti.csv'),
  csv(
    ['cognome', 'nome', 'mansione', 'attivo', 'codice_interno', 'id_dipendente'],
    dipendenti
      .map((d) => ({
        cognome: d.cognome ?? '',
        nome: d.nome ?? '',
        mansione: d.mansione ?? '',
        codice_interno: d.codice_interno ?? '',
        attivo: d.stato_attivo ? 'si' : 'no',
        id_dipendente: d.id,
      }))
      .sort((a, b) => a.cognome.localeCompare(b.cognome)),
  ),
);
const cantieriUsati = new Set(
  [...timbRighe, ...oreRighe].map((r) => r.codice_cantiere).filter(Boolean),
);
writeFileSync(
  join(cartella, '91_cantieri.csv'),
  csv(
    ['codice', 'nome', 'cliente', 'commessa_esterna', 'indirizzo', 'categoria', 'usato', 'id_cantiere'],
    cantieri
      .map((c) => ({
        codice: c.codice ?? '',
        nome: c.nome ?? '',
        cliente: c.cliente_nome ?? '',
        commessa_esterna: c.codice_commessa ?? '',
        indirizzo: c.indirizzo ?? '',
        categoria: c.categoria ?? '',
        usato: cantieriUsati.has(c.codice) ? 'si' : 'no',
        id_cantiere: c.id,
      }))
      .sort((a, b) => a.codice.localeCompare(b.codice)),
  ),
);
console.log(`  90_dipendenti.csv          ${String(dipendenti.length).padStart(5)} righe`);
console.log(`  91_cantieri.csv            ${String(cantieri.length).padStart(5)} righe`);

const H_ESCLUSE = ['tabella', 'data', 'dipendente', 'cantiere', 'note', 'motivo'];
writeFileSync(
  join(cartella, '99_escluse_collaudo.csv'),
  csv(
    H_ESCLUSE,
    escluse.map((e) => ({
      tabella: e.tabella,
      data: e.data ?? e.data_scontrino ?? '',
      dipendente: e.dipendente ?? '',
      cantiere: e.cantiere ?? '',
      note: e.note ?? '',
      motivo: 'giornata di collaudo integrazione, non e\' lavoro vero',
    })),
  ),
);
console.log(`  99_escluse_collaudo.csv    ${String(escluse.length).padStart(5)} righe (NON sono nell'archivio)`);

// ── verifica: i conti tornano? ─────────────────────────────────────────────

const problemi = [];
const controlla = (ok, testo) => {
  if (!ok) problemi.push(testo);
  console.log(`  ${ok ? '✓' : '✗'} ${testo}`);
};

console.log('\nVerifica');
controlla(
  giornate.length + escluse.filter((e) => e.tabella === 'giornata').length === rapportini.length,
  `giornate: ${giornate.length} esportate + ${escluse.filter((e) => e.tabella === 'giornata').length} escluse = ${rapportini.length} nel database`,
);
controlla(
  timbRighe.length + escluse.filter((e) => e.tabella === 'timbratura').length === timbrature.length,
  `timbrature: ${timbRighe.length} + ${escluse.filter((e) => e.tabella === 'timbratura').length} = ${timbrature.length}`,
);
controlla(
  oreRighe.length + escluse.filter((e) => e.tabella === 'riga_ore').length === righeOre.length,
  `righe ore: ${oreRighe.length} + ${escluse.filter((e) => e.tabella === 'riga_ore').length} = ${righeOre.length}`,
);
controlla(
  viaggiRighe.length + escluse.filter((e) => e.tabella === 'viaggio').length === viaggi.length,
  `viaggi: ${viaggiRighe.length} + ${escluse.filter((e) => e.tabella === 'viaggio').length} = ${viaggi.length}`,
);
controlla(
  speseRighe.length + escluse.filter((e) => e.tabella === 'spesa').length === spese.length,
  `spese: ${speseRighe.length} + ${escluse.filter((e) => e.tabella === 'spesa').length} = ${spese.length}`,
);

// Nessuna riga senza un nome di persona: sarebbe illeggibile fra tre anni.
const senzaNome = [...giornate, ...timbRighe, ...oreRighe, ...viaggiRighe].filter(
  (r) => !r.dipendente,
).length;
controlla(senzaNome === 0, `ogni riga ha il nome della persona (${senzaNome} senza)`);

const timbSenzaCantiere = timbRighe.filter((r) => !r.cantiere).length;
controlla(
  timbSenzaCantiere === 0,
  `ogni timbratura ha il nome del cantiere (${timbSenzaCantiere} senza)`,
);

// Le ore del riepilogo devono coincidere con quelle di dettaglio.
const totGiornate = giornate.reduce((a, r) => a + Number(String(r.ore_ordinarie).replace(',', '.') || 0), 0);
const totRighe = oreRighe.reduce((a, r) => a + Number(String(r.ore_ordinarie).replace(',', '.') || 0), 0);
controlla(
  Math.abs(totGiornate - totRighe) < 0.01,
  `le ore ordinarie del riepilogo tornano col dettaglio (${hmm(totGiornate)} vs ${hmm(totRighe)})`,
);

const ingressi = timbRighe.filter((r) => r.tipo === 'ingresso').length;
const uscite = timbRighe.filter((r) => r.tipo === 'uscita').length;

// Giornate in cui ingressi e uscite non si appaiano. NON è un difetto
// dell'esportazione: è come stanno le cose nei dati, e va detto qui perché
// dopo la cancellazione non ci sarà più modo di accorgersene.
const perGiornata = new Map();
for (const r of timbRighe) {
  const k = `${r.data}|${r.dipendente}`;
  const v = perGiornata.get(k) ?? { ingresso: 0, uscita: 0 };
  v[r.tipo] = (v[r.tipo] ?? 0) + 1;
  perGiornata.set(k, v);
}
const sbilanciate = [...perGiornata.entries()].filter(([, v]) => v.ingresso !== v.uscita);
console.log(`\n  ingressi ${ingressi} · uscite ${uscite} · differenza ${ingressi - uscite}`);
if (sbilanciate.length) {
  console.log(`  ⚠ ${sbilanciate.length} giornate con ingressi e uscite non appaiati (dati di origine, non export):`);
  for (const [k, v] of sbilanciate) {
    const [d, chi] = k.split('|');
    console.log(`      ${d}  ${chi} — ${v.ingresso} ingressi, ${v.uscita} uscite`);
  }
}
console.log(`  ore ordinarie totali archiviate: ${hmm(totRighe)}`);
console.log(`  km totali archiviati: ${num(
  viaggiRighe.reduce((a, r) => a + Number(String(r.km).replace(',', '.') || 0), 0).toFixed(1),
)}`);

// ── la mappatura, scritta insieme ai dati ──────────────────────────────────
// Sta qui dentro e non in un file a parte scritto a mano: così non può
// raccontare una cosa diversa da quella che il programma ha davvero fatto.

const totKm = viaggiRighe.reduce((a, r) => a + Number(String(r.km).replace(',', '.') || 0), 0);
const totSpese = speseRighe.reduce((a, r) => a + Number(String(r.totale).replace(',', '.') || 0), 0);

const mappatura = `# Archivio presenze — ${tenant.nome} (${tenant.slug})

Estratto il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} da
\`scripts/archivio-kantiere/esporta.mjs\`. Rifacendolo si riottengono gli stessi file.

**A cosa serve.** Tenere leggibile quello che è stato registrato prima di
ripulire i dati vivi per la partenza in produzione. I file si leggono da soli:
dentro ci sono i nomi delle persone e dei cantieri, non solo i codici interni.

## Come aprirli

Separatore **punto e virgola**, testo **UTF-8 con BOM**, decimali con la
**virgola**: si aprono con un doppio clic in Excel italiano. Le date sono
\`AAAA-MM-GG\` e le ore sono ora italiana (Europe/Rome), già convertite — nel
database sono in UTC.

Ogni riga porta anche il proprio codice interno (\`id_...\`): serve solo se un
domani si volessero ricaricare i dati, per non creare doppioni.

## I file

| File | Righe | Una riga è | Viene da |
|---|---:|---|---|
| \`01_giornate.csv\` | ${giornate.length} | una persona in un giorno | \`rapportini\` + somma di \`rapportino_righe\` |
| \`02_timbrature.csv\` | ${timbRighe.length} | una timbrata (ingresso/uscita) | \`timbrature\` |
| \`03_ore_per_cantiere.csv\` | ${oreRighe.length} | le ore di una persona su un cantiere in un giorno | \`rapportino_righe\` |
| \`04_viaggi.csv\` | ${viaggiRighe.length} | una tratta | \`timbratura_viaggio\` |
| \`05_spese.csv\` | ${speseRighe.length} | uno scontrino | \`spese\` |
| \`90_dipendenti.csv\` | ${dipendenti.length} | una persona | \`dipendenti\` |
| \`91_cantieri.csv\` | ${cantieri.length} | un cantiere | \`cantieri\` |
| \`99_escluse_collaudo.csv\` | ${escluse.length} | una riga **tolta** dall'archivio | vedi sotto |

## Le colonne, da dove arrivano

**01_giornate** — \`data\`, \`stato\` e \`note\` sono di \`rapportini\`.
\`dipendente\` è \`cognome + nome\` da \`dipendenti\`. Le ore sono la **somma**
delle righe di dettaglio dello stesso giorno, quindi \`01\` e \`03\` devono
tornare (il programma lo verifica). \`cantieri_del_giorno\` elenca i cantieri
toccati. \`auto_compilato\` dice se la giornata è stata scritta dalle timbrature
invece che a mano.

**02_timbrature** — la verità di partenza: tutto il resto è calcolato da qui.
\`tipo\` è ingresso/uscita, \`pausa\` distingue la pausa pranzo dal turno.
\`origine\`: \`qr\` = tornello, \`cronometro\` = tasto nell'app, \`manuale\` =
inserita dall'ufficio. \`auto_chiusa\` segna le righe messe dal sistema quando
una pausa è rimasta aperta.

**03_ore_per_cantiere** — lo spacchettamento delle ore per cantiere.
\`commessa_esterna\` è il codice sul gestionale, se il cantiere ce l'ha.

**04_viaggi** — \`direzione\` andata/ritorno; con \`da_cantiere\` valorizzato è
uno spostamento fra due cantieri. \`minuti_pagati\` (\`durata_confermata_min\`) a
zero vuol dire **registrato ma non pagato**: è il caso dei trasferimenti fra
cantieri.

**05_spese** — importi come li ha letti l'AI dallo scontrino e poi confermati.
\`foto_r2\` è dove sta la foto: **le immagini non sono in questo archivio**, se
servono vanno scaricate a parte prima di svuotare il bucket.

## Cosa è stato tolto, e perché

Le **${giornateProva.size} giornate di collaudo** create per provare
l'integrazione col gestionale — non sono lavoro vero. Sono in
\`99_escluse_collaudo.csv\`, non buttate via.

⚠️ Il riconoscimento è la **nota sulla giornata** (\`collaudo\`), **non il
cantiere**. Sul cantiere di prova è finita anche attività vera: filtrare per
cantiere avrebbe portato via dati buoni.

## Verifica al momento dell'estrazione

- giornate ${giornate.length} + ${escluse.filter((e) => e.tabella === 'giornata').length} escluse = ${rapportini.length} nel database
- timbrature ${timbRighe.length} + ${escluse.filter((e) => e.tabella === 'timbratura').length} = ${timbrature.length}
- righe ore ${oreRighe.length} + ${escluse.filter((e) => e.tabella === 'riga_ore').length} = ${righeOre.length}
- viaggi ${viaggiRighe.length} + ${escluse.filter((e) => e.tabella === 'viaggio').length} = ${viaggi.length}
- spese ${speseRighe.length} + ${escluse.filter((e) => e.tabella === 'spesa').length} = ${spese.length}
- ore ordinarie totali **${hmm(totRighe)}** · km totali **${totKm.toFixed(1).replace('.', ',')}** · spese **€ ${totSpese.toFixed(2).replace('.', ',')}**
- ingressi ${ingressi} · uscite ${uscite}

${
  sbilanciate.length
    ? `### ⚠️ Giornate con ingressi e uscite non appaiati (${sbilanciate.length})

Sono **così nei dati di partenza**, non è l'esportazione che ha perso righe.
Vanno guardate prima di cancellare, perché dopo non ci sarà più modo.

${sbilanciate.map(([k, v]) => { const [d, chi] = k.split('|'); return `- **${d}** — ${chi}: ${v.ingresso} ingressi, ${v.uscita} uscite`; }).join('\n')}
`
    : 'Ingressi e uscite si appaiano su tutte le giornate.\n'
}`;

writeFileSync(join(cartella, 'MAPPATURA.md'), mappatura);
console.log('\n  MAPPATURA.md scritta');

console.log(`\nScritto in: ${cartella}`);
if (problemi.length) {
  console.log(`\n⚠️  ${problemi.length} controlli NON passati: non cancellare niente finché non tornano.`);
  process.exitCode = 1;
} else {
  console.log('\nTutti i controlli passati.');
}
