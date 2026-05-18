import { z } from 'zod';

export const clienteSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  ragioneSociale: z.string().min(1),
  tipo: z.enum(['persona_fisica', 'azienda']).default('persona_fisica'),
  indirizzo: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  provincia: z.string().length(2).optional().nullable(),
  telefoni: z.array(z.string()).default([]),
  email: z.array(z.string().email()).default([]),
  note: z.string().optional().nullable(),
});

export type ClienteInput = z.infer<typeof clienteSchema>;

export const creaCommessaInputSchema = z.object({
  cliente: clienteSchema.partial({ id: true, tenantId: true }),
  indirizzoCantiere: z.string().optional(),
  voci: z.array(z.number().int().min(1).max(38)).default([]),
  note: z.string().optional(),
  presetId: z.string().uuid().optional().nullable(),
});

export type CreaCommessaInput = z.infer<typeof creaCommessaInputSchema>;

export const aiNamingInputSchema = z.object({
  ragioneSociale: z.string().min(1),
  indirizzo: z.string().optional(),
  voci: z.array(z.number()).default([]),
  note: z.string().optional(),
});

export type AiNamingInput = z.infer<typeof aiNamingInputSchema>;

export const ticketInputSchema = z.object({
  oggetto: z.string().min(3),
  descrizione: z.string().min(1),
  clienteId: z.string().uuid().optional(),
  priorita: z.enum(['bassa', 'media', 'alta', 'urgente']).default('media'),
  source: z
    .enum(['manual', 'email', 'portal_cliente', 'imported_from_freshdesk'])
    .default('manual'),
});

export type TicketInput = z.infer<typeof ticketInputSchema>;
