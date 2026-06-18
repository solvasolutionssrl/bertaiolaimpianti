/**
 * Schema + types per `aggiornaCommessaCompleta`.
 *
 * In file separato perché un modulo `'use server'` non può esportare
 * non-function (stesso vincolo di crea-commessa.schemas.ts).
 */

import { z } from 'zod';

import { referenteInputSchema } from './crea-commessa.schemas';

export const statoCommessaValues = [
  'bozza',
  'aperta',
  'in_corso',
  'collaudo',
  'completata',
  'archiviata',
] as const;

export const aggiornaCommessaCompletaInputSchema = z.object({
  commessaId: z.string().uuid(),
  // Campi contenuto. Tutti opzionali: si aggiornano solo quelli presenti.
  descrizioneFinale: z.string().trim().max(120).optional(),
  indirizzoCantiere: z.string().trim().max(200).nullable().optional(),
  noteIniziali: z.string().nullable().optional(),
  isCritica: z.boolean().optional(),
  stato: z.enum(statoCommessaValues).optional(),
  responsabileId: z.string().uuid().nullable().optional(),
  // Riassegnazione a un cliente ESISTENTE (il nome cartella resta invariato).
  clienteId: z.string().uuid().optional(),
  // Referenti di questa commessa: se presente, sostituisce l'insieme
  // scope-commessa (delete + insert).
  referenti: z.array(referenteInputSchema).max(20).optional(),
  // Voci/tipologie desiderate: APPEND-ONLY. Vengono aggiunte solo le nuove,
  // mai rimosse quelle esistenti.
  voci: z.array(z.number().int().min(1).max(32767)).optional(),
});

export type AggiornaCommessaCompletaInput = z.infer<
  typeof aggiornaCommessaCompletaInputSchema
>;

export type AggiornaCommessaCompletaResult =
  | { ok: true; storageOk: boolean; vociAggiunte: number[] }
  | { ok: false; error: string };
