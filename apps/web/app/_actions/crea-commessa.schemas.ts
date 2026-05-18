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

export const creaCommessaServerInputSchema = z
  .object({
    clienteId: z.string().uuid().optional(),
    clienteNew: clienteNewSchema.optional(),
    voci: z.array(z.number().int().min(1).max(38)).default([]),
    descrizioneFinale: z.string().min(1).max(60),
    note: z.string().optional().nullable(),
    presetId: z.string().uuid().optional().nullable(),
    indirizzoCantiere: z.string().optional().nullable(),
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
