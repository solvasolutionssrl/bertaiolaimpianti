import { SOGLIA_SILENZIO_ORE_DEFAULT } from '@kommessa/api/integrazione-salute';

/**
 * Lettura della config del modulo `integrazione`, in un posto solo.
 *
 * La config vive in `tenant_modules.config` come jsonb libero: comodo per
 * aggiungere una chiave senza migration, pericoloso se ogni chiamante la
 * interpreta a modo suo. Questo file e' l'unico punto in cui si decide cosa
 * significa una chiave assente o storta — e la risposta e' sempre **il valore
 * prudente**: senza `modalita` valida si e' in simulazione, cioe' non si scrive
 * niente da nessuna parte.
 *
 * Deliberatamente fuori dal file di server action: la` 'use server'` puo'
 * esportare solo funzioni async, e questa la usano anche i Server Component.
 */

export interface ConfigIntegrazione {
  sistema: string | null;
  modalita: 'simulazione' | 'attiva';
  collaudoEsterni: string[];
  /** Tetto ai testi che l'agente compone per il gestionale. `null` = nessuno. */
  maxDescrizione: number | null;
  sogliaSilenzioOre: number;
}

export function leggiConfigIntegrazione(
  raw: Record<string, unknown> | null | undefined,
): ConfigIntegrazione {
  const c = raw ?? {};
  const soglia = Number(c.soglia_silenzio_ore);
  return {
    sistema: typeof c.sistema === 'string' && c.sistema.trim() ? c.sistema.trim() : null,
    modalita: c.modalita === 'attiva' ? 'attiva' : 'simulazione',
    collaudoEsterni: Array.isArray(c.collaudo_esterni)
      ? (c.collaudo_esterni as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    maxDescrizione:
      typeof c.max_descrizione === 'number' && Number.isFinite(c.max_descrizione)
        ? c.max_descrizione
        : null,
    sogliaSilenzioOre:
      Number.isFinite(soglia) && soglia > 0 ? soglia : SOGLIA_SILENZIO_ORE_DEFAULT,
  };
}
