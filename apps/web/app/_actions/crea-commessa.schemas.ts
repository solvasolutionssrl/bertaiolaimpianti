/**
 * Schema + types per `creaCommessa` server action.
 *
 * Sono in file separato perché Next.js 14 NON permette di esportare
 * non-function da un modulo con `'use server'` in cima. Quindi schema
 * e types li teniamo qui (file "normale") e li importiamo dall'action.
 */

import { z } from 'zod';

export const clienteNewSchema = z.object({
  ragione_sociale: z.string().min(1),
  tipo: z.enum(['persona_fisica', 'azienda']).default('persona_fisica'),
  indirizzo: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  telefoni: z.array(z.string()).default([]),
  email: z.array(z.string()).default([]),
  note: z.string().optional().nullable(),
});

/** Referente del cliente, opzionalmente estratto dall'AI voice extraction. */
export const referenteInputSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  ruolo: z.string().trim().max(80).optional().nullable(),
  telefono: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
});

export const creaCommessaServerInputSchema = z
  .object({
    clienteId: z.string().uuid().optional(),
    clienteNew: clienteNewSchema.optional(),
    // Range esteso a 32767 per accogliere la voce 39 e le custom-tenant 1000+
    // (vedi migration 20260528004100_voci_catalogo_tenant_custom.sql).
    voci: z.array(z.number().int().min(1).max(32767)).default([]),
    descrizioneFinale: z.string().min(1).max(60),
    note: z.string().optional().nullable(),
    /**
     * Trascrizione completa della prima nota dettata dal capo (voice intake).
     * Salvata in `commesse.note_iniziali` come "verità sacrosanta" e mostrata
     * come "Dettagli" sulla card commessa.
     */
    noteIniziali: z.string().optional().nullable(),
    presetId: z.string().uuid().optional().nullable(),
    indirizzoCantiere: z.string().optional().nullable(),
    /**
     * Referenti del cliente, da AI voice extraction o input manuale.
     * Vengono UPSERT-ati su contatto_cliente dopo la creazione del cliente.
     * Il primo della lista diventa is_primary se non esiste ancora un primary.
     */
    referenti: z.array(referenteInputSchema).max(10).optional(),
  })
  .refine((v) => Boolean(v.clienteId) || Boolean(v.clienteNew), {
    message: 'Specificare clienteId oppure clienteNew',
  });

export type CreaCommessaServerInput = z.infer<typeof creaCommessaServerInputSchema>;

export interface CreaCommessaServerData {
  commessaId: string;
  codiceInterno: string;
  nomeCartella: string;
  cloudFolderPath: string;
  codiceCliente: string;
}

export type CreaCommessaServerResult =
  | { ok: true; data: CreaCommessaServerData }
  | { ok: false; error: string };
