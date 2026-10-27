/**
 * Banco: le colonne di «Presenze e ore» e il tempo dentro la riga aperta.
 *
 *   node scripts/banco-ui/colonne-presenze.mjs
 *
 * ⚠️⚠️ **I difetti che misura** (27/10/2026):
 *  1. Lo stesso dato cadeva in due colonne diverse a seconda della sezione: le
 *     ore di oggi finivano nell'ultima colonna (quella delle azioni) mentre
 *     nello storico stanno sotto «Ore». Le intestazioni non dicevano più niente.
 *  2. Dentro la riga aperta si leggeva «Lavorate 0:00» e «Presenza 0:00» su una
 *     persona al lavoro da ore — mentre la stessa riga, chiusa, il tempo giusto
 *     lo mostrava. Due numeri diversi per la stessa giornata.
 *
 * Semina su DEMOC un badge di ingresso e si ripulisce alla fine.
 */
import { execSync } from 'node:child_process';
import { apriChrome, vaiA, accedi, esito, riepilogo, foto, clicVero } from './comune.mjs';
import { valuta, finoA } from '../banco-upload/cdp.mjs';

const DIP = 'c1d00000-0000-4000-8000-000000000001'; // Marco Rinaldi
const TENANT = `(select tenant_id from dipendenti where id='${DIP}')`;
const sql = (q) => execSync(`supabase db query --linked "${q.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
const oggiAlle = (hhmm) => `(((now() at time zone 'Europe/Rome')::date::text || ' ${hhmm}')::timestamp at time zone 'Europe/Rome')`;
const pulisci = () => {
  sql(`delete from timbri_grezzi where dipendente_id='${DIP}' and badge='BANCO'`);
  sql(`delete from rapportini where dipendente_id='${DIP}' and data=(now() at time zone 'Europe/Rome')::date`);
};
pulisci();
sql(
  `insert into timbri_grezzi (tenant_id, sorgente, esterno_id, dipendente_id, badge, ts, orologio, tipo, stato, genere, dispositivo)` +
    ` values (${TENANT}, 'timbro', 'banco-'||gen_random_uuid(), '${DIP}', 'BANCO', ${oggiAlle('07:30')}, 'fisso', null, 'valido', 'badge', 'banco')`,
);

const { cdp, chiudi } = await apriChrome({ larghezza: 1600, altezza: 1000 });
try {
  await accedi(cdp, 'kantiere');
  await vaiA(cdp, '/office/kantiere/rapportini');
  await finoA(cdp, `document.querySelector('tr[data-riga]')`, { cosa: 'riga di oggi', timeoutMs: 60_000 });
  await finoA(cdp, `/\\d+h \\d\\d|\\d+:\\d\\d/.test(document.querySelector('tr[data-riga]')?.innerText || '')`, {
    cosa: 'orologio partito',
    timeoutMs: 15_000,
  }).catch(() => null);

  const colonne = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const tab = document.querySelector('table');
      const teste = [...tab.querySelectorAll('thead th')].map((th) => t(th.textContent));
      const oggi = [...tab.querySelectorAll('tr[data-riga]')].find((r) => /Rinaldi/.test(r.textContent));
      if (!oggi) return { trovata: false, teste };
      // Indice della colonna che contiene le ore, contando i colSpan.
      const indiceDi = (tr, test) => {
        let i = 0;
        for (const td of tr.children) {
          const span = td.colSpan || 1;
          if (test(t(td.textContent))) return i;
          i += span;
        }
        return -1;
      };
      const oraRe = /^\\d+:\\d\\d( h)?$/;
      const iOggi = indiceDi(oggi, (x) => oraRe.test(x));
      // Una riga dello storico: ha le azioni (matita) in fondo.
      const storico = [...tab.querySelectorAll('tbody tr')].find(
        (r) => !r.hasAttribute('data-riga') && r.querySelector('button svg') && /:\\d\\d/.test(t(r.textContent)) && r.children.length >= 5,
      );
      const iStorico = storico ? indiceDi(storico, (x) => /^\\d+:\\d\\d/.test(x)) : -1;
      return {
        trovata: true,
        teste,
        iOggi,
        iStorico,
        testaOggi: teste[iOggi] ?? null,
        rigaOggi: t(oggi.textContent),
      };
    })()`,
  );
  await foto(cdp, 'colonne-presenze-tabella');

  esito(colonne.trovata, 'la riga di oggi c’è', JSON.stringify(colonne.teste ?? []));
  esito(colonne.iOggi >= 0, 'le ore di oggi si leggono nella riga', colonne.rigaOggi ?? '');
  // ⭐ Il controllo vero: stessa colonna per lo stesso dato.
  esito(
    colonne.iOggi === colonne.iStorico,
    'le ore di oggi stanno nella STESSA colonna dello storico',
    `oggi=${colonne.iOggi} storico=${colonne.iStorico}`,
  );
  esito(/^Ore$/i.test(colonne.testaOggi ?? ''), 'e quella colonna si chiama «Ore»', colonne.testaOggi ?? '');

  // La riga aperta: il tempo dentro deve essere quello di fuori.
  await clicVero(cdp, `[...document.querySelectorAll('tr[data-riga]')].find((r) => /Rinaldi/.test(r.textContent))`, { attesaMs: 900 });
  const dentro = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const tr = [...document.querySelectorAll('tr[data-riga]')].find((r) => /Rinaldi/.test(r.textContent));
      const fuori = (t(tr.textContent).match(/(\\d+:\\d\\d) h/) || [])[1] ?? null;
      const dett = tr.nextElementSibling;
      if (!dett) return { aperta: false };
      const testo = t(dett.textContent);
      const presenza = (testo.match(/Presenza\\s*(\\d+:\\d\\d)/) || [])[1] ?? null;
      const lavorate = (testo.match(/Lavorate\\s*(\\d+:\\d\\d)/) || [])[1] ?? null;
      return { aperta: true, fuori, presenza, lavorate, testo: testo.slice(0, 160) };
    })()`,
  );
  await foto(cdp, 'colonne-presenze-aperta');
  esito(dentro.aperta === true, 'la riga si apre');
  esito(dentro.presenza != null && dentro.presenza !== '0:00', 'dentro NON si legge più «0:00»', JSON.stringify(dentro));
  esito(dentro.presenza === dentro.fuori, 'il tempo dentro è lo stesso di quello nella riga', `dentro=${dentro.presenza} fuori=${dentro.fuori}`);
  esito(dentro.lavorate == null, 'e non si chiama più «Lavorate», perché non sono ore attribuite', JSON.stringify(dentro.lavorate));

  // La pagina delle notifiche per gli amministratori del cliente.
  await vaiA(cdp, '/office/impostazioni/notifiche');
  await finoA(cdp, `document.body.innerText.includes('Notifiche')`, { cosa: 'pagina notifiche', timeoutMs: 60_000 });
  const note = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const tab = document.querySelector('table');
      if (!tab) return { tabella: false, testo: t(document.body.innerText).slice(0, 300) };
      return {
        tabella: true,
        righe: tab.querySelectorAll('tbody tr').length,
        codici: [...tab.querySelectorAll('tbody tr td:first-child')].map((td) => t(td.textContent)),
        teste: [...tab.querySelectorAll('thead th')].map((th) => t(th.textContent)),
      };
    })()`,
  );
  await foto(cdp, 'impostazioni-notifiche');
  esito(note.tabella === true, 'la pagina Notifiche mostra il catalogo', JSON.stringify(note).slice(0, 200));
  esito((note.righe ?? 0) >= 4, 'con dentro gli avvisi del mondo presenze', `${note.righe} righe`);
  esito(
    (note.codici ?? []).some((c) => /spesa_da_completare/.test(c)),
    'compreso quello nuovo degli scontrini',
    (note.codici ?? []).join(' | '),
  );
} finally {
  pulisci();
  chiudi();
}
riepilogo();
