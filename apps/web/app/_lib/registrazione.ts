/**
 * La regola sul **bordo inferiore** di una registrazione vocale.
 *
 * Non e' una preferenza: e' un fatto su cosa l'AI riesce a fare. Sotto i tre
 * secondi la trascrizione torna vuota, oppure — peggio — torna una frase
 * inventata a partire dal rumore («Sottotitoli e revisione a cura di…» e'
 * quella che capita piu' spesso). Sotto il decimo di secondo la rifiuta
 * OpenAI stessa, con un 400.
 *
 * ⚠️ **Non si puo' togliere il limite: si puo' solo scegliere come dirlo.**
 * Un doppio tocco sul microfono — cosa che capita di continuo con i guanti, o
 * quando non si e' sicuri che abbia registrato — produce mezzo secondo di
 * audio. Il comportamento giusto e' un avviso **in linea**, calmo, col tasto
 * subito ripremibile: non un popup di errore, che per chi legge vuol dire
 * «si e' rotto qualcosa» e non «riprova parlando».
 *
 * ⚠️ Questa soglia stava scritta in `_components/voice-recorder.tsx` e valeva
 * per cinque punti dell'app su sei. Il sesto — il dialog delle riunioni — ha
 * un registratore tutto suo, non la conosceva, e mandava all'AI qualunque
 * cosa: mezzo secondo di audio diventava il popup «Trascrizione fallita».
 * Misurato su una riunione vera. Per questo la regola sta qui e non la',
 * dove uno dei due chiamanti non la vedeva.
 */

/** Sotto questa durata la registrazione si butta, senza passare dall'AI. */
export const DURATA_MINIMA_MS = 3000;

/**
 * Cosa si legge quando e' troppo breve.
 *
 * ⚠️ **Non dire «tieni premuto»**: il microfono si tocca per avviare e si
 * tocca per fermare. Il messaggio vecchio insegnava il gesto sbagliato
 * proprio a chi aveva appena sbagliato.
 */
export const AVVISO_TROPPO_BREVE =
  'Troppo breve: tocca il microfono, parla, poi tocca per fermare.';

/** Quando l'audio c'era ma non si e' capito niente: non e' un guasto. */
export const AVVISO_NIENTE_DA_CAPIRE =
  'Non ho capito niente: prova a parlare piu\' vicino al telefono.';
