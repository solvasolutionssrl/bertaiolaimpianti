import type { TourStep } from './onboarding-tour';

/**
 * Definizione passi del tour Web Office.
 *
 * I selettori CSS puntano a elementi reali della shell (`AppShellOffice`
 * in `@kommessa/ui`). Se uno dei selettori dovesse cambiare, il
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
    title: 'Benvenuto in Kommessa',
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

/**
 * Tour Web Office per i tenant in modalità **Kantiere** (es. FPM): niente
 * commesse/tickets/co-pilot — l'esperienza è presenze e cantieri. Selettori
 * sempre presenti nella shell (menu utente, sidebar) + la voce chiave
 * "Presenze e ore" (se la sezione è collassata il passo si auto-salta).
 */
export const KANTIERE_OFFICE_TOUR_STEPS: TourStep[] = [
  {
    id: 'office-k-menu',
    target: 'header [aria-label="Menu utente"]',
    title: 'Benvenuto in Kantiere',
    description:
      'Sei nel pannello d\'ufficio. Da qui esci, cambi profilo e gestisci il tuo account.',
    placement: 'bottom',
  },
  {
    id: 'office-k-sidebar',
    target: 'nav[aria-label="Navigazione laterale"]',
    title: 'Tutto parte da qui',
    description:
      'In "Azienda" gestisci dipendenti, parco mezzi e sedi. In "Kantiere" trovi cantieri, QR, presenze e report.',
    placement: 'right',
  },
  {
    id: 'office-k-presenze',
    target: 'a[href="/office/kantiere/rapportini"]',
    title: 'Presenze e ore',
    description:
      'Le timbrature dei tecnici diventano rapportini in automatico: qui controlli le ore, chiudi le giornate rimaste aperte ed esporti per le buste paga.',
    placement: 'right',
  },
];

/**
 * Tour PWA per i tecnici in modalità **Kantiere**: cantieri, timbratura da QR
 * e ore. Selettori sulla home cantieri (`main`) e sulla bottom-nav kantiere.
 */
export const KANTIERE_MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'mobile-k-cantieri',
    target: 'main',
    title: 'I tuoi cantieri',
    description:
      'Qui trovi i cantieri: cerca, apri quello dove lavori oggi e tieni d\'occhio il turno in corso.',
    placement: 'bottom',
  },
  {
    id: 'mobile-k-scansiona',
    target: 'a[href="/mobile/kantiere/scansiona"]',
    title: 'Timbra con il QR',
    description:
      'Inquadra il QR del cantiere per registrare ingresso e uscita. Se arrivi in viaggio, l\'app calcola km e tempo.',
    placement: 'top',
  },
  {
    id: 'mobile-k-ore',
    target: 'a[href="/mobile/kantiere/ore"]',
    title: 'Le tue ore',
    description:
      'A fine giornata il rapportino è già compilato dalle timbrature: ore lavorate, straordinari e viaggio. Controlla qui.',
    placement: 'top',
  },
];
