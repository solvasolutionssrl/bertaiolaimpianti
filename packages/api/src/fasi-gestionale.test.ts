import { describe, expect, it } from 'vitest';
import { cantierePerExternalDa, pianificaFasiDalGestionale } from './fasi-gestionale';

const ADESSO = '2026-10-23T03:00:00.000Z';
const cantieri = new Map([
  ['25151', 'c-1'],
  ['25098', 'c-2'],
]);
const sosta = [
  { externalId: '25151.2', nome: 'QGBT QUADRO GENERALE', externalCodice: '25151.2', externalCantiereId: '25151' },
  { externalId: '25151.10', nome: 'CABINA', externalCodice: '25151.10', externalCantiereId: '25151' },
  { externalId: '99999.1', nome: 'ORFANA', externalCodice: '99999.1', externalCantiereId: '99999' },
];

describe('pianificaFasiDalGestionale', () => {
  it('crea le fasi dei cantieri collegati e lascia in sosta quelle senza padre', () => {
    const p = pianificaFasiDalGestionale({ sosta, cantierePerExternal: cantieri, fasiNostre: [], mappature: [], adesso: ADESSO });
    expect(p.crea.map((c) => `${c.cantiereId}:${c.codice}`)).toEqual(['c-1:25151.2', 'c-1:25151.10']);
    expect(p.mappa.map((m) => m.externalId)).toEqual(['25151.2', '25151.10']);
    expect(p.senzaPadre).toEqual([{ externalId: '99999.1', externalCantiereId: '99999' }]);
    expect(p.aggiorna).toEqual([]);
  });

  it('⭐ idempotente: con tutto allineato non produce operazioni (e non chiude niente)', () => {
    const fasiNostre = [
      { id: 'f-a', cantiereId: 'c-1', nome: 'QGBT QUADRO GENERALE', codice: '25151.2', origineGestionaleAl: ADESSO },
      { id: 'f-b', cantiereId: 'c-1', nome: 'CABINA', codice: '25151.10', origineGestionaleAl: ADESSO },
      // Una fase nostra che il gestionale non manda piu': resta com'e'.
      { id: 'f-c', cantiereId: 'c-1', nome: 'VECCHIA', codice: '25151.3', origineGestionaleAl: ADESSO },
    ];
    const mappature = [
      { externalId: '25151.2', entitaId: 'f-a' },
      { externalId: '25151.10', entitaId: 'f-b' },
      { externalId: '25151.3', entitaId: 'f-c' },
    ];
    const p = pianificaFasiDalGestionale({ sosta: sosta.slice(0, 2), cantierePerExternal: cantieri, fasiNostre, mappature, adesso: ADESSO });
    expect(p).toEqual({ crea: [], aggiorna: [], mappa: [], senzaPadre: [] });
  });

  it('aggiorna il nome di una fase mappata se cambia', () => {
    const fasiNostre = [{ id: 'f-a', cantiereId: 'c-1', nome: 'QGBT', codice: '25151.2', origineGestionaleAl: ADESSO }];
    const p = pianificaFasiDalGestionale({ sosta: sosta.slice(0, 1), cantierePerExternal: cantieri, fasiNostre, mappature: [{ externalId: '25151.2', entitaId: 'f-a' }], adesso: ADESSO });
    expect(p.aggiorna).toEqual([{ id: 'f-a', nome: 'QGBT QUADRO GENERALE' }]);
    expect(p.crea).toEqual([]);
  });

  it('collega una fase scritta a mano con lo stesso codice invece di crearne una seconda', () => {
    const fasiNostre = [{ id: 'f-mano', cantiereId: 'c-1', nome: 'Quadro generale', codice: '25151.2', origineGestionaleAl: null }];
    const p = pianificaFasiDalGestionale({ sosta: sosta.slice(0, 1), cantierePerExternal: cantieri, fasiNostre, mappature: [], adesso: ADESSO });
    expect(p.crea).toEqual([]);
    expect(p.mappa).toEqual([{ externalId: '25151.2', entitaId: 'f-mano', nuova: true }]);
    expect(p.aggiorna).toEqual([{ id: 'f-mano', nome: 'QGBT QUADRO GENERALE', origineGestionaleAl: ADESSO }]);
  });

  it('una mappatura verso una fase cancellata a mano: si ricrea e si rimappa', () => {
    const p = pianificaFasiDalGestionale({ sosta: sosta.slice(0, 1), cantierePerExternal: cantieri, fasiNostre: [], mappature: [{ externalId: '25151.2', entitaId: 'f-sparita' }], adesso: ADESSO });
    expect(p.crea.length).toBe(1);
    expect(p.mappa).toEqual([{ externalId: '25151.2', entitaId: null, nuova: false }]);
  });

  it('cantierePerExternalDa: le mappature vincono sul codice commessa', () => {
    const m = cantierePerExternalDa([{ externalId: '25151', entitaId: 'c-1' }], [{ id: 'c-x', codiceCommessa: '25151' }, { id: 'c-2', codiceCommessa: '25098' }]);
    expect(m.get('25151')).toBe('c-1');
    expect(m.get('25098')).toBe('c-2');
  });
});
