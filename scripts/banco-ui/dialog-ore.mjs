/**
 * Banco: il foglio «Aggiungi ore a mano» sull'app.
 *
 * Nasce da un difetto vero: il foglio si apriva schiacciato in fondo allo
 * schermo, si leggeva solo il titolo. Causa: una classe `relative` passata a
 * DialogContent, che e' `fixed`, e `cn()` mette per ultima quella passata —
 * quindi la sovrascriveva e il foglio cadeva nel flusso normale.
 *
 *   node scripts/banco-ui/dialog-ore.mjs
 */

import { apriChrome, vaiA, accedi, esito, riepilogo, foto } from './comune.mjs';
import { valuta } from '../banco-upload/cdp.mjs';

const { cdp, chiudi } = await apriChrome({ mobile: true });
try {
  await accedi(cdp, 'tecnico');
  await vaiA(cdp, '/mobile/kantiere/ore');

  // Apre il foglio: il tasto e' quello dell'inserimento a mano.
  const aperto = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('button, [role="button"], a')]
        .find((x) => /ore a mano|un cantiere, con viaggio|aggiungi ore/i.test(t(x.textContent)));
      if (!b) return 'tasto non trovato';
      b.click();
      return 'ok';
    })()`,
  );
  await new Promise((r) => setTimeout(r, 1200));

  const m = await valuta(
    cdp,
    `(() => {
      const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const d = document.querySelector('[role="dialog"]');
      if (!d) return { c: false };
      const r = d.getBoundingClientRect();
      const st = getComputedStyle(d);
      const vh = window.innerHeight;
      // Il campo cantiere deve essere raggiungibile, non tagliato fuori.
      const campo = [...d.querySelectorAll('select, input, button')]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.height > 0);
      const primoCampo = campo[0] ?? null;
      return {
        c: true,
        posizione: st.position,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        altezza: Math.round(r.height),
        vh,
        sopraIlBordo: r.top >= -1,
        entroLoSchermo: r.bottom <= vh + 1,
        altezzaSensata: r.height > vh * 0.3,
        primoCampoVisibile: primoCampo ? primoCampo.top < vh && primoCampo.bottom > 0 : false,
        titolo: t(d.querySelector('h2, [id*="title"]')?.textContent),
      };
    })()`,
  );

  esito(m.c, 'il foglio si apre', aperto === 'ok' ? '' : aperto);
  if (m.c) {
    esito(m.posizione === 'fixed', 'il foglio e\' ancorato allo schermo', `position: ${m.posizione}`);
    esito(m.sopraIlBordo, 'non esce dal bordo alto', `top ${m.top}`);
    esito(m.entroLoSchermo, 'non sfora sotto', `bottom ${m.bottom} su ${m.vh}`);
    esito(
      m.altezzaSensata,
      'occupa un\'altezza sensata, non una striscia',
      `alto ${m.altezza} su ${m.vh}`,
    );
    esito(m.primoCampoVisibile, 'il primo campo si vede senza cercarlo');
    esito(/ore a mano/i.test(m.titolo || ''), 'si legge il titolo', m.titolo);
  }
  // ── Il pannello «sei passeggero?» si appoggia a quel `fixed` ───────────
  // E' la ragione per cui avevo aggiunto `relative`: verifichiamo che senza
  // funzioni lo stesso, cioe' che un figlio `absolute inset-0` copra il foglio.
  const copre = await valuta(
    cdp,
    `(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const p = document.createElement('div');
      p.className = 'absolute inset-0';
      p.setAttribute('data-prova', '1');
      d.appendChild(p);
      const a = d.getBoundingClientRect();
      const b = p.getBoundingClientRect();
      p.remove();
      // Tolleranza 3px: inset-0 si appoggia al riquadro DENTRO il bordo, e il
      // foglio ha un bordo da 1px, quindi 1 sopra e 1 sotto sono attesi.
      return {
        combacia:
          Math.abs(a.top - b.top) <= 3 &&
          Math.abs(a.left - b.left) <= 3 &&
          Math.abs(a.height - b.height) <= 3,
        dialog: [Math.round(a.top), Math.round(a.height)],
        pannello: [Math.round(b.top), Math.round(b.height)],
      };
    })()`,
  );
  esito(
    !!copre && copre.combacia,
    'il pannello passeggero copre il foglio (il `fixed` basta come ancoraggio)',
    copre ? `foglio ${copre.dialog} · pannello ${copre.pannello}` : 'non misurato',
  );

  // ── Schermo piu' corto: telefonata in corso, la barra di stato cresce ───
  await cdp.invia('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 700,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 600));
  const stretto = await valuta(
    cdp,
    `(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        vh: window.innerHeight,
        dentro: r.top >= -1 && r.bottom <= window.innerHeight + 1,
      };
    })()`,
  );
  esito(
    !!stretto && stretto.dentro,
    'con lo schermo piu\' corto resta dentro (telefonata in corso)',
    stretto ? `da ${stretto.top} a ${stretto.bottom} su ${stretto.vh}` : 'non misurato',
  );

  await foto(cdp, 'dialog-ore-a-mano');
} finally {
  await chiudi();
}

riepilogo();
