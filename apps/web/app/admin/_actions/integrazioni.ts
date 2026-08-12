'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createServiceSupabase } from '@kommessa/api/service';

import { requirePlatformAdmin } from '../_lib/guard';
import { auditPlatform } from '../_lib/audit-platform';
import { leggiConfigIntegrazione } from '../_lib/integrazione-config';

/**
 * Governo del modulo **integrazione** per un cliente. Solo super admin.
 *
 * Questa e' la cabina di regia di `/api/v1`: la riga in `tenant_modules` non e'
 * un'etichetta descrittiva, e' **l'interruttore vero**. `autenticaApi()` la
 * legge a ogni chiamata e senza `attivo=true` risponde 403 `modulo_spento`
 * prima di toccare qualunque dato — quindi un token valido di un cliente non
 * abilitato non ottiene niente.
 *
 * Prima queste tre cose (modulo, modalita', identificativi di collaudo) si
 * cambiavano solo con una query a mano sul database di produzione. Da qui in
 * avanti hanno un volante, e ogni giro di volante lascia traccia in
 * `audit_events`.
 */

const MAX_DESCRIZIONE_MIN = 20;
const MAX_DESCRIZIONE_MAX = 500;
const SOGLIA_SILENZIO_MAX = 24 * 30;

type Esito = { ok: true } | { ok: false; error: string };

/** Legge modulo + tenant, o spiega perche' non si puo' procedere. */
async function caricaModulo(tenantId: string) {
  const service = createServiceSupabase();
  const [{ data: t }, { data: m }] = await Promise.all([
    service.from('tenants').select('id, nome, slug').eq('id', tenantId).maybeSingle(),
    service
      .from('tenant_modules' as never)
      .select('attivo, config')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'integrazione')
      .maybeSingle(),
  ]);
  const tenant = t as unknown as { id: string; nome: string; slug: string } | null;
  const modulo = m as unknown as {
    attivo: boolean;
    config: Record<string, unknown> | null;
  } | null;
  return { service, tenant, modulo };
}

// ---------------------------------------------------------------------------
// Interruttore del modulo
// ---------------------------------------------------------------------------

const ATTIVA_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  attivo: z.boolean(),
});

/**
 * Accende o spegne l'integrazione per un cliente.
 *
 * Spegnere e' la leva d'emergenza: da quel momento **ogni** chiamata a
 * `/api/v1` di quel cliente riceve 403, token in circolazione compresi. Non
 * revoca i token (potrebbero servire di nuovo domani) e non tocca gli
 * abbinamenti gia' confermati: e' un rubinetto, non una demolizione.
 *
 * All'accensione la modalita' parte da **simulazione** se non ce n'e' gia' una:
 * nessun cliente nuovo deve poter scrivere sul proprio gestionale il giorno
 * stesso in cui gli si accende il modulo.
 */
export async function attivaIntegrazioneTenant(input: {
  tenantId: string;
  attivo: boolean;
}): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = ATTIVA_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido.' };

  const { service, tenant, modulo } = await caricaModulo(parsed.data.tenantId);
  if (!tenant) return { ok: false, error: 'Cliente inesistente.' };

  const prima = leggiConfigIntegrazione(modulo?.config);
  const config: Record<string, unknown> = {
    ...(modulo?.config ?? {}),
    modalita: prima.modalita,
  };

  const { error } = await service.from('tenant_modules' as never).upsert(
    {
      tenant_id: parsed.data.tenantId,
      module_code: 'integrazione',
      attivo: parsed.data.attivo,
      config,
      configured_at: new Date().toISOString(),
    } as never,
    { onConflict: 'tenant_id,module_code' },
  );
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.integrazione.modulo',
    before: { attivo: modulo?.attivo ?? false },
    after: { attivo: parsed.data.attivo, modalita: prima.modalita },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/integrazioni');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Impostazioni non pericolose
// ---------------------------------------------------------------------------

const IMPOSTAZIONI_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  sistema: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/, 'Solo minuscole, numeri, trattino e underscore.'),
  maxDescrizione: z
    .number()
    .int()
    .min(MAX_DESCRIZIONE_MIN)
    .max(MAX_DESCRIZIONE_MAX)
    .nullable(),
  sogliaSilenzioOre: z.number().int().min(1).max(SOGLIA_SILENZIO_MAX),
});

/**
 * Gestionale, tetto alle descrizioni e soglia di silenzio.
 *
 * Il `sistema` e' l'etichetta con cui il cliente compare ovunque (staging,
 * abbinamenti, registro scritture) e **non arriva mai dal chiamante**: se
 * fosse un parametro dell'API, un token rubato potrebbe scrivere nel registro
 * di un gestionale diverso. Cambiarlo a integrazione avviata orfanerebbe i dati
 * gia' depositati, quindi si blocca.
 */
export async function aggiornaImpostazioniIntegrazione(input: {
  tenantId: string;
  sistema: string;
  maxDescrizione: number | null;
  sogliaSilenzioOre: number;
}): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = IMPOSTAZIONI_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Input non valido.' };
  }

  const { service, tenant, modulo } = await caricaModulo(parsed.data.tenantId);
  if (!tenant) return { ok: false, error: 'Cliente inesistente.' };
  if (!modulo) return { ok: false, error: 'Accendi prima il modulo integrazione.' };

  const prima = leggiConfigIntegrazione(modulo.config);
  const nuovoSistema = parsed.data.sistema || null;

  if (prima.sistema && nuovoSistema !== prima.sistema) {
    const { count } = await service
      .from('integrazione_staging' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', parsed.data.tenantId)
      .eq('sistema', prima.sistema);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error:
          `Ci sono già ${count} record depositati sotto "${prima.sistema}". ` +
          'Cambiare gestionale li renderebbe irraggiungibili: vanno prima svuotati.',
      };
    }
  }

  const config: Record<string, unknown> = {
    ...(modulo.config ?? {}),
    sistema: nuovoSistema,
    max_descrizione: parsed.data.maxDescrizione,
    soglia_silenzio_ore: parsed.data.sogliaSilenzioOre,
  };
  if (nuovoSistema === null) delete config.sistema;
  if (parsed.data.maxDescrizione === null) delete config.max_descrizione;

  const { error } = await service
    .from('tenant_modules' as never)
    .update({ config } as never)
    .eq('tenant_id', parsed.data.tenantId)
    .eq('module_code', 'integrazione');
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.integrazione.impostazioni',
    before: {
      sistema: prima.sistema,
      max_descrizione: prima.maxDescrizione,
      soglia_silenzio_ore: prima.sogliaSilenzioOre,
    },
    after: {
      sistema: nuovoSistema,
      max_descrizione: parsed.data.maxDescrizione,
      soglia_silenzio_ore: parsed.data.sogliaSilenzioOre,
    },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/integrazioni');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// La leva pericolosa
// ---------------------------------------------------------------------------

const MODALITA_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  modalita: z.enum(['simulazione', 'attiva']),
  /** Il codice azienda ridigitato a mano. Serve solo per aprire, non per chiudere. */
  conferma: z.string().trim().optional(),
});

/**
 * Sposta il cliente fra **simulazione** e **attiva**.
 *
 * Passare ad `attiva` significa che da quel momento i record escono con
 * `inviabile: true` e l'agente e' autorizzato a scriverli sul gestionale del
 * cliente. Su un ERP append-only — e ERGO lo e': `GET` sulle ore risponde 405 e
 * non esiste una DELETE utilizzabile — quella scrittura **non torna indietro**.
 * Non e' un'impostazione, e' un'autorizzazione a produrre effetti contabili
 * fuori da qui.
 *
 * Per questo aprire richiede di ridigitare il codice azienda, e chiudere no:
 * la direzione prudente non si ostacola mai.
 */
export async function impostaModalitaIntegrazione(input: {
  tenantId: string;
  modalita: 'simulazione' | 'attiva';
  conferma?: string;
}): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = MODALITA_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido.' };

  const { service, tenant, modulo } = await caricaModulo(parsed.data.tenantId);
  if (!tenant) return { ok: false, error: 'Cliente inesistente.' };
  if (!modulo?.attivo) return { ok: false, error: 'Il modulo integrazione non è attivo.' };

  const prima = leggiConfigIntegrazione(modulo.config);
  if (prima.modalita === parsed.data.modalita) return { ok: true };

  if (parsed.data.modalita === 'attiva') {
    if (!prima.sistema) {
      return { ok: false, error: 'Scegli prima quale gestionale, poi si può aprire.' };
    }
    const atteso = tenant.slug.toUpperCase();
    if ((parsed.data.conferma ?? '').toUpperCase() !== atteso) {
      return {
        ok: false,
        error: `Per aprire le scritture riscrivi il codice azienda: ${atteso}.`,
      };
    }
  }

  const { error } = await service
    .from('tenant_modules' as never)
    .update({
      config: { ...(modulo.config ?? {}), modalita: parsed.data.modalita },
    } as never)
    .eq('tenant_id', parsed.data.tenantId)
    .eq('module_code', 'integrazione');
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.integrazione.modalita',
    metadata: { irreversibile: parsed.data.modalita === 'attiva' },
    before: { modalita: prima.modalita },
    after: { modalita: parsed.data.modalita },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/integrazioni');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Recinto di collaudo
// ---------------------------------------------------------------------------

const COLLAUDO_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  esterni: z.array(z.string().trim().min(1).max(80)).max(50),
});

/**
 * Gli identificativi che restano scrivibili anche in simulazione.
 *
 * Serve a provare la catena intera su **un** cantiere concordato col cliente,
 * guardando insieme il risultato sul suo gestionale, senza aprire tutto il
 * resto. E' la controparte pratica della regola: le cose che non tornano
 * indietro si provano una alla volta.
 */
export async function aggiornaCollaudoEsterni(input: {
  tenantId: string;
  esterni: string[];
}): Promise<Esito> {
  const admin = await requirePlatformAdmin();
  const parsed = COLLAUDO_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido.' };

  const { service, tenant, modulo } = await caricaModulo(parsed.data.tenantId);
  if (!tenant) return { ok: false, error: 'Cliente inesistente.' };
  if (!modulo) return { ok: false, error: 'Accendi prima il modulo integrazione.' };

  const prima = leggiConfigIntegrazione(modulo.config);
  const esterni = Array.from(new Set(parsed.data.esterni)).sort();

  const { error } = await service
    .from('tenant_modules' as never)
    .update({
      config: { ...(modulo.config ?? {}), collaudo_esterni: esterni },
    } as never)
    .eq('tenant_id', parsed.data.tenantId)
    .eq('module_code', 'integrazione');
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.integrazione.collaudo',
    before: { collaudo_esterni: prima.collaudoEsterni },
    after: { collaudo_esterni: esterni },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/admin/integrazioni');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manutenzione
// ---------------------------------------------------------------------------

const SVUOTA_SCHEMA = z.object({
  tenantId: z.string().uuid(),
  /** Codice azienda ridigitato: si cancellano dati, anche se ricostruibili. */
  conferma: z.string().trim(),
});

/**
 * Svuota il deposito delle anagrafiche lette dal gestionale.
 *
 * Non e' distruttivo nella sostanza — `integrazione_staging` e' una copia di
 * lavoro, l'agente la rifa' al giro dopo — ma **gli abbinamenti gia'
 * confermati non si toccano**: quelli sono lavoro umano, e sono la cosa che
 * costa di piu' rifare. Se un abbinamento punta a un record non piu' presente,
 * la pagina d'ufficio lo dice invece di perderlo.
 *
 * Serve quando il gestionale cambia (o cambia il modo di leggerlo) e il
 * deposito vecchio confonde le proposte con roba che non esiste piu'.
 */
export async function svuotaStagingIntegrazione(input: {
  tenantId: string;
  conferma: string;
}): Promise<{ ok: true; eliminati: number } | { ok: false; error: string }> {
  const admin = await requirePlatformAdmin();
  const parsed = SVUOTA_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Input non valido.' };

  const { service, tenant, modulo } = await caricaModulo(parsed.data.tenantId);
  if (!tenant) return { ok: false, error: 'Cliente inesistente.' };
  if (!modulo) return { ok: false, error: 'Modulo integrazione non presente.' };

  const atteso = tenant.slug.toUpperCase();
  if (parsed.data.conferma.toUpperCase() !== atteso) {
    return { ok: false, error: `Per svuotare riscrivi il codice azienda: ${atteso}.` };
  }

  const { count, error } = await service
    .from('integrazione_staging' as never)
    .delete({ count: 'exact' })
    .eq('tenant_id', parsed.data.tenantId);
  if (error) return { ok: false, error: error.message };

  await auditPlatform({
    actorUserId: admin.userId,
    actorEmail: admin.email,
    tenantId: parsed.data.tenantId,
    entityType: 'tenant',
    entityId: parsed.data.tenantId,
    action: 'tenant.integrazione.staging_svuotato',
    metadata: { eliminati: count ?? 0 },
  });

  revalidatePath(`/admin/tenants/${parsed.data.tenantId}`);
  revalidatePath('/office/integrazione');
  return { ok: true, eliminati: count ?? 0 };
}
