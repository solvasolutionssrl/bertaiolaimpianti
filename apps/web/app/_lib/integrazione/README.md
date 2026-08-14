# `_lib/integrazione` — il ponte verso il gestionale del cliente

Quattro file, quattro domande diverse. Sono separati perché hanno vite diverse:
uno gira a ogni pagina, uno solo a fine giro di lettura, uno solo dal cron.

| File | Risponde a | Chi lo chiama |
|---|---|---|
| `collegati.ts` | *questo nostro record è agganciato al gestionale? e cosa ne è già uscito?* | elenchi e schede d'ufficio |
| `nuovi.ts` | *cosa c'è là fuori che noi non abbiamo?* | l'avviso in anagrafica |
| `promuovi.ts` | *porta in produzione ciò che il gestionale ci ha depositato* | chiusura di un giro di lettura |
| `alert.ts` | *avvisa che un collegamento è in avaria* | il controllo periodico |

## Le regole che valgono per tutti e quattro

**Fail-soft, sempre.** Un errore qui non deve poter rompere l'elenco dei
cantieri o quello dei dipendenti: quelle pagine servono tutti i giorni,
l'integrazione riguarda un cliente su due. In caso di dubbio si restituisce
«niente» e il segno non compare.

**Gated sul modulo.** Senza `integrazione` attiva e senza un gestionale scelto
si esce subito: i tenant che non ce l'hanno non pagano nemmeno una query.

**Lo stato si calcola, non si materializza.** «Chi è nuovo» è
*depositati − collegati − ignorati*. Una coda tenuta a mano direbbe una bugia
il giorno che qualcuno collega un record da un'altra strada.

**Una query per lotto, mai una per riga.** Con duecento cantieri la differenza
fra 1 e 200 interrogazioni è fra una pagina che si apre e una che va in timeout.

> Il nome del gestionale non si scrive mai in un'etichetta: si dice «il
> gestionale», e il nome vero arriva dalla configurazione del cliente. Vedi
> `office/_components/sinc-gestionale.tsx`.
