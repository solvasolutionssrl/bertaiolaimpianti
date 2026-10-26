/**
 * Cattura: la compilazione delle ore sul TELEFONO, nei due modi in cui esiste.
 *
 *   node scripts/banco-ui/foto-ore-telefono.mjs
 *
 * Non misura niente: guida il browser negli stati da far rivedere a una
 * persona e salva i PNG sotto `scripts/banco-ui/esiti/`. iPhone 14 emulato,
 * tecnico demo (DEMOC). SCRIVE sul tenant demo (badge finti) e si ripulisce.
 *
 *  A. «Registra giornata» — giornata senza nessuna timbratura.
 *  B. «Ripartisci la giornata» — la scatola timbrata al terminale: e' il modo
 *     che corrisponde al dialog «Compila giornata» della scrivania.
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const DIP = 'c1d00000-0000-4000-8000-000000000001'; // Marco Rinaldi
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const oggiAlle = (hhmm) => `(((now() at time zone 'Europe/Rome')::date::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const badge = (hhmm) =>
  sql(
    `insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo)` +
      ` values (${TENANT}, 'timbro', 'foto-'||gen_random_uuid(), '${DIP}', 'BANCO', ${oggiAlle(hhmm)}, 'fisso', null, 'valido', 'badge', 'banco')`,
  );
const pulisci = () => {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and (badge='BANCO' or sorgente='app')`);
  sql(`delete from timbratura_viaggio where dipendente_id='${DIP}' and data=(now() at time zone 'Europe/Rome')::date`);
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=(now() at time zone 'Europe/Rome')::date`);
};

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const fatte = [];
const saltate = [];
const scatta = async (cdp, nome) => { await pausa(500); await foto(cdp, nome); fatte.push(nome); };
const dlg = (etichetta) => `document.querySelector('[role="dialog"][aria-label="${etichetta}"]')`;
const tasto = (dentro, re) => `[...(${dentro}?.querySelectorAll('button') ?? [])].find((b) => ${re}.test((b.textContent||'').replace(/\\s+/g,' ').trim()))`;
const scorri = async (cdp, etichetta, dove) =>
  valuta(cdp, `(() => { const c = ${dlg(etichetta)}?.querySelector('.overflow-y-auto'); if (!c) return false; c.scrollTop = ${dove === 'fondo' ? 'c.scrollHeight' : '0'}; return true; })()`);

pulisci();

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');

  // ── A. Registra giornata ────────────────────────────────────────────────
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, `${tasto('document', '/Registra giornata/')}`, { cosa: 'tasto Registra giornata', timeoutMs: 60_000 });
  await scatta(cdp, 'ore-1-pagina');

  await clicVero(cdp, tasto('document', '/Registra giornata/'));
  await finoA(cdp, dlg('Registra giornata'), { cosa: 'dialog Registra giornata', timeoutMs: 30_000 });
  await pausa(900);
  await scatta(cdp, 'ore-2-registra-vuoto');

  // Un cantiere, e fuori sede: cosi' compare anche il percorso.
  await finoA(cdp, tasto(dlg('Registra giornata'), '/Aggiungi (il )?cantiere/'), { cosa: 'tasto Aggiungi cantiere', timeoutMs: 30_000 });
  await clicVero(cdp, tasto(dlg('Registra giornata'), '/Aggiungi (il )?cantiere/'));
  await finoA(cdp, `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`, { cosa: 'foglio cantieri' });
  await clicVero(cdp, `(() => { const s = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Aggiungi cantiere/.test(d.querySelector('h2')?.textContent || '')); return [...s.querySelectorAll('button')].find((b) => /Aurora/.test(b.textContent)); })()`);
  await pausa(1200);
  // Il tecnico demo lavora «in ufficio»: senza togliere «In sede» il percorso
  // non viene chiesto, ed e' proprio la parte da guardare.
  const fuoriSede = await clicVero(cdp, `[...${dlg('Registra giornata')}.querySelectorAll('[role=radio]')].find((r) => !/In sede/i.test(r.textContent))`).catch(() => null);
  await pausa(2500);
  await scatta(cdp, 'ore-3-registra-cantiere');

  await scorri(cdp, 'Registra giornata', 'fondo');
  await pausa(2500);
  await scatta(cdp, 'ore-4-registra-percorso');
  if (!fuoriSede || fuoriSede.fatto === false) saltate.push(`il percorso puo' non comparire: «In sede» non tolto (${fuoriSede?.perche ?? 'radio non trovato'})`);

  // La pausa: si porta a schermo la fila dei tasti.
  const dovePausa = await valuta(
    cdp,
    `(() => {
      const d = ${dlg('Registra giornata')};
      const b = [...(d?.querySelectorAll('button') ?? [])].find((x) => /^(Nessuna|30 min|45 min|1 h|1 h 30)$/.test((x.textContent||'').trim()));
      if (!b) return 'zona della pausa non trovata';
      b.closest('div')?.scrollIntoView({ block: 'center' });
      return 'ok';
    })()`,
  );
  if (dovePausa === 'ok') await scatta(cdp, 'ore-5-registra-pausa');
  else saltate.push(`ore-5-registra-pausa: ${dovePausa}`);

  // ── B. La scatola timbrata ──────────────────────────────────────────────
  await valuta(cdp, `(() => { const b = ${tasto(dlg('Registra giornata'), '/^(Annulla|Chiudi)$/')}; if (b) b.click(); return true; })()`);
  pulisci();
  for (const h of ['08:00', '12:30', '13:00', '17:03']) badge(h);
  await vaiA(cdp, '/mobile/kantiere/ore');
  const c = await finoA(cdp, tasto('document', '/Inserisci le commesse/'), { cosa: 'card della scatola', timeoutMs: 60_000 }).then(() => true).catch(() => false);
  if (!c) {
    saltate.push('ore-6/7 (scatola timbrata): la card «Inserisci le commesse» non è comparsa');
  } else {
    await scatta(cdp, 'ore-6-scatola-pagina');
    await clicVero(cdp, tasto('document', '/Inserisci le commesse/'));
    await finoA(cdp, dlg('Ripartisci la giornata'), { cosa: 'dialog della scatola', timeoutMs: 30_000 });
    await pausa(1200);
    await scatta(cdp, 'ore-7-scatola-dialog');
    await finoA(cdp, tasto(dlg('Ripartisci la giornata'), '/Aggiungi (il )?cantiere/'), { cosa: 'tasto Aggiungi cantiere', timeoutMs: 30_000 });
    await clicVero(cdp, tasto(dlg('Ripartisci la giornata'), '/Aggiungi (il )?cantiere/'));
    await finoA(cdp, `[...document.querySelectorAll('[role="dialog"] h2')].some((h) => /Aggiungi cantiere/.test(h.textContent))`, { cosa: 'foglio cantieri' });
    await clicVero(cdp, `(() => { const s = [...document.querySelectorAll('[role="dialog"]')].find((d) => /Aggiungi cantiere/.test(d.querySelector('h2')?.textContent || '')); return [...s.querySelectorAll('button')].find((b) => /Aurora/.test(b.textContent)); })()`);
    await pausa(2500);
    await scatta(cdp, 'ore-8-scatola-cantiere');
  }
} finally {
  pulisci();
  await chiudi();
}

console.log('\nScattate:');
for (const f of fatte) console.log(`  · scripts/banco-ui/esiti/${f}.png`);
if (saltate.length) { console.log('\nSaltate / da sapere:'); for (const s of saltate) console.log(`  · ${s}`); }
