/**
 * Banco: turno aperto dall'app, chiuso al terminale («da chiudere»).
 *
 *   node scripts/banco-ui/timbro-chiudere.mjs
 *
 * Presuppone: i quattro timbri finti di `timbro.mjs` e un ingresso dall'app
 * alle 09:00 sul cantiere Aurora per il tecnico demo (vedi sessione 22/10/2026).
 * SCRIVE sul tenant demo.
 */
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

// ── Semina e pulizia: il banco si prepara i dati da solo (Marco Rinaldi, DEMOC). ──
import { execSync } from 'node:child_process';
const DIP = 'c1d00000-0000-4000-8000-000000000001';
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const oggiAlle = (hhmm) => `((current_date::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const badge = (hhmm) => sql(`insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo) values (${TENANT}, 'timbro', 'banco-'||gen_random_uuid(), '${DIP}', 'BANCO', ${oggiAlle(hhmm)}, 'fisso', null, 'valido', 'badge', 'banco')`);
const pulisci = () => {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and (sorgente='app' or badge='BANCO')`);
  sql(`delete from timbratura_viaggio where dipendente_id='${DIP}' and data=current_date`);
  sql(`delete from timbrature where dipendente_id='${DIP}' and ts >= ${oggiAlle('00:00')}`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=current_date`);
};
pulisci();
sql(`insert into timbrature (tenant_id, dipendente_id, cantiere_id, commessa_id, tipo, pausa, origine, modalita, ts, creato_da) select ${TENANT}, '${DIP}', 'c0a70000-0000-4000-8000-000000000001', null, 'ingresso', false, 'manuale', 'app', ${oggiAlle('09:00')}, (select user_id from dipendenti where id='${DIP}')`);
badge('18:00');

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Ufficio: il pannello e il dialog da scrivania ────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({});
  try {
    await accedi(cdp, 'kantiere');
    await vaiA(cdp, '/office/kantiere/rapportini');
    await finoA(cdp, `document.body.innerText.includes('Rinaldi')`, { cosa: 'riga Rinaldi', timeoutMs: 40000 });
    const s = await valuta(cdp, `(() => { const t = document.body.innerText; return { pannello: /da sistemare/.test(t), stato: /Turno da chiudere/.test(t), ripartisci: [...document.querySelectorAll('button')].some((b) => /^Ripartisci$/.test(b.textContent.trim())) }; })()`);
    esito(s.pannello, 'ufficio: pannello «giornate timbrate da sistemare»');
    esito(s.stato, 'ufficio: stato «Turno da chiudere»');
    esito(s.ripartisci, 'ufficio: tasto «Ripartisci»');
    await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /^Ripartisci$/.test(b.textContent.trim()))`);
    // Dal 22/10 il dialog e' «Compila giornata» (modo scatola), con il nome.
    await finoA(cdp, `[...document.querySelectorAll('[role="dialog"]')].some((d) => /Ripartisci la giornata di Marco Rinaldi/.test(d.textContent))`, { cosa: 'dialog ufficio' });
    const d = await valuta(cdp, `(() => { const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => /Ripartisci la giornata di Marco Rinaldi/.test(x.textContent)); const t = d.innerText; return { turnoAperto: /turno dall.app 09:00/i.test(t), timbrato: /badge in sede 18:00/.test(t), presenza: /8:00/.test(t), pillole: d.querySelectorAll('span[title]').length }; })()`);
    esito(d.turnoAperto, 'dialog ufficio: parte dal turno dell’app delle 09:00');
    esito(d.timbrato, 'dialog ufficio: chiuso dal badge in sede alle 18:00');
    esito(d.presenza, 'dialog ufficio: presenza 8:00');
    await foto(cdp, 'timbro-chiudere-01-ufficio');
    await clicVero(cdp, `[...document.querySelectorAll('[role="dialog"] button')].find((b) => /^Annulla$/.test(b.textContent.trim()))`);
  } finally {
    await chiudi();
  }
}

// ── Telefono: la card, il dialog, il salvataggio ─────────────────────────────
{
  const { cdp, chiudi } = await apriChrome({ mobile: true });
  try {
    await accedi(cdp, 'tecnico');
    await vaiA(cdp, '/mobile/kantiere/ore');
    await finoA(cdp, `document.body.innerText.includes('Inserisci le commesse')`, { cosa: 'card', timeoutMs: 30000 }).catch(() => null);
    const s1 = await valuta(cdp, `(() => { const t = document.body.innerText; return { card: /Inserisci le commesse/.test(t), stato: /Turno da chiudere/.test(t), fineTurno: [...document.querySelectorAll('button')].some((b) => /Fine turno|Termina turno/.test(b.textContent)) }; })()`);
    esito(s1.card, 'telefono: card «Inserisci le commesse»');
    esito(s1.stato, 'telefono: stato «Turno da chiudere»');
    esito(!s1.fineTurno, 'telefono: nessun «Fine turno» (il terminale ha già chiuso)');
    await foto(cdp, 'timbro-chiudere-02-card');
    await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Inserisci le commesse/.test(b.textContent))`);
    await finoA(cdp, `document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]')`, { cosa: 'dialog' });
    const s2 = await valuta(cdp, `(() => { const d = document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]'); const t = d.innerText; return { aurora: /Aurora/.test(t), bloccato: /turno aperto/i.test(t), inizio: d.querySelector('input[type=time]')?.value, netto: /8:00/.test(t), rimuovi: [...d.querySelectorAll('button')].some((b) => /^Rimuovi/.test(b.getAttribute('aria-label') || '')) }; })()`);
    esito(s2.aurora && s2.bloccato, 'dialog: il cantiere del turno c’è già ed è bloccato');
    esito(s2.inizio === '09:00', 'dialog: inizio = apertura del turno 09:00', s2.inizio);
    esito(s2.netto, 'dialog: 8:00 da ripartire');
    esito(!s2.rimuovi, 'dialog: il primo cantiere non si può togliere');
    await foto(cdp, 'timbro-chiudere-03-dialog');
    // Le stime di viaggio arrivano in un paio di secondi: un dito vero non e' cosi' veloce.
    await pausa(4000);
    await clicVero(cdp, `[...document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]').querySelectorAll('button')].find((b) => /Salva le ore/.test(b.textContent))`);
    // Il rientro alla sede ha una strada: il foglio «Il viaggio» chiede chi
    // guidava. Si risponde «Ero passeggero» e si conferma, come farebbe un dito.
    await pausa(1500);
    const s2b = await valuta(cdp, `(() => { const d = document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]'); const t = d.innerText; return { foglio: /Il viaggio/.test(t), partenzaChiesta: /PARTENZA/.test(t), rientro: /RIENTRO/.test(t) }; })()`);
    esito(s2b.foglio && !s2b.partenzaChiesta && s2b.rientro, 'foglio viaggio: chiede solo il rientro (l’andata l’ha scritta l’app)');
    await clicVero(cdp, `[...document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]').querySelectorAll('button')].filter((b) => /Ero passeggero/.test(b.textContent)).pop()`);
    await pausa(600);
    await clicVero(cdp, `[...document.querySelector('[role="dialog"][aria-label="Ripartisci la giornata"]').querySelectorAll('button')].find((b) => /Salva le ore/.test(b.textContent))`);
    await pausa(800);
    await clicVero(cdp, `[...document.querySelectorAll('button')].find((b) => /Sì, ero passeggero/.test(b.textContent))`).catch(() => null);
    const salvato = await finoA(cdp, `document.body.innerText.includes('Ore salvate')`, { cosa: 'conferma', timeoutMs: 30000 }).then(() => true).catch(() => false);
    esito(salvato, 'salvataggio: «Ore salvate»');
    await pausa(2500);
    await vaiA(cdp, '/mobile/kantiere/ore');
    await pausa(1500);
    const s3 = await valuta(cdp, `(() => { const t = document.body.innerText; return { coperta: /già sui cantieri/.test(t), ore: /8:00/.test(t) }; })()`);
    esito(s3.coperta, 'dopo: giornata coperta');
    esito(s3.ore, 'dopo: 8:00 di lavoro');
    await foto(cdp, 'timbro-chiudere-04-dopo');
  } finally {
    await chiudi();
  }
}
pulisci();
process.exit(riepilogo() === 0 ? 0 : 1);
