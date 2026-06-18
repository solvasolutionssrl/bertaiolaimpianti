import { describe, it, expect } from 'vitest';
import { etichettaAccesso } from './kantiere';

describe('etichettaAccesso', () => {
  it('Con accesso se ha user_id', () => {
    expect(etichettaAccesso({ user_id: 'u1' })).toBe('Con accesso');
  });
  it('Solo timbratura se user_id null/undefined', () => {
    expect(etichettaAccesso({ user_id: null })).toBe('Solo timbratura');
    expect(etichettaAccesso({ user_id: undefined })).toBe('Solo timbratura');
  });
});
