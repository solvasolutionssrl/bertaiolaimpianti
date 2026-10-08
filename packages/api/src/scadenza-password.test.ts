import { describe, expect, it } from 'vitest';

import {
  REGOLA_DAL,
  formattaGiorno,
  giorniFra,
  giornoDaCuiContare,
  quandoScade,
  scadenzaDopo,
  statoScadenzaPassword,
  testoScadenza,
} from './scadenza-password';

describe('scadenzaDopo: la prima data non soddisfatta', () => {
  it('dal giorno in cui la regola parte, la prima scadenza e il 10 dicembre', () => {
    expect(scadenzaDopo('2026-10-07')).toBe('2026-12-10');
  });

  it('cambiarla dentro la finestra vale per quella scadenza', () => {
    // 3 dicembre e dentro la finestra (dal 1 dicembre): il 10 e soddisfatto.
    expect(scadenzaDopo('2026-12-03')).toBe('2027-03-10');
    // Il primo del mese e il primo giorno utile.
    expect(scadenzaDopo('2026-12-01')).toBe('2027-03-10');
    // Il giorno stesso vale anche lui.
    expect(scadenzaDopo('2026-12-10')).toBe('2027-03-10');
  });

  it('il 30 novembre sta FUORI dalla finestra: il bordo delle date fisse', () => {
    expect(scadenzaDopo('2026-11-30')).toBe('2026-12-10');
  });

  it('chi la cambia in ritardo riparte dal trimestre dopo', () => {
    expect(scadenzaDopo('2026-12-25')).toBe('2027-03-10');
  });

  it('copre tutti e quattro i trimestri', () => {
    expect(scadenzaDopo('2027-01-15')).toBe('2027-03-10');
    expect(scadenzaDopo('2027-03-10')).toBe('2027-06-10');
    expect(scadenzaDopo('2027-06-10')).toBe('2027-09-10');
    expect(scadenzaDopo('2027-09-10')).toBe('2027-12-10');
    expect(scadenzaDopo('2027-12-10')).toBe('2028-03-10');
  });

  it('la scadenza cade sempre dopo il giorno da cui si conta, ed entro un anno', () => {
    for (let mese = 1; mese <= 12; mese += 1) {
      for (const giorno of [1, 9, 10, 11, 28]) {
        const g =
          '2027-' +
          String(mese).padStart(2, '0') +
          '-' +
          String(giorno).padStart(2, '0');
        const s = scadenzaDopo(g);
        expect(s > g).toBe(true);
        expect(giorniFra(g, s)).toBeLessThanOrEqual(366);
      }
    }
  });
});

describe('giornoDaCuiContare: i tre ripieghi in fila', () => {
  it('se l ha scelta lei, vale quel giorno', () => {
    expect(giornoDaCuiContare({ scelta: '2027-03-05', nato: '2026-05-01' })).toBe('2027-03-05');
  });

  it('chi c era da maggio conta dal giorno in cui la regola esiste, non da maggio', () => {
    // Senza questo, al primo accesso dopo il deploy l azienda trova un muro.
    expect(giornoDaCuiContare({ scelta: null, nato: '2026-05-01' })).toBe(REGOLA_DAL);
  });

  it('un account nuovo conta dalla sua nascita, non dalla regola', () => {
    // Senza questo, un tecnico assunto a febbraio e fatto entrare SENZA muro
    // (la scelta del 08/10) si troverebbe murato al primo accesso.
    expect(giornoDaCuiContare({ scelta: null, nato: '2027-02-01' })).toBe('2027-02-01');
  });

  it('una password scelta prima che la regola esistesse conta dalla regola', () => {
    expect(giornoDaCuiContare({ scelta: '2026-06-01', nato: '2026-05-01' })).toBe(REGOLA_DAL);
  });

  it('senza nessun dato non si inventa niente: si parte dalla regola', () => {
    expect(giornoDaCuiContare({ scelta: null, nato: null })).toBe(REGOLA_DAL);
  });
});

describe('statoScadenzaPassword: valida, in scadenza, scaduta', () => {
  const legacy = { scelta: null, nato: '2026-05-01' };

  it('fino al 30 novembre non si dice niente', () => {
    const e = statoScadenzaPassword({ oggi: '2026-11-30', ...legacy });
    expect(e.stato).toBe('valida');
    expect(e.scadenza).toBe('2026-12-10');
    expect(e.giorniRimasti).toBe(10);
  });

  it('dal primo del mese si avvisa, e il numero scende ogni giorno', () => {
    const primo = statoScadenzaPassword({ oggi: '2026-12-01', ...legacy });
    expect(primo.stato).toBe('in_scadenza');
    expect(primo.giorniRimasti).toBe(9);
    expect(primo.avvisoDal).toBe('2026-12-01');

    const vigilia = statoScadenzaPassword({ oggi: '2026-12-09', ...legacy });
    expect(vigilia.stato).toBe('in_scadenza');
    expect(vigilia.giorniRimasti).toBe(1);
  });

  it('il giorno della scadenza non si passa', () => {
    const e = statoScadenzaPassword({ oggi: '2026-12-10', ...legacy });
    expect(e.stato).toBe('scaduta');
    expect(e.giorniRimasti).toBe(0);
  });

  it('e non si passa nemmeno nei giorni dopo: il muro non e solo quel giorno', () => {
    for (const oggi of ['2026-12-11', '2026-12-31', '2027-01-20', '2027-03-09']) {
      const e = statoScadenzaPassword({ oggi, ...legacy });
      expect(e.stato).toBe('scaduta');
      expect(e.scadenza).toBe('2026-12-10');
      expect(e.giorniRimasti).toBeLessThan(0);
    }
  });

  it('cambiandola durante la finestra si torna validi fino al trimestre dopo', () => {
    const e = statoScadenzaPassword({ oggi: '2026-12-05', scelta: '2026-12-05', nato: '2026-05-01' });
    expect(e.stato).toBe('valida');
    expect(e.scadenza).toBe('2027-03-10');
  });

  it('cambiandola il giorno del muro si passa subito', () => {
    const e = statoScadenzaPassword({ oggi: '2026-12-10', scelta: '2026-12-10', nato: '2026-05-01' });
    expect(e.stato).toBe('valida');
    expect(e.scadenza).toBe('2027-03-10');
  });

  it('un account nato dentro la finestra non viene murato appena nasce', () => {
    const e = statoScadenzaPassword({ oggi: '2026-12-08', scelta: null, nato: '2026-12-08' });
    expect(e.stato).toBe('valida');
    expect(e.scadenza).toBe('2027-03-10');
  });

  it('un orologio avanti non mura nessuno', () => {
    // Se per qualche ragione la data in tabella e nel futuro (orologio di un
    // server sbagliato, importazione storta), la risposta deve essere «niente
    // da dire», non un muro: si prende il massimo fra i ripieghi, quindi la
    // scadenza finisce lontana.
    const e = statoScadenzaPassword({ oggi: '2026-10-08', scelta: '2027-05-01', nato: '2026-05-01' });
    expect(e.stato).toBe('valida');
    expect(e.giorniRimasti).toBeGreaterThan(0);
  });

  it('una data vuota non produce «fra NaN giorni»', () => {
    const e = statoScadenzaPassword({ oggi: '2026-10-08', scelta: '', nato: '' });
    expect(Number.isFinite(e.giorniRimasti)).toBe(true);
    expect(e.scadenza).toBe('2026-12-10');
  });

  it('un account nato appena prima della finestra viene avvisato, non murato', () => {
    const e = statoScadenzaPassword({ oggi: '2026-12-02', scelta: null, nato: '2026-11-28' });
    expect(e.stato).toBe('in_scadenza');
    expect(e.scadenza).toBe('2026-12-10');
  });
});

describe('giorniFra', () => {
  it('conta i giorni calendario, cambio di mese e anno compresi', () => {
    expect(giorniFra('2026-12-01', '2026-12-10')).toBe(9);
    expect(giorniFra('2026-12-10', '2026-12-10')).toBe(0);
    expect(giorniFra('2026-12-31', '2027-01-01')).toBe(1);
    expect(giorniFra('2026-12-20', '2026-12-10')).toBe(-10);
  });

  it('non si fa ingannare dal cambio dell ora legale', () => {
    // 29 marzo 2027: ora legale. Un conto fatto in ore locali darebbe 0.96.
    expect(giorniFra('2027-03-28', '2027-03-29')).toBe(1);
    expect(giorniFra('2027-10-30', '2027-10-31')).toBe(1);
  });
});

describe('come si dice', () => {
  it('quandoScade parla come una persona', () => {
    expect(quandoScade(9)).toBe('fra 9 giorni');
    expect(quandoScade(1)).toBe('domani');
    expect(quandoScade(0)).toBe('oggi');
    expect(quandoScade(-3)).toBe('oggi');
  });

  it('formattaGiorno dice l anno solo se non e quello di oggi', () => {
    expect(formattaGiorno('2026-12-10')).toBe('10 dicembre');
    expect(formattaGiorno('2026-12-10', '2026-12-01')).toBe('10 dicembre');
    expect(formattaGiorno('2027-03-10', '2026-12-01')).toBe('10 marzo 2027');
    expect(formattaGiorno('')).toBe('');
  });

  it('il testo di chi e scaduto non contiene un numero di giorni', () => {
    const t = testoScadenza(statoScadenzaPassword({ oggi: '2026-12-20', scelta: null, nato: '2026-05-01' }));
    expect(t.titolo).toContain('scaduta');
    expect(t.corpo).not.toMatch(/giorn/);
  });

  it('il testo di chi e in scadenza dice quando, e da quando non si passa', () => {
    const t = testoScadenza(statoScadenzaPassword({ oggi: '2026-12-01', scelta: null, nato: '2026-05-01' }));
    expect(t.titolo).toBe('La password scade fra 9 giorni');
    expect(t.corpo).toContain('10 dicembre');
  });
});
