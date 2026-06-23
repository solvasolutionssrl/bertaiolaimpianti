import { describe, it, expect } from 'vitest';
import { romeOffsetMinutes, romeDay, romeWallToUtcIso, romeDayBoundsUtc } from './rome-time';

describe('rome-time', () => {
  it('offset +60 in inverno, +120 in estate', () => {
    expect(romeOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(romeOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });

  it('romeWallToUtcIso converte ora italiana → UTC', () => {
    expect(romeWallToUtcIso('2026-01-15', '08:00')).toBe('2026-01-15T07:00:00.000Z');
    expect(romeWallToUtcIso('2026-07-15', '08:00')).toBe('2026-07-15T06:00:00.000Z');
    expect(romeWallToUtcIso('2026-07-15', '17:30')).toBe('2026-07-15T15:30:00.000Z');
  });

  it('romeDayBoundsUtc copre il giorno italiano esatto', () => {
    expect(romeDayBoundsUtc('2026-01-15')).toEqual({
      fromIso: '2026-01-14T23:00:00.000Z',
      toIso: '2026-01-15T23:00:00.000Z',
    });
    expect(romeDayBoundsUtc('2026-07-15')).toEqual({
      fromIso: '2026-07-14T22:00:00.000Z',
      toIso: '2026-07-15T22:00:00.000Z',
    });
  });

  it('una timbratura a mezzanotte e mezza italiana resta nel giorno corretto', () => {
    // 00:30 del 15/07 italiano = 22:30Z del 14/07: deve cadere nel giorno 15/07.
    const ts = '2026-07-14T22:30:00.000Z';
    const { fromIso, toIso } = romeDayBoundsUtc('2026-07-15');
    expect(ts >= fromIso && ts < toIso).toBe(true);
    expect(romeDay(new Date(ts))).toBe('2026-07-15');
  });

  it('romeDay riflette il calendario italiano', () => {
    // 23:30Z del 14/07 = 01:30 del 15/07 italiano.
    expect(romeDay(new Date('2026-07-14T23:30:00.000Z'))).toBe('2026-07-15');
  });
});
