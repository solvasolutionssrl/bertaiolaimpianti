import type { TourStep } from './onboarding-tour';

/**
 * Definizione passi del tour Web Office.
 *
 * I selettori CSS puntano a elementi reali della shell (`AppShellOffice`
 * in `@impiantixplus/ui`). Se uno dei selettori dovesse cambiare, il
 * componente `OnboardingTour` salta automaticamente il passo e logga
 * un warning in console (non rompe il flusso).
 *
 * Ordine pensato per condurre l'utente office dal primo orientamento
 * (sidebar / menu) fino agli strumenti chiave (commesse, ticket, ricerca
 * globale, co-pilot AI).
 */
export const OFFICE_TOUR_STEPS: TourStep[] = [
  {
    id: 'office-menu-utente',
    target: 'header [aria-label="Menu utente"]',
    title: 'Benvenuto in impiantiXplus',
    description:
      'Sei loggato come utente del tenant. Da qui esci, cambi profilo o accedi alle impostazioni del tuo account.',
    placement: 'bottom',
  },
  {
    id: 'office-sidebar',
    target: 'nav[aria-label="Navigazione laterale"]',
    title: 'La tua sidebar',
    description:
      'Ogni voce porta a una sezione del gestionale: commesse, tickets, clienti, turni, impostazioni.',
    placement: 'right',
  },
  {
    id: 'office-commesse',
    target: 'a[href="/office/commesse"]',
    title: 'Le commesse sono il cuore',
    description:
      'Tutti i lavori vivono qui. Click per vederle tutte, filtrare per stato e aprire il dettaglio di ciascuna.',
    placement: 'right',
  },
  {
    id: 'office-nuova-commessa',
    target: 'a[href="/office/commesse/nuova"]',
    title: 'Crea una nuova commessa',
    description:
      'Premi "Nuova commessa" per partire da zero. Puoi anche usare la voce 🎙️: l\'AI estrae cliente, voci e descrizione dal tuo audio.',
    placement: 'bottom',
  },
  {
    id: 'office-tickets',
    target: 'a[href="/office/tickets"]',
    title: 'Le richieste cliente arrivano qui',
    description:
      'Email, telefonate e segnalazioni dal portale diventano Ticket: assegnali, rispondi e trasformali in commesse quando serve.',
    placement: 'right',
  },
  {
    id: 'office-ricerca',
    target: 'header input[type="search"]',
    title: 'Ricerca globale',
    description:
      'Premi ⌘K (Ctrl+K su Windows) per aprire la ricerca: cerchi commesse, clienti, tickets, ovunque nel gestionale.',
    placement: 'bottom',
  },
  {
    id: 'office-copilot',
    target: 'a[href="/office/copilot"]',
    title: 'Co-pilot AI',
    description:
      'Il tuo assistente AI: riepiloghi giornata, suggerimenti sui ticket aperti, descrizioni commessa generate in un click.',
    placement: 'right',
  },
];

/**
 * Definizione passi del tour PWA mobile (tecnici / capi cantiere).
 *
 * Puntano a elementi della home `/mobile` e della bottom-nav. Più brevi
 * del tour office perché l'utente in cantiere ha meno tempo.
 */
export const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'mobile-commesse-giorno',
    target: 'main',
    title: 'Le tue commesse del giorno',
    description:
      'In home trovi le commesse a cui sei assegnato oggi. Scorri per vederle tutte.',
    placement: 'bottom',
  },
  {
    id: 'mobile-apri-commessa',
    target: 'main [data-tour="commessa-card"]',
    title: 'Tap su una commessa',
    description:
      'Apri il dettaglio per vedere voci, foto, note del capo e segnare avanzamento delle lavorazioni.',
    placement: 'top',
  },
  {
    id: 'mobile-sopralluogo',
    target: 'a[href="/mobile/sopralluogo"]',
    title: 'Crea un sopralluogo',
    description:
      'Sei in cantiere e devi aprire una commessa nuova? Bottone Sopralluogo: wizard guidato in 7 step.',
    placement: 'top',
  },
  {
    id: 'mobile-turno',
    target: 'a[href="/mobile/turno"]',
    title: 'Timer per il turno',
    description:
      'Start/Stop del turno di lavoro. Le ore confluiscono in automatico nei rapportini settimanali.',
    placement: 'top',
  },
  {
    id: 'mobile-vocale',
    target: '[data-tour="vocale"]',
    title: '🎙️ Vocale AI',
    description:
      'Tieni premuto e parla: l\'AI estrae automaticamente cliente, voci da fare e descrizione del lavoro.',
    placement: 'top',
  },
];
