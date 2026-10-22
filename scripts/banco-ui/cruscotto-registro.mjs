/**
 * Banco: il cruscotto dell'ufficio sul telefono mostra anche chi ha solo
 * passato il badge, con la bocca scritta.
 *
 *   node scripts/banco-ui/cruscotto-registro.mjs
 *
 * Semina un badge per Marco Rinaldi (DEMOC) e si ripulisce.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';
import { execSync } from 'node:child_process';

const DIP = 'c1d00000-0000-4000-8000-000000000001';
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const pulisci = () => sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and (sorgente='app' or badge='BANCO')`);

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  pulisci();
  sql(`insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo) values (${TENANT}, 'timbro', 'banco-'||gen_random_uuid(), '${DIP}', 'BANCO', now() - interval '2 hours', 'fisso', null, 'valido', 'badge', 'banco')`);
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/mobile/kantiere/cruscotto');
  await finoA(cdp, `document.body.innerText.includes('Marco Rinaldi')`, { cosa: 'riga Marco', timeoutMs: 60000 });
  esito(true, 'cruscotto: Marco compare anche con il solo badge');
  await clicVero(cdp, `[...document.querySelectorAll('button[aria-expanded]')].find((b) => /Marco Rinaldi/.test(b.textContent))`);
  await new Promise((r) => setTimeout(r, 1200));
  await foto(cdp, 'cruscotto-registro-00-aperto');
  console.log('  card:', await valuta(cdp, `([...document.querySelectorAll('button[aria-expanded]')].find((b) => /Marco Rinaldi/.test(b.textContent))?.parentElement?.innerText ?? '-').replace(/\s+/g,' ').slice(0, 300)`));
  await finoA(cdp, `/Badge al terminale/i.test(document.body.innerText)`, { cosa: 'blocco badge' });
  const t = await valuta(cdp, `document.body.innerText.replace(/\\s+/g,' ')`);
  esito(/in · badge/.test(t), 'cruscotto: la pillola dice «in · badge»', (t.match(/.{0,30}in · badge.{0,20}/) ?? [''])[0]);
  esito(!/TIMBRATURE SUI CANTIERI/.test(t), 'cruscotto: senza timbrature sui cantieri il blocco non compare');
  esito(/Presenza · dalle \d\d:\d\d · in sede/.test(t), 'cruscotto: la riga dice «Presenza · dalle HH:MM · in sede»', (t.match(/Presenza · dalle[^·]*· in sede/) ?? [''])[0]);
  esito(/[1-9]\s+Persone/.test(t), 'cruscotto: il contatore «Persone» conta anche chi ha solo il badge');
  await foto(cdp, 'cruscotto-registro-01');
} finally {
  pulisci();
  await chiudi();
}
process.exit(riepilogo() === 0 ? 0 : 1);
