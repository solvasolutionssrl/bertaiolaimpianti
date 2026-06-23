/**
 * One-off: aggiunge il dipendente SANNA ANDREA al tenant FPM, gli crea
 * l'accesso app (username+password, no email) e appende le credenziali al CSV
 * in ~/Downloads. Idempotente: se l'utente/dipendente esiste già, si ferma.
 *
 *   node scripts/aggiungi-sanna.mjs
 *
 * NON stampa mai la password a video (finisce solo nel CSV).
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { randomInt } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../apps/web/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const BASE = env['NEXT_PUBLIC_SUPABASE_URL'];
const KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
if (!BASE || !KEY) throw new Error('Env mancante: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const TENANT_ID = 'c5c285f0-54c8-4268-a701-d302f28e362e';
const TENANT_SLUG = 'FPMIMP';
const NOME = 'Andrea';
const COGNOME = 'Sanna';
const MATRICOLA = '00065';
const USERNAME = 'andrea.sanna';
const EMAIL = `${USERNAME}@fpmimp.kommessa.local`;
const ROLE = 'tecnico';
const CSV = resolve(homedir(), 'Downloads', 'FPM_credenziali_accessi.csv');

// Password leggibile (parola + 2 cifre + simbolo), stile coerente col CSV esistente.
function generaPassword() {
  const parole = ['Cantiere', 'Impianto', 'Lanterna', 'Mestiere', 'Officina', 'Squadra', 'Martello', 'Saldatura', 'Bobina', 'Trapano'];
  const w = parole[randomInt(parole.length)];
  const n = String(randomInt(10, 99));
  const s = ['!', '@', '#', '$'][randomInt(4)];
  return `${w}${n}${s}`;
}

async function rest(method, path, body) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  // 0) Guard idempotenza: dipendente già presente?
  const esistenti = await rest(
    'GET',
    `dipendenti?tenant_id=eq.${TENANT_ID}&cognome=eq.${COGNOME}&nome=eq.${NOME}&select=id`,
  );
  if (Array.isArray(esistenti) && esistenti.length > 0) {
    console.log('Dipendente già esistente, niente da fare.');
    return;
  }

  const password = generaPassword();

  // 1) Crea utente auth (no email, login immediato).
  const createRes = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: `${NOME} ${COGNOME}` },
      app_metadata: {
        role: ROLE,
        tenant_id: TENANT_ID,
        tenant_slug: TENANT_SLUG,
        manual_account: true,
        platform_admin: false,
      },
    }),
  });
  const createTxt = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`createUser → ${createRes.status} ${createTxt}`);
  }
  const uid = JSON.parse(createTxt).id;
  if (!uid) throw new Error('auth id mancante');

  // 2) Riga applicativa public.users.
  await rest('POST', 'users', {
    id: uid,
    tenant_id: TENANT_ID,
    role: ROLE,
    display_name: `${NOME} ${COGNOME}`,
    attivo: true,
  });

  // 3) Dipendente collegato.
  await rest('POST', 'dipendenti', {
    tenant_id: TENANT_ID,
    nome: NOME,
    cognome: COGNOME,
    codice_interno: MATRICOLA,
    user_id: uid,
    stato_attivo: true,
    a_turni: false,
    note: 'Assunto dal 22/06/2026',
  });

  // 4) Append al CSV (Cognome;Nome;Matricola;Ruolo;Codice azienda;Username;Password).
  const riga = `${COGNOME};${NOME};${MATRICOLA};${ROLE};FPM;${USERNAME};${password}\n`;
  if (existsSync(CSV)) {
    let cur = readFileSync(CSV, 'utf8');
    if (cur.length && !cur.endsWith('\n')) cur += '\n';
    writeFileSync(CSV, cur + riga, 'utf8');
  } else {
    appendFileSync(CSV, `﻿Cognome;Nome;Matricola;Ruolo;Codice azienda;Username;Password\n${riga}`, 'utf8');
  }

  // NB: niente password a stdout.
  console.log(`OK — creato dipendente ${COGNOME} ${NOME} (${MATRICOLA}), login ${EMAIL}, ruolo ${ROLE}.`);
  console.log('Credenziali aggiunte a ~/Downloads/FPM_credenziali_accessi.csv');
}

main().catch((e) => {
  console.error('ERRORE:', e.message);
  process.exit(1);
});
