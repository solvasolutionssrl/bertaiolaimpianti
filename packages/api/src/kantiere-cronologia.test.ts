import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import {
  AZIONI_VERSIONE_GIORNATA,
  MODALITA_TIMBRATURA,
  affidabilitaGiornata,
  costruisciCronologia,
  differenzeGiornata,
  modalitaDi,
  riassuntoVersioni,
  versioneSenzaCambiamenti,
  type TimbraturaCronologia,
} from './kantiere-cronologia';

const PERSONA = 'user-persona';
const UFFICIO = 'user-ufficio';

function timb(p: Partial<TimbraturaCronologia> & Pick<TimbraturaCronologia, 'id' | 'tipo' | 'ts'>): TimbraturaCronologia {
  return {
    origine: 'qr',
    modalita: null,
    pausa: false,
    autoChiusa: false,
    createdAt: p.ts,
    creatoDa: PERSONA,
    creatoNome: 'Mario Rossi',
    haGeo: true,
    cantiere: 'Cantiere A',
    ...p,
  };
}

describe('vocabolario allineato al database', () => {
  // Se il codice scrive un valore che il CHECK non conosce, l'inserimento della
  // timbratura FALLISCE: la persona non riesce a timbrare. Questo test lo
  // impedisce prima che arrivi in produzione.
  const sql = readFileSync(
    new URL('../../../supabase/migrations/20260914090000_cronologia_giornata.sql', import.meta.url),
    'utf8',
  );

  it('ogni modalità del codice è ammessa dal CHECK di timbrature', () => {
    for (const m of MODALITA_TIMBRATURA) expect(sql).toContain(`'${m}'`);
  });

  it('ogni azione del codice è ammessa dal CHECK di rapportino_versioni', () => {
    for (const a of AZIONI_VERSIONE_GIORNATA) expect(sql).toContain(`'${a}'`);
  });
});

describe('modalitaDi', () => {
  const ctx = { userIdPersona: PERSONA, giornataConTimbratureVere: true };

  it('se la modalità è scritta vince, e non è ricostruita', () => {
    const r = modalitaDi(timb({ id: '1', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', origine: 'manuale', modalita: 'app' }), ctx);
    expect(r).toEqual({ modalita: 'app', ricostruita: false });
  });

  it('riga vecchia: pausa chiusa dal sistema', () => {
    expect(modalitaDi(timb({ id: '1', tipo: 'ingresso', ts: 'x', autoChiusa: true, origine: 'manuale', creatoDa: null }), ctx).modalita).toBe('pausa_chiusa_sistema');
  });

  it('riga vecchia inserita da un altro utente = ufficio', () => {
    expect(modalitaDi(timb({ id: '1', tipo: 'uscita', ts: 'x', origine: 'manuale', creatoDa: UFFICIO }), ctx).modalita).toBe('ufficio');
  });

  it('riga vecchia: pausa con origine qr SENZA posizione è dall app, con posizione è QR', () => {
    // cambiaStatoTurnoMio (pausa da app) scriveva 'qr' ma non la posizione.
    expect(modalitaDi(timb({ id: '1', tipo: 'uscita', ts: 'x', pausa: true, haGeo: false }), ctx).modalita).toBe('app');
    expect(modalitaDi(timb({ id: '1', tipo: 'uscita', ts: 'x', pausa: true, haGeo: true }), ctx).modalita).toBe('qr');
  });

  it('riga vecchia manuale scritta subito = tasto app (avvio turno, cambio cantiere)', () => {
    const r = modalitaDi(timb({ id: '1', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', createdAt: '2026-09-01T06:00:05Z', origine: 'manuale' }), ctx);
    expect(r).toEqual({ modalita: 'app', ricostruita: true });
  });

  it('riga vecchia manuale scritta ore dopo: divisione se c era un QR, altrimenti giornata dichiarata', () => {
    const t = timb({ id: '1', tipo: 'uscita', ts: '2026-09-01T10:00:00Z', createdAt: '2026-09-01T16:00:00Z', origine: 'manuale' });
    expect(modalitaDi(t, ctx).modalita).toBe('divisione_fine_turno');
    expect(modalitaDi(t, { ...ctx, giornataConTimbratureVere: false }).modalita).toBe('giornata_dichiarata');
  });
});

describe('differenzeGiornata', () => {
  it('dice prima e dopo, in H:MM', () => {
    const r = differenzeGiornata(
      { stato: 'approvato', totali: { ore_ordinarie: 8, ore_straordinarie: 0, ore_viaggio: 0.5 } },
      { stato: 'bozza', totali: { ore_ordinarie: 8, ore_straordinarie: 1, ore_viaggio: 0.5 } },
    );
    expect(r).toEqual(['Lavoro 8:00 → 9:00', 'Stato approvata → da verificare']);
  });

  it('nessun cambiamento → nessuna riga', () => {
    const s = { stato: 'approvato', totali: { ore_ordinarie: 8 } };
    expect(differenzeGiornata(s, s)).toEqual([]);
    expect(versioneSenzaCambiamenti(s, s)).toBe(true);
  });

  it('stessi totali ma ore spostate da un cantiere a un altro è un cambiamento vero', () => {
    const prima = { stato: 'approvato', totali: { ore_ordinarie: 8 }, righe: [{ cantiere_id: 'A', ore_ordinarie: 8 }] };
    const dopo = { stato: 'approvato', totali: { ore_ordinarie: 8 }, righe: [{ cantiere_id: 'A', ore_ordinarie: 5 }, { cantiere_id: 'B', ore_ordinarie: 3 }] };
    expect(versioneSenzaCambiamenti(prima, dopo)).toBe(false);
    expect(differenzeGiornata(prima, dopo)).toEqual(['Ore spostate fra cantieri']);
  });

  it('senza lo stato di prima non si inventa una differenza', () => {
    expect(differenzeGiornata(null, { stato: 'approvato' })).toEqual([]);
    expect(versioneSenzaCambiamenti(null, { stato: 'approvato' })).toBe(false);
  });
});

describe('costruisciCronologia', () => {
  it('racconta la giornata in ordine: inizio, pausa, fine pausa, fine turno', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'd', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', origine: 'cronometro', modalita: 'app', haGeo: false }),
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', modalita: 'qr' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T10:00:00Z', pausa: true, modalita: 'app', haGeo: false }),
        timb({ id: 'c', tipo: 'ingresso', ts: '2026-09-01T11:00:00Z', pausa: true, modalita: 'app', haGeo: false }),
      ],
      viaggi: [],
      versioni: [],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    expect(ev.map((e) => e.titolo)).toEqual(['Inizio turno', 'Inizio pausa', 'Fine pausa', 'Fine turno']);
    expect(ev[0]!.modalita).toBe('Cartello QR');
    expect(ev[3]!.modalita).toBe('Dall’app');
    expect(ev.every((e) => e.attore === 'persona')).toBe(true);
  });

  it('uscita + ingresso ravvicinati su cantieri diversi diventano UN cambio cantiere', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', cantiere: 'A' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T10:00:00Z', cantiere: 'A', modalita: 'app' }),
        timb({ id: 'c', tipo: 'ingresso', ts: '2026-09-01T10:00:01Z', cantiere: 'B', modalita: 'app' }),
        timb({ id: 'd', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', cantiere: 'B', modalita: 'app' }),
      ],
      viaggi: [],
      versioni: [],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    expect(ev.map((e) => e.titolo)).toEqual(['Inizio turno', 'Cambio cantiere', 'Fine turno']);
    expect(ev[1]!.dettaglio).toEqual(['A → B']);
  });

  it('con un cantiere solo non lo ripete sotto ogni evento', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', cantiere: 'A' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', cantiere: 'A', modalita: 'app' }),
      ],
      viaggi: [], versioni: [], userIdPersona: PERSONA, approvataAutoAl: null,
    });
    expect(ev.every((e) => e.dettaglio.length === 0)).toBe(true);
  });

  it('con più cantieri lo dice solo quando cambia', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', cantiere: 'A' }),
        timb({ id: 'p', tipo: 'uscita', ts: '2026-09-01T09:00:00Z', cantiere: 'A', pausa: true, modalita: 'app' }),
        timb({ id: 'q', tipo: 'ingresso', ts: '2026-09-01T09:15:00Z', cantiere: 'A', pausa: true, modalita: 'app' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T11:00:00Z', cantiere: 'A', modalita: 'app' }),
        timb({ id: 'c', tipo: 'ingresso', ts: '2026-09-01T11:00:01Z', cantiere: 'B', modalita: 'app' }),
        timb({ id: 'd', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', cantiere: 'B', modalita: 'app' }),
      ],
      viaggi: [], versioni: [], userIdPersona: PERSONA, approvataAutoAl: null,
    });
    expect(ev.map((e) => [e.titolo, e.dettaglio.join('')])).toEqual([
      ['Inizio turno', 'A'],
      ['Inizio pausa', ''],
      ['Fine pausa', ''],
      ['Cambio cantiere', 'A → B'],
      ['Fine turno', ''],
    ]);
  });

  it('una timbratura dell ufficio dice chi l ha inserita e va in evidenza', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', createdAt: '2026-09-03T09:00:00Z', origine: 'manuale', modalita: 'ufficio', creatoDa: UFFICIO, creatoNome: 'Chiara Bianchi' }),
      ],
      viaggi: [],
      versioni: [],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    const fine = ev.find((e) => e.titolo === 'Fine turno')!;
    expect(fine.attore).toBe('ufficio');
    expect(fine.chi).toBe('Chiara Bianchi');
    expect(fine.arrivatoAl).toBe('2026-09-03T09:00:00Z');
    expect(fine.arrivoDichiarato).toBe(true);
    expect(fine.attenzione).toBe(true);
  });

  it('il viaggio di andata sta prima dell inizio turno, il ritorno dopo la fine', () => {
    const ev = costruisciCronologia({
      timbrature: [
        timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z' }),
        timb({ id: 'b', tipo: 'uscita', ts: '2026-09-01T15:00:00Z', modalita: 'app' }),
      ],
      viaggi: [
        { id: 'r', direzione: 'ritorno', timbraturaId: 'b', createdAt: '2026-09-01T15:00:00Z', daCantiere: null, sede: 'Sede', cantiere: 'Cantiere A', km: 55.4, minutiPagati: 45, autista: false },
        { id: 'n', direzione: 'andata', timbraturaId: 'a', createdAt: '2026-09-01T06:00:00Z', daCantiere: null, sede: 'Sede', cantiere: 'Cantiere A', km: 55.4, minutiPagati: 45, autista: true },
      ],
      versioni: [],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    expect(ev.map((e) => e.titolo)).toEqual(['Viaggio di andata', 'Inizio turno', 'Fine turno', 'Viaggio di ritorno']);
    expect(ev[0]!.dettaglio).toEqual(['Sede → Cantiere A', '55 km · 0:45 · alla guida']);
    expect(ev[3]!.dettaglio[1]).toContain('passeggero');
  });

  it('le modifiche mostrano prima → dopo e segnalano se arrivano dopo l approvazione', () => {
    const ev = costruisciCronologia({
      timbrature: [],
      viaggi: [],
      versioni: [
        { versione: 1, azione: 'modifica_tecnico', quando: '2026-09-01T19:00:00Z', chi: 'Mario Rossi', snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 } } },
        { versione: 2, azione: 'pausa_ufficio', quando: '2026-09-11T08:00:00Z', chi: 'Chiara Bianchi', snapshot: { stato: 'approvato', totali: { ore_ordinarie: 7 }, prima: { stato: 'approvato', totali: { ore_ordinarie: 8 } } } },
      ],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    const pausa = ev.find((e) => e.titolo === 'Pausa aggiunta dall’ufficio')!;
    expect(pausa.dettaglio).toEqual(['Lavoro 8:00 → 7:00']);
    expect(pausa.chi).toBe('Chiara Bianchi');
    expect(pausa.dopoApprovazione).toBe(true);
  });

  it('una giornata scritta a mano la sera non si chiama «correzione»', () => {
    const ev = costruisciCronologia({
      timbrature: [],
      viaggi: [],
      versioni: [
        { versione: 1, azione: 'modifica_tecnico', quando: '2026-09-01T19:05:00Z', chi: 'Mario Rossi', snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 }, prima: { stato: 'bozza', totali: { ore_ordinarie: 0 } } } },
      ],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    expect(ev[0]!.titolo).toBe('Ore scritte a mano dalla persona');
    expect(ev[0]!.dettaglio[0]).toBe('Lavoro 0:00 → 8:00');
  });

  it('una versione vecchia salvata senza cambiare niente non compare', () => {
    const ev = costruisciCronologia({
      timbrature: [],
      viaggi: [],
      versioni: [
        { versione: 1, azione: 'modifica_tecnico', quando: '2026-09-01T19:00:00Z', chi: 'Mario', snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 } } },
        { versione: 2, azione: 'modifica_tecnico', quando: '2026-09-01T19:05:00Z', chi: 'Mario', snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 } } },
      ],
      userIdPersona: PERSONA,
      approvataAutoAl: null,
    });
    expect(ev).toHaveLength(1);
  });
});

describe('ritardo di arrivo', () => {
  it('su una riga vecchia di QR il ritardo non si mostra: era un caricamento in blocco', () => {
    const ev = costruisciCronologia({
      timbrature: [timb({ id: 'a', tipo: 'ingresso', ts: '2026-07-07T06:00:00Z', createdAt: '2026-07-16T10:00:00Z', origine: 'qr', modalita: null })],
      viaggi: [], versioni: [], userIdPersona: PERSONA, approvataAutoAl: null,
    });
    expect(ev[0]!.arrivatoAl).toBeNull();
  });

  it('una giornata dichiarata la sera dice a che ora è stata registrata', () => {
    const ev = costruisciCronologia({
      timbrature: [timb({ id: 'a', tipo: 'ingresso', ts: '2026-09-01T06:00:00Z', createdAt: '2026-09-01T19:30:00Z', origine: 'manuale', modalita: 'giornata_dichiarata' })],
      viaggi: [], versioni: [], userIdPersona: PERSONA, approvataAutoAl: null,
    });
    expect(ev[0]!.arrivatoAl).toBe('2026-09-01T19:30:00Z');
    expect(ev[0]!.arrivoDichiarato).toBe(true);
  });
});

describe('affidabilitaGiornata', () => {
  const base = { azioniVersioni: [] as string[], scrittaAMano: false, userIdPersona: PERSONA };

  it('solo QR e app → tutta timbrata', () => {
    expect(
      affidabilitaGiornata({
        ...base,
        timbrature: [
          timb({ id: 'a', tipo: 'ingresso', ts: 'x', modalita: 'qr' }),
          timb({ id: 'b', tipo: 'uscita', ts: 'x', modalita: 'app' }),
        ],
      }),
    ).toBe('timbrata');
  });

  it('una pausa dichiarata → in parte a mano', () => {
    expect(
      affidabilitaGiornata({
        ...base,
        timbrature: [timb({ id: 'a', tipo: 'uscita', ts: 'x', pausa: true, modalita: 'pausa_dichiarata' })],
      }),
    ).toBe('in_parte_a_mano');
  });

  it('giornata scritta a mano senza timbrature → in parte a mano', () => {
    expect(affidabilitaGiornata({ ...base, scrittaAMano: true, timbrature: [] })).toBe('in_parte_a_mano');
  });

  it('una correzione dell ufficio vince su tutto', () => {
    expect(
      affidabilitaGiornata({
        ...base,
        azioniVersioni: ['pausa_ufficio'],
        timbrature: [timb({ id: 'a', tipo: 'ingresso', ts: 'x', modalita: 'qr' })],
      }),
    ).toBe('corretta_ufficio');
  });
});

describe('riassuntoVersioni', () => {
  it('le versioni senza cambiamenti non rendono «corretta» una giornata', () => {
    const r = riassuntoVersioni([
      { versione: 1, azione: 'modifica_tecnico', quando: 'x', chi: null, snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 } } },
      { versione: 2, azione: 'modifica_ufficio', quando: 'x', chi: null, snapshot: { stato: 'approvato', totali: { ore_ordinarie: 8 } } },
    ]);
    // La prima non ha un «prima» e conta; la seconda è identica e non conta.
    expect(r.azioniSignificative).toEqual(['modifica_tecnico']);
    expect(r.modificheDopoApprovazione).toBe(0);
  });

  it('conta le modifiche vere arrivate su una giornata già approvata', () => {
    const r = riassuntoVersioni([
      { versione: 1, azione: 'pausa_ufficio', quando: 'x', chi: null, snapshot: { stato: 'approvato', totali: { ore_ordinarie: 7 }, prima: { stato: 'approvato', totali: { ore_ordinarie: 8 } } } },
    ]);
    expect(r.azioniSignificative).toEqual(['pausa_ufficio']);
    expect(r.modificheDopoApprovazione).toBe(1);
  });
});
