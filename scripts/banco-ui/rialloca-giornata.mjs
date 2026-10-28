/**
 * Banco di prova: correggere commesse e ore di una giornata passata dal
 * telefono (28/10/2026).
 *
 * Su una giornata di prova del tenant dimostrativo (Marco, una commessa sola,
 * 08:00 → 17:00, mezz'ora di pausa dichiarata) si apre lo storico, si tocca la
 * giornata e deve comparire la schermata a card colorate con inizio e fine
 * FISSI. Si aggiunge un secondo cantiere, si mettono 4 ore sul primo (il
 * secondo prende il resto) e si salva. Poi si guarda il database: le ore sono
 * divise, il totale e' lo stesso, inizio e fine non si sono mossi e non ci sono
 * timbrature doppie. Il controllo che conta e' l'ultimo: 8 ore NON diventano 16.
 *
 * Prepara e ripulisce la giornata da solo (via `supabase db query --linked`).
 *
 *   node scripts/banco-ui/rialloca-giornata.mjs
 */

import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, clicVero, foto, premiTasto, scriviVero } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const TEN = 'a0d30000-0000-4000-8000-000000000002';
const DIP = 'c1d00000-0000-4000-8000-000000000001';
const CAN1 = 'c0a70000-0000-4000-8000-000000000001';
const GIORNO = process.env.BANCO_GIORNO ?? '2026-10-27';
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(q) {
  const out = execSync('supabase db query --linked', { input: q, encoding: 'utf8' });
  const m = out.match(/"rows":\s*(\[[\s\S]*?\])\s*,\s*"warning"/);
  return m ? JSON.parse(m[1]) : [];
}

function pulisci() {
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= '${GIORNO}T00:00:00+02' and ts < '${GIORNO}T23:59:59+01';
       delete from rapportini where dipendente_id='${DIP}' and data='${GIORNO}';`);
}

function prepara() {
  pulisci();
  sql(`insert into timbrature (tenant_id, dipendente_id, cantiere_id, commessa_id, tipo, pausa, origine, modalita, ts)
       select '${TEN}', '${DIP}', '${CAN1}', null, x.tipo, x.pausa, 'manuale', 'giornata_dichiarata', x.ts::timestamptz from
       (values ('ingresso', false, '${GIORNO}T07:00:00Z'), ('uscita', true, '${GIORNO}T11:00:00Z'),
               ('ingresso', true, '${GIORNO}T11:30:00Z'), ('uscita', false, '${GIORNO}T16:00:00Z')) as x(tipo, pausa, ts);
       insert into rapportini (tenant_id, dipendente_id, data, stato, auto_compilato)
       values ('${TEN}', '${DIP}', '${GIORNO}', 'bozza', true);
       insert into rapportino_righe (rapportino_id, cantiere_id, minuti_lavoro, minuti_viaggio, ore_ordinarie, ore_straordinarie, ore_viaggio)
       select id, '${CAN1}', 510, 0, 8, 0.5, 0 from rapportini where dipendente_id='${DIP}' and data='${GIORNO}';`);
}

prepara();
const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');
  await attendi(2500);
  const giornoNum = String(Number(GIORNO.slice(8, 10)));
  await clicVero(cdp, `[...document.querySelectorAll('section li button')].find(b => b.textContent.includes(' ${giornoNum} '))`);
  await attendi(4000);

  const titolo = await valuta(cdp, `[...document.querySelectorAll('h2')].map(h => h.textContent.trim()).join(' | ')`);
  esito(titolo.includes('Correggi commesse e ore'), 'tocco la giornata: si apre la schermata a card', titolo);
  const inizioBloccato = await valuta(cdp, `(() => { const b = [...document.querySelectorAll('button,input')].find(x => x.textContent?.includes('08:00') || x.value === '08:00'); return b ? !!b.disabled : null; })()`);
  esito(inizioBloccato === true, 'l\'inizio non si puo\' cambiare', String(inizioBloccato));
  const riepilogoTesto = await valuta(cdp, `[...document.querySelectorAll('p[aria-live]')].map(p => p.textContent.replace(/\\s+/g,' ').trim()).join(' | ')`);
  esito(/Presenza 9:00 − 0:30 di pausa = 8:30/.test(riepilogoTesto), 'il riepilogo fa i conti giusti (la strada fuori dagli estremi non si toglie)', riepilogoTesto);

  // Secondo cantiere.
  await clicVero(cdp, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Aggiungi cantiere')`);
  await attendi(1200);
  const scelto = await clicVero(cdp, `[...document.querySelectorAll('button, [role="option"], li')].find(b => /Logistica Est/.test(b.textContent) && b.offsetParent)`);
  await attendi(1200);
  const card = await valuta(cdp, `[...document.querySelectorAll('h3, p, span')].filter(e => /Logistica Est/.test(e.textContent)).length`);
  esito(card > 0, 'aggiunto il secondo cantiere', String(scelto.fatto));

  // 4 ore sul primo cantiere: si scrive nelle sue caselle (le prime «ore» e «minuti»).
  const valore = () => valuta(cdp, `(() => { const i = [...document.querySelectorAll('input[aria-label="ore"],input[aria-label="minuti"]')]; return Number(i[0].value) * 60 + Number(i[1].value); })()`);
  for (let k = 0; k < 120 && (await valore()) > 240; k++) {
    await clicVero(cdp, `[...document.querySelectorAll('button[aria-label^="Meno "]')][0]`, { attesaMs: 60 });
  }
  const lette = await valuta(cdp, `[...document.querySelectorAll('input[aria-label="ore"],input[aria-label="minuti"]')].map(i => i.value).join(' ')`);
  esito(lette.startsWith('4 0'), 'scritte 4 ore sul primo cantiere', lette);
  await foto(cdp, 'rialloca-prima-di-salvare');

  const visibili = (re) => `[...document.querySelectorAll('button')].filter(b => ${re}.test(b.textContent.trim()) && b.getClientRects().length > 0)`;
  for (let i = 0; i < 8; i++) {
    if (await valuta(cdp, `/Ore salvate/.test(document.body.textContent)`)) break;
    if (process.env.BANCO_DEBUG) console.log(i, await valuta(cdp, `({ avvisi: [...document.querySelectorAll('[role=alert],[aria-live]')].map(e => e.textContent.trim()).filter(Boolean).slice(-2), tasti: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()).filter(t => t && t.length < 30).slice(-14) })`));
    // La domanda aperta su chi guidava: il tasto di scelta «Passeggero» (non la voce già scelta).
    const pass = await clicVero(cdp, `${visibili('/^Passeggero$/')}.filter(b => b.className.includes('min-h-[38px]')).pop()`);
    if (pass.fatto) await attendi(500);
    // La conferma del passeggero, se compare.
    await clicVero(cdp, `${visibili('/^S\u00ec, ero passeggero$/')}[0]`);
    const premuto = await clicVero(cdp, `${visibili('/Salva le ore/')}.pop()`);
    await attendi(2500);
    if (process.env.BANCO_DEBUG) { console.log('salva premuto:', premuto.fatto); await foto(cdp, `rialloca-passo-${i}`); }
  }
  await foto(cdp, 'rialloca-dopo');
  await attendi(2500);
} finally {
  await chiudi();
}

const timb = sql(`select tipo, pausa, to_char(ts at time zone 'Europe/Rome','HH24:MI') ora, cantiere_id from timbrature
  where dipendente_id='${DIP}' and ts >= '${GIORNO}T00:00:00+02' and ts < '${GIORNO}T23:59:59+01' order by ts`);
const righe = sql(`select cantiere_id, minuti_lavoro from rapportino_righe rr join rapportini r on r.id=rr.rapportino_id
  where r.dipendente_id='${DIP}' and r.data='${GIORNO}' order by minuti_lavoro desc`);
console.log('timbrature', timb.map((t) => `${t.ora} ${t.tipo}${t.pausa ? ' (pausa)' : ''} ${t.cantiere_id.slice(-2)}`).join(', '));
console.log('righe', JSON.stringify(righe));

const lavori = timb.filter((t) => !t.pausa);
esito(lavori[0]?.ora === '08:00' && lavori[lavori.length - 1]?.ora === '17:00', 'inizio e fine sono rimasti 08:00 e 17:00', `${lavori[0]?.ora} → ${lavori[lavori.length - 1]?.ora}`);
esito(righe.length === 2, 'due righe: le ore sono divise su due cantieri', `righe: ${righe.length}`);
const totale = righe.reduce((s, r) => s + Number(r.minuti_lavoro), 0);
esito(totale <= 510 && totale > 0, 'il totale non cresce: 8 ore NON diventano 16', `${totale} min (prima 510)`);
esito(righe.some((r) => r.cantiere_id === CAN1 && Number(r.minuti_lavoro) === 240), 'sul primo cantiere ci sono le 4 ore scelte', JSON.stringify(righe.find((r) => r.cantiere_id === CAN1)));
esito(timb.filter((t) => !t.pausa && t.tipo === 'ingresso').length === 2, 'nessuna timbratura doppia (due ingressi di lavoro, uno per cantiere)', `ingressi: ${timb.filter((t) => !t.pausa && t.tipo === 'ingresso').length}`);

console.log('tratte', JSON.stringify(sql(`select v.direzione, v.durata_confermata_min, v.durata_stimata_min, v.da_cantiere_id is not null fra, to_char(t.ts at time zone 'Europe/Rome','HH24:MI') ora, t.tipo
  from timbratura_viaggio v join timbrature t on t.id=v.timbratura_id where v.dipendente_id='${DIP}' and t.ts >= '${GIORNO}T00:00:00+02' and t.ts < '${GIORNO}T23:59:59+01'`)));
// Seconda passata: riaprire e salvare senza cambiare niente non sposta le ore.
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    await vaiA(cdp, '/mobile/kantiere/ore');
    await attendi(2500);
    const giornoNum = String(Number(GIORNO.slice(8, 10)));
    await clicVero(cdp, `[...document.querySelectorAll('section li button')].find(b => b.textContent.includes(' ${giornoNum} '))`);
    await attendi(4500);
    const testo = await valuta(cdp, `[...document.querySelectorAll('p[aria-live]')].map(p => p.textContent.replace(/\\s+/g,' ').trim()).join(' | ')`);
    esito(/0:30 di pausa/.test(testo) && /= 8:00 da ripartire/.test(testo), 'riaperta: la pausa fusa nel cambio di cantiere si ritrova e i conti tornano (8:00)', testo);
    const visibili = (re) => `[...document.querySelectorAll('button')].filter(b => ${re}.test(b.textContent.trim()) && b.getClientRects().length > 0)`;
    let salvato = false;
    for (let i = 0; i < 6; i++) {
      const pass = await clicVero(cdp, `${visibili('/^Passeggero$/')}.filter(b => b.className.includes('min-h-[38px]')).pop()`);
      if (pass.fatto) await attendi(500);
      await clicVero(cdp, `${visibili('/^S\u00ec, ero passeggero$/')}[0]`);
      await clicVero(cdp, `${visibili('/Salva le ore/')}.pop()`);
      await attendi(2500);
      const ancoraAperto = await valuta(cdp, `/Correggi commesse e ore/.test(document.body.textContent)`);
      if (!ancoraAperto) { salvato = true; break; }
    }
    // Negativo del controllo sotto: se il salvataggio non avviene, «ore uguali» non dimostra niente.
    esito(salvato, 'riaperta: il salvataggio senza modifiche va a buon fine (il dialog si chiude)');
  } finally {
    await chiudi();
  }
  const righe2 = sql(`select cantiere_id, minuti_lavoro from rapportino_righe rr join rapportini r on r.id=rr.rapportino_id
    where r.dipendente_id='${DIP}' and r.data='${GIORNO}' order by cantiere_id`);
  console.log('righe dopo il secondo salvataggio', JSON.stringify(righe2));
  esito(
    righe2.length === 2 && righe2.every((r) => Number(r.minuti_lavoro) === 240),
    'riaperta e salvata senza cambiare niente: le ore restano 4:00 + 4:00',
    JSON.stringify(righe2.map((r) => Number(r.minuti_lavoro))),
  );
}

pulisci();
riepilogo();
