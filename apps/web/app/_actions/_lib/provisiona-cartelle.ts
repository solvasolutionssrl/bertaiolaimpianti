/**
 * Provisioning cartelle commessa su cloud storage (Nextcloud / Supabase).
 *
 * Modulo server-only condiviso (NON è un file `'use server'`: niente di qui è
 * un'action callable dal client). Usato sia da `creaCommessa` (alla creazione)
 * sia da `aggiungiVociEProvisiona` (quando si aggiungono tipologie a una
 * commessa esistente).
 *
 * Best-effort: se il provider non è raggiungibile la funzione NON solleva — il
 * DB resta consistente, le cartelle verranno comunque create al primo PUT.
 */

import { createServiceSupabase } from '@kommessa/api/service';
import {
  getStorageProvider,
  SCAFFOLD_TREE,
  type StorageProviderName,
} from '@kommessa/integrations/storage';

export type StorageProvisionResult =
  | { provisioned: true; provider: StorageProviderName; created: number; path: string }
  | { provisioned: false; provider: StorageProviderName | 'none'; reason: string };

/**
 * Provisiona lo SCAFFOLD base + le sottocartelle delle voci attive sotto la
 * root della commessa (`cloudFolderPath`). Idempotente: createFolder è
 * ricorsivo e non fallisce se la cartella esiste già, quindi è sicuro
 * richiamarla con l'unione vecchie+nuove voci.
 */
export async function provisionaCartelle(opts: {
  tenantId: string;
  nomeCartella: string;
  cloudFolderPath: string;
  /** Voci attive della commessa (Sezione A + B). Per ognuna che ha
   *  cartella_template valorizzato (o override per il tenant), viene
   *  creata la sottocartella corrispondente sotto la root commessa. */
  vociAttive: number[];
}): Promise<StorageProvisionResult> {
  try {
    const service = createServiceSupabase();
    const { data: tenant, error } = await (service
      .from('tenants')
      .select('storage_provider, storage_config, crea_cartelle' as never)
      .eq('id', opts.tenantId)
      .maybeSingle() as unknown as Promise<{
        data: {
          storage_provider: string | null;
          storage_config: Record<string, string> | null;
          crea_cartelle: boolean | null;
        } | null;
        error: unknown;
      }>);
    if (error || !tenant) {
      return { provisioned: false, provider: 'none', reason: 'tenant_config_unreadable' };
    }
    // Tenant senza scaffold cartelle (es. solo-R2): provisioning no-op.
    if (tenant.crea_cartelle === false) {
      return { provisioned: false, provider: 'none', reason: 'crea_cartelle_off' };
    }
    const providerName = (tenant.storage_provider as StorageProviderName) ?? 'supabase';
    const cfg = (tenant.storage_config as Record<string, string> | null) ?? {};

    const rootPath = opts.cloudFolderPath.replace(/^\/+|\/+$/g, '');

    const extraFolders = await calcolaCartelleVoci(
      service,
      opts.tenantId,
      opts.vociAttive,
    );
    const scaffoldSet = new Set(
      (SCAFFOLD_TREE as unknown as string[]).map((s) =>
        s.replace(/^\/+|\/+$/g, ''),
      ),
    );
    const extraToCreate = extraFolders.filter((c) => !scaffoldSet.has(c));

    if (providerName === 'nextcloud') {
      if (!cfg.baseUrl || !cfg.user || !cfg.appPassword) {
        return { provisioned: false, provider: providerName, reason: 'nextcloud_config_incomplete' };
      }
      const provider = getStorageProvider({
        provider: 'nextcloud',
        baseUrl: cfg.baseUrl,
        user: cfg.user,
        appPassword: cfg.appPassword,
        basePath: typeof cfg.basePath === 'string' ? cfg.basePath : undefined,
      });
      await provider.createFolderTree(rootPath, SCAFFOLD_TREE as unknown as string[]);
      for (const sub of extraToCreate) {
        try {
          await provider.createFolder(`${rootPath}/${sub}`);
        } catch (e) {
          console.warn(
            `[provisiona-cartelle] createFolder extra fallita "${sub}":`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      return {
        provisioned: true,
        provider: 'nextcloud',
        created: SCAFFOLD_TREE.length + 1 + extraToCreate.length,
        path: rootPath,
      };
    }

    if (providerName === 'supabase') {
      const provider = getStorageProvider({
        provider: 'supabase',
        bucket: (cfg.bucket as string | undefined) ?? 'commesse',
      });
      await provider.createFolderTree(rootPath, SCAFFOLD_TREE as unknown as string[]);
      for (const sub of extraToCreate) {
        try {
          await provider.createFolder(`${rootPath}/${sub}`);
        } catch (e) {
          console.warn(
            `[provisiona-cartelle] createFolder extra fallita "${sub}":`,
            e instanceof Error ? e.message : e,
          );
        }
      }
      return {
        provisioned: true,
        provider: 'supabase',
        created: SCAFFOLD_TREE.length + 1 + extraToCreate.length,
        path: rootPath,
      };
    }

    return { provisioned: false, provider: providerName, reason: 'provider_not_supported' };
  } catch (err) {
    return {
      provisioned: false,
      provider: 'none',
      reason: err instanceof Error ? err.message.slice(0, 200) : 'unknown_error',
    };
  }
}

/**
 * Risolve le cartelle effettive delle voci attive su una commessa.
 *
 * Per ogni voce ID nell'elenco, legge:
 *  - voci_catalogo.cartella_template (path di default del catalogo)
 *  - tenant_voci_override.cartella_template_override (override locale)
 *
 * Restituisce array di path puliti (slash leading/trailing rimossi), nessun
 * duplicato, nell'ordine delle voci. I path vuoti/null sono filtrati: le
 * voci "solo dato" (Cliente, Ticket, Tracciatura cantiere) non producono
 * cartelle.
 */
export async function calcolaCartelleVoci(
  service: ReturnType<typeof createServiceSupabase>,
  tenantId: string,
  vociIds: number[],
): Promise<string[]> {
  if (vociIds.length === 0) return [];

  const [baseRes, overrideRes] = await Promise.all([
    service
      .from('voci_catalogo')
      .select('id, cartella_template')
      .in('id', vociIds),
    service
      .from('tenant_voci_override' as never)
      .select('voce_id, cartella_template_override, attiva')
      .eq('tenant_id', tenantId)
      .in('voce_id', vociIds),
  ]);

  const base = new Map<number, string | null>();
  for (const v of (baseRes.data ?? []) as Array<{
    id: number;
    cartella_template: string | null;
  }>) {
    base.set(v.id, v.cartella_template);
  }
  const override = new Map<
    number,
    { cartella?: string | null; attiva: boolean }
  >();
  for (const o of (overrideRes.data ?? []) as unknown as Array<{
    voce_id: number;
    cartella_template_override: string | null;
    attiva: boolean;
  }>) {
    override.set(o.voce_id, {
      cartella: o.cartella_template_override,
      attiva: o.attiva,
    });
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of vociIds) {
    const ovr = override.get(id);
    if (ovr && ovr.attiva === false) continue;
    const cartella =
      ovr?.cartella !== undefined && ovr.cartella !== null
        ? ovr.cartella
        : base.get(id) ?? null;
    if (!cartella || cartella.trim().length === 0) continue;
    const clean = cartella.replace(/^\/+|\/+$/g, '').trim();
    if (clean.length === 0) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
