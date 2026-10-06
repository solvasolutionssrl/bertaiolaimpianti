/**
 * Crea gli accessi di tante persone partendo da un foglio.
 *
 * PERCHE' ESISTE: distribuire gli accessi a una squadra intera e' un gesto da
 * fare una volta, con il foglio del personale davanti. Farlo dal pannello,
 * venti volte di fila, vuol dire venti occasioni di battere male un nome e
 * nessun elenco finale da stampare.
 *
 * COSA FA, E COSA NON FA
 *   - Crea l'account (Supabase Auth + riga `users`) con una password temporanea
 *     che la persona dovra' cambiare al primo ingresso.
 *   - Se il modulo Personale e' attivo, crea anche la **scheda del dipendente**
 *     e la collega all'account: senza quella, la tab Dipendenti resta vuota e
 *     lo storico per persona non ha a cosa attaccarsi.
 *   - **Non tocca chi esiste gia'.** Se quel nome utente c'e', lo salta e lo
 *     dice. Rigenerare la password di chi sta gia' lavorando lo butterebbe
 *     fuori senza preavviso.
 *
 * SICUREZZA
 *   - DRY-RUN di default: senza `--apply` non scrive niente.
 *   - Le regole su nome utente e password sono le stesse dell'app
 *     (`packages/api/src/identita.ts`), importate — non ricopiate.
 *   - Le password si vedono una volta: a schermo, e in un file solo se lo
 *     chiedi tu con `--credenziali=`. Il file **non puo' stare dentro il
 *     repository**: lo script si rifiuta, per non farlo finire in un commit.
 *
 * IL FOGLIO
 *   Una riga per persona. Colonne per indice (0-based), tutte spostabili:
 *     --col-nome=0  --col-cognome=1  --col-utente=2  --col-ruolo=3  --col-capo=4
 *   `utente` e' facoltativo: se manca si propone `iniziale.cognome`.
 *   `ruolo` e' facoltativo: senza, tecnico.
 *   `capo` e' facoltativo: una «X» da' i poteri del capo squadra.
 *
 * USO
 *   pnpm tsx scripts/crea-utenti-da-file.ts --tenant=BER --file=~/squadra.xlsx
 *   … --apply --credenziali=~/Desktop/accessi-bertaiola.txt
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

import {
  BYTE_TEMPORANEA,
  aliasLogin,
  componiPasswordTemporanea,
  proponiUsername,
  validaUsername,
} from '../packages/api/src/identita';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, '..');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

function env() {
  const raw = readFileSync(resolve(RADICE, 'apps/web/.env.local'), 'utf8');
  const leggi = (k: string) =>
    raw
      .split('\n')
      .find((r) => r.startsWith(`${k}=`))
      ?.slice(k.length + 1)
      .trim()
      .replace(/^["']|["']$/g, '') ?? '';
  return { url: leggi('NEXT_PUBLIC_SUPABASE_URL'), key: leggi('SUPABASE_SERVICE_ROLE_KEY') };
}

const COL = {
  nome: Number(arg('col-nome') ?? 0),
  cognome: Number(arg('col-cognome') ?? 1),
  utente: Number(arg('col-utente') ?? 2),
  ruolo: Number(arg('col-ruolo') ?? 3),
  capo: Number(arg('col-capo') ?? 4),
};
const SEGNO_CAPO = (arg('segno-capo') ?? 'X').toUpperCase();
/**
 * Come si scrive un ruolo in un foglio compilato da un umano.
 *
 * Nel database si chiamano `tecnico`/`office`/`admin`, ma chi riempie la
 * colonna scrive «ufficio» e «amministratore». Senza queste corrispondenze il
 * foglio veniva accettato e **tutti diventavano tecnici**, con un avviso che
 * si perdeva fra venti righe.
 */
const RUOLI: Record<string, 'tecnico' | 'office' | 'admin'> = {
  tecnico: 'tecnico',
  tecnici: 'tecnico',
  operaio: 'tecnico',
  office: 'office',
  ufficio: 'office',
  segreteria: 'office',
  impiegato: 'office',
  admin: 'admin',
  amministratore: 'admin',
  titolare: 'admin',
};

interface Riga {
  nome: string;
  cognome: string;
  username: string;
  ruolo: 'tecnico' | 'office' | 'admin';
  capo: boolean;
  problema?: string;
}

function cella(r: unknown[], i: number): string {
  const v = r[i];
  return v === undefined || v === null ? '' : String(v).trim();
}

function leggiFoglio(percorso: string): Riga[] {
  // ⚠ `codepage: 65001` non è un dettaglio: senza, un CSV in UTF-8 viene letto
  // come latin1 e «Nicolò» diventa «NicolÃ²». Verificato provandolo.
  const wb = XLSX.readFile(percorso, { codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const righe = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

  const out: Riga[] = [];
  for (const r of righe) {
    const nome = cella(r, COL.nome);
    const cognome = cella(r, COL.cognome);
    if (!nome && !cognome) continue;

    // Le intestazioni si riconoscono da sole: «Nome»/«Cognome» nelle celle che
    // dovrebbero contenere un nome. Così non serve sapere quante righe di
    // titolo ha questo foglio in particolare.
    const t = `${nome} ${cognome}`.toLowerCase();
    if (/^\s*(nome|cognome|nominativo|dipendente)\b/.test(t)) continue;

    const ruoloScritto = cella(r, COL.ruolo);
    const ruolo = RUOLI[ruoloScritto.toLowerCase()] ?? 'tecnico';
    const ruoloIgnoto = ruoloScritto !== '' && RUOLI[ruoloScritto.toLowerCase()] === undefined;

    const utenteGrezzo = cella(r, COL.utente);
    const proposto = utenteGrezzo || proponiUsername(nome, cognome) || '';
    const vu = validaUsername(proposto);

    out.push({
      nome,
      cognome,
      username: vu.ok ? vu.username : proposto,
      ruolo,
      capo: cella(r, COL.capo).toUpperCase() === SEGNO_CAPO,
      ...(vu.ok ? {} : { problema: vu.motivo }),
      ...(ruoloIgnoto
        ? { problema: `non so cosa sia il ruolo «${ruoloScritto}», lo metto come tecnico` }
        : {}),
    });
  }
  return out;
}

async function main() {
  const slug = (arg('tenant') ?? '').toUpperCase();
  const file = arg('file');
  const applica = flag('apply');
  const credenziali = arg('credenziali');

  if (!slug || !file) {
    console.error('Uso: --tenant=SIGLA --file=percorso.xlsx [--apply] [--credenziali=percorso.txt]');
    process.exit(1);
  }
  if (credenziali) {
    const dove = resolve(credenziali.replace(/^~/, process.env.HOME ?? '~'));
    if (dove.startsWith(RADICE)) {
      console.error(
        `\n✗ Il file delle credenziali non puo' stare dentro il repository (${dove}).\n` +
          '  Finirebbe in un commit. Mettilo sul Desktop o in una cartella fuori dal progetto.\n',
      );
      process.exit(1);
    }
  }

  const { url, key } = env();
  if (!url || !key) {
    console.error('Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: tenant } = await db
    .from('tenants')
    .select('id, slug, nome, codice_azienda, login_senza_codice')
    .eq('slug', slug)
    .maybeSingle();
  if (!tenant) {
    console.error(`Nessuno spazio di lavoro con sigla ${slug}.`);
    process.exit(1);
  }
  const t = tenant as {
    id: string;
    slug: string;
    nome: string;
    codice_azienda: string | null;
    login_senza_codice: boolean | null;
  };

  // La scheda del personale si crea solo se il modulo c'è: altrimenti sarebbero
  // righe che nessuna pagina mostra.
  const { data: mod } = await db
    .from('tenant_modules')
    .select('attivo')
    .eq('tenant_id', t.id)
    .eq('module_code', 'dipendenti')
    .maybeSingle();
  const conScheda = (mod as { attivo?: boolean } | null)?.attivo === true;

  const righe = leggiFoglio(resolve(file.replace(/^~/, process.env.HOME ?? '~')));
  if (righe.length === 0) {
    console.error('Il foglio non contiene righe utilizzabili.');
    process.exit(1);
  }

  // Chi esiste già: una chiamata, non una per riga.
  const esistenti = new Set<string>();
  const { data: elenco } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const au of elenco?.users ?? []) {
    if (au.email) esistenti.add(au.email.toLowerCase());
  }

  // Doppioni dentro il foglio stesso: due «m.rossi» nella stessa colonna sono
  // un errore di chi ha compilato, non un caso da risolvere a caso.
  const visti = new Map<string, number>();
  for (const r of righe) visti.set(r.username, (visti.get(r.username) ?? 0) + 1);

  console.log(`\n${t.nome} (${t.slug}) — ${righe.length} righe nel foglio`);
  console.log(`Scheda del personale: ${conScheda ? 'sì, il modulo è attivo' : 'no, modulo spento'}`);
  console.log(
    `Codice azienda da battere al login: ${
      t.login_senza_codice ? '(nessuno, campo vuoto)' : (t.codice_azienda ?? '— non impostato —')
    }`,
  );
  console.log(applica ? '\n*** APPLICO ***\n' : '\n--- PROVA, non scrivo niente (aggiungi --apply) ---\n');

  const fatti: { nome: string; username: string; password: string }[] = [];
  let saltati = 0;
  let errori = 0;

  for (const r of righe) {
    const etichetta = `${r.nome} ${r.cognome}`.trim();
    const vu = validaUsername(r.username);
    if (!vu.ok) {
      console.log(`  ✗ ${etichetta.padEnd(28)} ${vu.motivo}`);
      errori += 1;
      continue;
    }
    if ((visti.get(vu.username) ?? 0) > 1) {
      console.log(`  ✗ ${etichetta.padEnd(28)} «${vu.username}» compare più volte nel foglio: scegli tu quale`);
      errori += 1;
      continue;
    }
    const alias = aliasLogin(vu.username, t.slug);
    if (esistenti.has(alias)) {
      console.log(`  — ${etichetta.padEnd(28)} «${vu.username}» esiste già: lasciato com'è`);
      saltati += 1;
      continue;
    }
    if (r.problema) console.log(`    ⚠ ${etichetta}: ${r.problema}`);

    const password = componiPasswordTemporanea(new Uint8Array(randomBytes(BYTE_TEMPORANEA)));

    if (!applica) {
      console.log(
        `  + ${etichetta.padEnd(28)} ${vu.username.padEnd(20)} ${r.ruolo}${r.capo ? ' · capo squadra' : ''}${
          conScheda ? ' · con scheda' : ''
        }`,
      );
      fatti.push({ nome: etichetta, username: vu.username, password: '(in prova non si genera)' });
      continue;
    }

    const creato = await db.auth.admin.createUser({
      email: alias,
      password,
      email_confirm: true,
      user_metadata: { display_name: etichetta },
      app_metadata: {
        tenant_id: t.id,
        tenant_slug: t.slug,
        role: r.ruolo,
        manual_account: true,
      },
    });
    if (creato.error) {
      console.log(`  ✗ ${etichetta.padEnd(28)} ${creato.error.message}`);
      errori += 1;
      continue;
    }
    const uid = creato.data.user!.id;

    const { error: errProfilo } = await db.from('users').insert({
      id: uid,
      tenant_id: t.id,
      role: r.ruolo,
      display_name: etichetta,
      attivo: true,
      must_change_password: true,
      ...(r.capo && r.ruolo === 'tecnico' ? { permissions: { capo_squadra: true } } : {}),
    } as never);
    if (errProfilo) {
      // Un account in Auth senza profilo è un fantasma: entra e non ha tenant.
      await db.auth.admin.deleteUser(uid).catch(() => undefined);
      console.log(`  ✗ ${etichetta.padEnd(28)} profilo non scritto: ${errProfilo.message}`);
      errori += 1;
      continue;
    }

    let notaScheda = '';
    if (conScheda) {
      const { error } = await db.from('dipendenti' as never).insert({
        tenant_id: t.id,
        user_id: uid,
        nome: r.nome,
        cognome: r.cognome,
        stato_attivo: true,
      } as never);
      notaScheda = error ? ` · scheda NON creata (${error.message})` : ' · con scheda';
    }

    console.log(
      `  ✓ ${etichetta.padEnd(28)} ${vu.username.padEnd(20)} ${r.ruolo}${r.capo ? ' · capo squadra' : ''}${notaScheda}`,
    );
    fatti.push({ nome: etichetta, username: vu.username, password });
    esistenti.add(alias);
  }

  console.log(
    applica
      ? `\nFatto: ${fatti.length} creati, ${saltati} già esistenti, ${errori} da sistemare a mano.`
      : `\nSarebbero ${fatti.length} da creare, ${saltati} già esistenti, ${errori} da sistemare prima.`,
  );

  if (applica && fatti.length > 0) {
    const sigla = t.login_senza_codice ? '(lasciare vuoto)' : (t.codice_azienda ?? '—');
    const testo = [
      `Accessi ${t.nome} — generati il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`,
      `Codice azienda: ${sigla}`,
      '',
      'Ognuno dovrà scegliere la propria password al primo accesso.',
      '',
      ...fatti.map((f) => `${f.nome.padEnd(30)} ${f.username.padEnd(22)} ${f.password}`),
      '',
    ].join('\n');

    console.log('\n' + testo);

    if (credenziali) {
      const dove = resolve(credenziali.replace(/^~/, process.env.HOME ?? '~'));
      writeFileSync(dove, testo, { mode: 0o600 });
      console.log(`Scritto in ${dove} (leggibile solo da te).`);
      console.log('⚠ Cancellalo quando hai finito di distribuire gli accessi.\n');
    } else {
      console.log('⚠ Questo elenco non è salvato da nessuna parte: copialo adesso.\n');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
