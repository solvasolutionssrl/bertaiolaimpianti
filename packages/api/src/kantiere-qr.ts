export function qrUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${token}`;
}

export function statoQr(
  row: { attivo: boolean; revoked_at: string | null } | null,
): 'assente' | 'attivo' | 'revocato' {
  if (!row) return 'assente';
  return row.attivo ? 'attivo' : 'revocato';
}

export function mascheraToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export const TEMPLATE_QR = [
  { id: 'essenziale', nome: 'Essenziale', descrizione: 'Bianco, QR grande centrato, logo discreto.' },
  { id: 'cartello', nome: 'Cartello cantiere', descrizione: 'Fascia colorata col brand, riquadro QR, dati cantiere.' },
  { id: 'industriale', nome: 'Industriale', descrizione: 'Alto contrasto, testo grande, QR XXL leggibile da lontano.' },
] as const;

export function risolviTemplateQr(id: string | null | undefined): string {
  const ok = TEMPLATE_QR.some((t) => t.id === id);
  return ok ? (id as string) : TEMPLATE_QR[0]!.id;
}
