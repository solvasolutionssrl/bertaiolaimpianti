# `admin/_lib/integrazione` — il lato piattaforma

| File | Cosa fa |
|---|---|
| `config.ts` | legge `tenant_modules.config` del modulo integrazione, in **un posto solo** |
| `foto.ts` | misura lo stato di un collegamento (silenzio, errori, ritardo, abbinamenti) |

`config.ts` è deliberatamente fuori dal file di server action: la `'use server'`
può esportare solo funzioni async, e questa la usano anche i Server Component.
Decide una cosa sola ma importante — cosa significa una chiave assente o storta.
La risposta è **sempre il valore prudente**: senza `modalita` valida si è in
simulazione, cioè non si scrive niente da nessuna parte.

`foto.ts` **misura e basta**: il giudizio (ok / attenzione / guasto) sta in
`@kommessa/api/integrazione-salute`, che è puro e testato. Lo usano il tab del
cliente, la console di piattaforma e il cron delle mail: se ognuno si calcolasse
i propri numeri, prima o poi la pagina direbbe «tutto a posto» mentre parte un
avviso di guasto.
