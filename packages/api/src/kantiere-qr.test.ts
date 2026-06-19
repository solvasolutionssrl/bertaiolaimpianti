import { describe, it, expect } from 'vitest';
import { qrUrl, statoQr, mascheraToken, risolviTemplateQr, TEMPLATE_QR } from './kantiere-qr';

describe('qrUrl', () => {
  it('compone origin + /t/token togliendo lo slash finale', () => {
    expect(qrUrl('https://app.test/', 'abc')).toBe('https://app.test/t/abc');
    expect(qrUrl('https://app.test', 'abc')).toBe('https://app.test/t/abc');
  });
});

describe('statoQr', () => {
  it('assente quando null', () => expect(statoQr(null)).toBe('assente'));
  it('attivo quando attivo=true', () => expect(statoQr({ attivo: true, revoked_at: null })).toBe('attivo'));
  it('revocato quando attivo=false', () =>
    expect(statoQr({ attivo: false, revoked_at: '2026-06-21T00:00:00Z' })).toBe('revocato'));
});

describe('mascheraToken', () => {
  it('maschera i token lunghi', () => {
    const t = 'abcdef0123456789wxyz';
    expect(mascheraToken(t)).toBe('abcdef…wxyz');
  });
  it('lascia invariati i token corti', () => expect(mascheraToken('abc')).toBe('abc'));
});

describe('risolviTemplateQr', () => {
  it('ritorna l’id valido', () => expect(risolviTemplateQr(TEMPLATE_QR[1]!.id)).toBe(TEMPLATE_QR[1]!.id));
  it('fallback al primo per id ignoto/null', () => {
    expect(risolviTemplateQr('boh')).toBe(TEMPLATE_QR[0]!.id);
    expect(risolviTemplateQr(null)).toBe(TEMPLATE_QR[0]!.id);
  });
});
