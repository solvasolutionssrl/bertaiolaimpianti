'use client';

import {
  Bell,
  Briefcase,
  CalendarClock,
  Clock3,
  ListChecks,
  MessageSquare,
  PencilRuler,
  Ticket,
  type LucideIcon,
} from 'lucide-react';

/**
 * Come si chiama a schermo ogni tipo di avviso.
 *
 * ## Perché un posto solo
 *
 * Perché ce n'erano **tre**, e divergevano. L'elenco sul telefono conosceva
 * quattordici tipi, quello in ufficio sette, e nessuno dei due conosceva
 * `pianificazione_pubblicata` o i permessi — che sono 444 righe su 444 in
 * produzione, cioè **tutte quelle realmente inviate**. Chi apriva la pagina
 * notifiche in ufficio leggeva `pianificazione_pubblicata` così com'era.
 *
 * E in più c'era una grafia sbagliata: la mappa del telefono diceva
 * `commessa_assigned` (in inglese) mentre il tipo registrato nel database è
 * `commessa_assegnata`. Quell'avviso sarebbe arrivato senza nome.
 *
 * ⚠️ Qui stanno **solo i tipi che qualcuno manda davvero.** Un elenco di tipi
 * «che potrebbero esistere» torna a divergere alla prima aggiunta. Se compare
 * un tipo nuovo si vede «Avviso», che è brutto ma vero: meglio di un nome
 * tecnico sotto gli occhi di chi lavora.
 */
export interface NotificaMeta {
  label: string;
  Icon: LucideIcon;
}

/** Il ripiego: mai il nome tecnico del tipo a schermo. */
export const NOTIFICA_RIPIEGO: NotificaMeta = { label: 'Avviso', Icon: Bell };

export const NOTIFICA_META: Record<string, NotificaMeta> = {
  // ── mondo commesse ──
  todo_assegnato: { label: 'Assegnato a te', Icon: ListChecks },
  commessa_assegnata: { label: 'Sei su questo lavoro', Icon: Briefcase },
  ticket_assigned: { label: 'Ticket assegnato', Icon: Ticket },
  ticket_created: { label: 'Nuovo ticket', Icon: Ticket },
  ticket_nuovo_portale: { label: 'Ticket dal cliente', Icon: MessageSquare },
  // ── mondo presenze ──
  kantiere_modifica_tecnico: { label: 'Ore modificate dal tecnico', Icon: PencilRuler },
  pianificazione_pubblicata: { label: 'Pianificazione pubblicata', Icon: CalendarClock },
  permesso_richiesto: { label: 'Richiesta di permesso', Icon: Clock3 },
  permesso_esito: { label: 'Esito della richiesta', Icon: Clock3 },
};

/** L'etichetta e l'icona di un avviso, con il ripiego già applicato. */
export function metaNotifica(tipo: string): NotificaMeta {
  return NOTIFICA_META[tipo] ?? NOTIFICA_RIPIEGO;
}
