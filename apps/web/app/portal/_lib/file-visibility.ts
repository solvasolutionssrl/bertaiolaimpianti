/**
 * Whitelist server-side delle cartelle pubblicabili nel portale cliente.
 *
 * Doppia barriera difensiva:
 *  1. RLS DB-side (vista `portal_files_view`) — la barriera *vera*.
 *  2. Questa whitelist — backstop applicativo: se per qualunque motivo
 *     un file con tag pubblico=false sfuggisse alle RLS, qui filtriamo
 *     per path prima di mostrarlo al cliente.
 *
 * Cartelle ammesse: vedi specifica `Tassonomia_Lavori.md §2.2` (scaffold).
 */
const PUBLIC_FOLDER_PATTERNS: readonly RegExp[] = Object.freeze([
  /^Preventivi(\/|$)/i,
  /^Documenti\/DICO(\/|$)/i,
  /^Documenti\/Certificazioni(\/|$)/i,
  /^Documenti\/POS(\/|$)/i,
  /^Chiusura(\/|$)/i,
]);

/**
 * Verifica se un path è in una cartella pubblicabile.
 * `path` è inteso *relativo* alla root della commessa
 * (es. `Preventivi/Bagno.pdf`, NON l'intero path cloud).
 */
export function isPubliclyVisiblePath(relativePath: string): boolean {
  const clean = relativePath.replace(/^\/+/, '');
  return PUBLIC_FOLDER_PATTERNS.some((re) => re.test(clean));
}

/**
 * Estrae il path relativo rispetto alla root commessa.
 * `cloudFolderPath` è il prefisso della commessa (es.
 * `Rossi_2026-05-10_SistemazioneBagno`).
 */
export function relativeFromCommessaRoot(
  fullPath: string,
  cloudFolderPath: string,
): string {
  const root = cloudFolderPath.replace(/\/+$/, '');
  if (!root) return fullPath;
  const rel = fullPath.startsWith(`${root}/`)
    ? fullPath.slice(root.length + 1)
    : fullPath;
  return rel;
}
