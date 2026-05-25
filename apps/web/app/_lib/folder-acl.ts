import 'server-only';

import { createServiceSupabase } from '@impiantixplus/api/service';
import type { AppRole } from '@impiantixplus/api';

/**
 * Layer ACL su cartelle/file commessa — server-side only.
 *
 * Modello:
 *   commessa_folder_overrides → folder_presets → deny by default ({admin,office})
 *
 * Risoluzione path:
 *   - "Foto/Sopralluogo/IMG_001.jpg" → cerca match con folder_presets.path
 *     prendendo il prefisso più lungo classificato (es. "Foto/Sopralluogo")
 *   - Se nessun match: eredita dal genitore (es. "Foto")
 *   - Se ancora nessuno: fallback {admin, office} only.
 *
 * `super_admin` (is_platform_admin=true) DEVE essere gestito dal chiamante
 * con `skipAclForSuperAdmin = true`. Questo helper assume role applicativo.
 */

export interface FolderAclRow {
  path: string;
  visible_roles: AppRole[] | null;
  upload_roles: AppRole[] | null;
}

export interface ResolvedAcl {
  visible_roles: AppRole[];
  upload_roles: AppRole[];
  /** Se true, l'utente non super_admin con ruolo fuori da visible_roles è BLOCCATO. */
  source: 'override' | 'preset' | 'inherited' | 'deny-default';
}

const DENY_DEFAULT: AppRole[] = ['admin', 'office'];

/**
 * Carica TUTTI i preset + override del tenant/commessa in una sola query
 * batch. Da chiamare 1 volta a request, poi resolvePath() è in memoria.
 */
export async function loadFolderAclMap(
  tenantId: string,
  commessaId: string | null,
): Promise<{
  presets: FolderAclRow[];
  overrides: FolderAclRow[];
}> {
  const service = createServiceSupabase();
  const [presetsRes, overridesRes] = await Promise.all([
    service
      .from('folder_presets')
      .select('path, visible_roles, upload_roles')
      .eq('tenant_id', tenantId),
    commessaId
      ? service
          .from('commessa_folder_overrides')
          .select('path, visible_roles, upload_roles')
          .eq('commessa_id', commessaId)
      : Promise.resolve({ data: [] as FolderAclRow[] }),
  ]);
  return {
    presets: (presetsRes.data as FolderAclRow[] | null) ?? [],
    overrides: (overridesRes.data as FolderAclRow[] | null) ?? [],
  };
}

/**
 * Normalizza path: rimuove leading/trailing slash, normalizza separatori,
 * decoda eventuali %xx.
 */
export function normalizePath(p: string): string {
  return decodeURIComponent(p)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/');
}

/**
 * Estrae il path "relativo alla root commessa" da un path completo.
 * Es. "01_Richieste/BER-26-007_X/Foto/Sopralluogo/IMG.jpg" → "Foto/Sopralluogo/IMG.jpg"
 *
 * Strategy: scarta i primi 2 segmenti (status folder + nome cartella).
 * Se il path non corrisponde allo schema (es. file vecchi/legacy), ritorna
 * il path originale.
 */
export function stripCommessaRoot(fullPath: string): string {
  const norm = normalizePath(fullPath);
  const parts = norm.split('/');
  // Schema atteso: <01_X>/<nome_cartella>/<rest...>
  if (parts.length < 3) return norm;
  const isStatusFolder = /^[0-9]{2}_/.test(parts[0]!);
  if (!isStatusFolder) return norm;
  return parts.slice(2).join('/');
}

/**
 * Risolve i ruoli autorizzati per un dato path (relativo a commessa root),
 * cercando override prima, poi preset, poi parent path, infine deny-default.
 */
export function resolvePath(
  relPath: string,
  map: { presets: FolderAclRow[]; overrides: FolderAclRow[] },
): ResolvedAcl {
  const norm = normalizePath(relPath);
  if (!norm) {
    // Root commessa: tutti gli admin/office la vedono
    return { visible_roles: DENY_DEFAULT, upload_roles: DENY_DEFAULT, source: 'deny-default' };
  }

  // Cerca match esatto su override
  const ovExact = map.overrides.find((r) => r.path === norm);
  if (ovExact && (ovExact.visible_roles || ovExact.upload_roles)) {
    return {
      visible_roles: ovExact.visible_roles ?? [...DENY_DEFAULT],
      upload_roles: ovExact.upload_roles ?? [...DENY_DEFAULT],
      source: 'override',
    };
  }

  // Cerca match esatto su preset
  const prExact = map.presets.find((r) => r.path === norm);
  if (prExact) {
    return {
      visible_roles: prExact.visible_roles ?? [...DENY_DEFAULT],
      upload_roles: prExact.upload_roles ?? [...DENY_DEFAULT],
      source: 'preset',
    };
  }

  // Inherit dal parent (rimuovi un segmento e riprova)
  const segments = norm.split('/');
  if (segments.length > 1) {
    const parent = segments.slice(0, -1).join('/');
    const inherited = resolvePath(parent, map);
    if (inherited.source !== 'deny-default') {
      return { ...inherited, source: 'inherited' };
    }
  }

  // Fallback: deny by default → solo admin/office
  return {
    visible_roles: DENY_DEFAULT,
    upload_roles: DENY_DEFAULT,
    source: 'deny-default',
  };
}

/**
 * Check sintetico: l'utente con ruolo `role` può VEDERE il path?
 * super_admin bypass va gestito dal chiamante.
 */
export function canView(
  role: AppRole,
  relPath: string,
  map: { presets: FolderAclRow[]; overrides: FolderAclRow[] },
): boolean {
  const acl = resolvePath(relPath, map);
  return acl.visible_roles.includes(role);
}

/**
 * Check sintetico: l'utente con ruolo `role` può CARICARE in path?
 */
export function canUpload(
  role: AppRole,
  relPath: string,
  map: { presets: FolderAclRow[]; overrides: FolderAclRow[] },
): boolean {
  const acl = resolvePath(relPath, map);
  return acl.upload_roles.includes(role);
}
