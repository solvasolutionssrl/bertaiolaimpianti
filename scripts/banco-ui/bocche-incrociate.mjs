/**
 * Banco: si apre con una bocca e si chiude con un'altra.
 *
 *   node scripts/banco-ui/bocche-incrociate.mjs
 *
 * Marco (tecnico demo, modalita' ufficio):
 *  A. badge al terminale (riga finta nel registro) → «Fine giornata» dall'app
 *     chiude la presenza nel registro.
 *  B. badge al terminale → turno su un cantiere dall'app → chiusura dall'app:
 *     il registro riceve l'uscita specchiata, la giornata resta «da ripartire»
 *     solo per la parte in sede prima del turno, e si riempie dalla tab Ore.
 * SCRIVE sul demo e si ripulisce (registro e timbrature di Marco di oggi).
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';
import { execSync } from 'node:child_process';

const DIP = 'c1d00000-0000-4000-8000-000000000001';
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const conta = (q) => Number((sql(q).match(/"n":\s*(\d+)/) ?? [])[1] ?? NaN);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const bottone = (re) => `[...document.querySelectorAll('button, a')].find((b) => new RegExp(${JSON.stringify(re)}).test(b.textContent.replace(/\\s+/g,' ').trim()))`;
const card = (stato) => `document.querySelector('[data-presenza-sede="${stato}"]')`;
const attendiCard = (cdp, stato) => finoA(cdp, card(stato), { cosa: `card presenza ${stato}`, timeoutMs: 40000 });
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const badge = (oreFa) => sql(`insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo) values (${TENANT}, 'timbro', 'banco-'||gen_random_uuid(), '${DIP}', 'BANCO', now() - interval '${oreFa} hours', 'fisso', null, 'valido', 'badge', 'banco')`);
const pulisci = () => {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and (sorgente='app' or badge='BANCO')`);
  sql(`delete from timbratura_viaggio where dipendente_id='${DIP}' and data=current_date`);
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome'`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=current_date`);
};

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  pulisci();
  sql(`update dipendenti set modalita_lavoro='ufficio' where id='${DIP}'`);
  await accedi(cdp, 'tecnico');

  // ── A. badge → fine dall'app ──
  badge(3);
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await attendiCard(cdp, 'aperta');
  const tA = await valuta(cdp, `document.querySelector('[data-presenza-sede]').innerText.replace(/\\s+/g,' ')`);
  esito(/BADGE/i.test(tA) && /Fine giornata/.test(tA), 'A: presenza aperta col badge, con «Fine giornata» dall’app', tA.slice(0, 120));
  await foto(cdp, 'bocche-01-badge-aperta');
  await clicVero(cdp, bottone('^Fine giornata'));
  await attendiCard(cdp, 'chiusa');
  esito(conta(`select count(*) as n from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app' and tipo='uscita' and dispositivo='telefono'`) === 1, 'A: nel registro c’è l’uscita dall’app (telefono)');
  const tA2 = await valuta(cdp, `document.querySelector('[data-presenza-sede]').innerText.replace(/\\s+/g,' ')`);
  esito(/3:0\d di presenza/.test(tA2), 'A: tre ore di presenza da ripartire', tA2.slice(0, 80));
  pulisci();

  // ── B. badge → turno dall'app su un cantiere → chiusura dall'app ──
  badge(3);
  // Turno su un cantiere partito due ore fa, dall'app (scritto direttamente:
  // il banco misura la chiusura e cio' che ne segue, non l'avvio).
  sql(`insert into timbrature (tenant_id, dipendente_id, cantiere_id, commessa_id, tipo, pausa, origine, modalita, ts, creato_da) select ${TENANT}, '${DIP}', (select id from cantieri where tenant_id=${TENANT} and nome ilike '%Aurora%' order by nome limit 1), null, 'ingresso', false, 'manuale', 'app', now() - interval '2 hours', (select user_id from dipendenti where id='${DIP}')`);
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await finoA(cdp, bottone('^Chiudi giornata'), { cosa: 'card turno con «Chiudi giornata»', timeoutMs: 40000 });
  esito(true, 'B: col turno aperto la card è quella del turno, non della presenza');
  await clicVero(cdp, bottone('^Chiudi giornata'));
  await pausa(1200);
  await foto(cdp, 'bocche-02-chiusura-turno');
  // La chiusura in sede chiede conferma in un foglio: «Chiudi».
  const conferma = bottone('^Chiudi$');
  for (let i = 0; i < 4; i++) {
    const c = await valuta(cdp, `!!${conferma}`);
    if (!c) break;
    await clicVero(cdp, conferma);
    await pausa(1500);
  }
  await finoA(cdp, `!${bottone('^Chiudi giornata')}`, { cosa: 'turno chiuso', timeoutMs: 40000 });
  esito(conta(`select count(*) as n from timbrature where dipendente_id='${DIP}' and tipo='uscita' and pausa=false and ts > now() - interval '1 hour'`) === 1, 'B: l’uscita del turno è scritta');
  esito(conta(`select count(*) as n from timbri_grezzi where dipendente_id='${DIP}' and sorgente='app' and tipo='uscita' and grezzo->>'specchio'='fine_turno'`) === 1, 'B: il registro ha l’uscita specchiata dalla chiusura del turno');
  await vaiA(cdp, '/mobile/kantiere/cantieri');
  await attendiCard(cdp, 'chiusa');
  const tB = await valuta(cdp, `document.querySelector('[data-presenza-sede]').innerText.replace(/\\s+/g,' ')`);
  esito(/1:0\d di presenza/.test(tB), 'B: da ripartire resta solo l’ora in sede prima del turno', tB.slice(0, 80));
  await foto(cdp, 'bocche-03-da-ripartire');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await finoA(cdp, bottone('^Inserisci le commesse'), { cosa: 'tab Ore: scatola', timeoutMs: 40000 });
  const ore = await valuta(cdp, `document.body.innerText.replace(/\\s+/g,' ')`);
  esito(/badge/i.test(ore) && /app/i.test(ore), 'ore: le pillole dicono badge e app', (ore.match(/.{0,40}badge.{0,60}/i) ?? [''])[0]);
  await foto(cdp, 'bocche-04-ore');
} finally {
  pulisci();
  sql(`update dipendenti set modalita_lavoro='ufficio' where id='${DIP}'`);
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
