/**
 * Helper di display per il "titolo" mostrato sulle card commessa nelle PWA.
 *
 * Convenzione (stessa della dashboard /mobile):
 *   1. descrizione_ai_finale (set quando creata via voice intake + AI)
 *   2. descrizione_ai_proposta (proposta AI non ancora rivista)
 *   3. note_iniziali (nota originale del capo)
 *   4. fallback al nome_cartella ripulito (codice + cliente strippati,
 *      CamelCase splittato in parole)
 *
 * NON usare mai `nome_cartella` raw nel display: contiene
 * "{codice}_{cliente}_{lavoro}" perché è la directory Nextcloud.
 */

export function pickTitolo(r: Record<string, unknown>): string | null {
  const raw =
    (r.descrizione_ai_finale as string | null | undefined) ??
    (r.descrizione_ai_proposta as string | null | undefined) ??
    (r.note_iniziali as string | null | undefined) ??
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/)[0]!;
  const firstPeriod = firstLine.indexOf('. ');
  if (firstPeriod > 10) return firstLine.slice(0, firstPeriod).trim();
  return firstLine;
}

/**
 * Estrae il "nome lavoro" dal nome_cartella DB
 *   ("{codice}_{cliente}_{lavoro}", es. "BER-26-005_ChiaraGambini_AgriCampeggio")
 * strippando codice e cliente e rendendolo human-friendly.
 * Usato come ultimo fallback quando pickTitolo() ritorna null.
 */
export function estraiNomeLavoro(
  nomeCartella: string | null | undefined,
  codiceInterno: string | null | undefined,
  clienteNome: string | null | undefined,
): string {
  if (!nomeCartella) return '';
  const segments = nomeCartella.split('_').filter(Boolean);
  if (segments.length === 0) return '';

  let start = 0;
  if (
    codiceInterno &&
    segments[0]?.toLowerCase() === codiceInterno.toLowerCase()
  ) {
    start = 1;
  }
  const second = segments[start];
  if (clienteNome && second) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clienteNorm = norm(clienteNome);
    if (clienteNorm && norm(second) === clienteNorm) {
      start += 1;
    }
  }

  const raw = segments.slice(start).join(' ').trim();
  return formatNomeUmano(raw);
}

/**
 * Spezza CamelCase / PascalCase in parole separate da spazio:
 *   "AgriCampeggio" → "Agri Campeggio"
 *   "BoxDoccia"     → "Box Doccia"
 *   "HTTPServer"    → "HTTP Server"
 * Lascia inalterate le stringhe già tutte minuscole.
 */
function formatNomeUmano(s: string): string {
  if (!s) return '';
  return s
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Combina i due helper: ritorna il titolo "vivo" se disponibile, altrimenti
 * il nome lavoro estratto dal nome_cartella ripulito. Ritorna '' se entrambi
 * non producono nulla — chi chiama decide il fallback finale (es. cliente).
 */
export function risolviTitoloCommessa(input: {
  descrizione_ai_finale?: string | null;
  descrizione_ai_proposta?: string | null;
  note_iniziali?: string | null;
  nome_cartella?: string | null;
  codice_interno?: string | null;
  cliente_nome?: string | null;
}): string {
  const ai = pickTitolo({
    descrizione_ai_finale: input.descrizione_ai_finale,
    descrizione_ai_proposta: input.descrizione_ai_proposta,
    note_iniziali: input.note_iniziali,
  });
  if (ai) return ai;
  return estraiNomeLavoro(
    input.nome_cartella,
    input.codice_interno,
    input.cliente_nome,
  );
}
