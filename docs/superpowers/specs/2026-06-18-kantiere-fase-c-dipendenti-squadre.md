# Design — Fase C: Anagrafica dipendenti + squadre per-commessa

**Versione**: 1.0
**Stato**: Bozza in revisione
**Data**: 2026-06-18
**Dipende da**: Fase A (moduli per tenant) + Fase B (storage R2), sul branch `feat/kantiere-tesserino-digitale`.
**Spec madre**: `docs/superpowers/specs/2026-06-18-kantiere-tesserino-digitale-design.md` (sez. 4.1, 4.2, 7).

## 1. Obiettivo

Aggiungere all'area **office** (desktop), gated dal modulo `kantiere`:
1. **Anagrafica dipendenti** (con login app opzionale) — gestione CRUD.
2. **Squadre per-commessa** — assegnazione dipendenti a una commessa con ruolo (capo/membro) e raggruppamento sotto un capo.

È il primo consumatore di `tenantHasModule('kantiere')` (Fase A) → ne valida il gating. Bertaiola (modulo spento) non vede né la voce di menu né i pannelli.

## 2. Modello dati (riconciliato col design approvato)

> La squadra è **per-commessa**, non un roster globale. Niente tabella `squadre` persistente.

**`dipendenti`** (anagrafica, login opzionale):
`id uuid pk`, `tenant_id`, `user_id uuid null` (FK `users` ON DELETE SET NULL — login opzionale), `nome text not null`, `cognome text not null`, `mansione text`, `codice_interno text`, `badge_qr_token text null` (predisposizione futura QR personale), `stato_attivo bool default true`, `note text`, timestamps.
- Vincolo: `unique (tenant_id, user_id) where user_id is not null` (un account = un dipendente).
- RLS: lettura per ogni utente del tenant; scrittura `admin`/`office`.

**`commessa_squadra`** (raggruppamento dentro la commessa):
`commessa_id` (FK commesse ON DELETE CASCADE), `dipendente_id` (FK dipendenti ON DELETE CASCADE), `tenant_id`, `ruolo_commessa text check in ('capo','membro') default 'membro'`, `capo_dipendente_id uuid null` (FK dipendenti — a chi fa capo dentro questa commessa), `assegnato_da uuid` (FK users), `assegnato_at timestamptz default now()`. **PK (commessa_id, dipendente_id)** → un dipendente al più una volta per commessa.
- RLS: lettura per ogni utente del tenant; scrittura `admin`/`office`.

> **Permesso capo squadra**: in Fase C il "capo" è semplicemente `ruolo_commessa='capo'` su `commessa_squadra` (assegnato dall'ufficio). L'area-permessi granulare `kantiere` (timbra_self/timbra_squadra/approva…) e l'enforcement arrivano in **Fase E** (timbrature), dove servono davvero. Qui niente over-build.

## 3. UI office

- **`/office/kantiere/layout.tsx`** (nuovo): gate `tenantHasModule('kantiere')` (redirect `/office` se off) + ruolo `admin|office`.
- **`/office/kantiere/dipendenti/page.tsx`** (nuovo): lista dipendenti con ricerca; dialog crea/modifica; badge **"Con accesso"** (user_id valorizzato) / **"Solo timbratura"** (user_id null); toggle attivo; elimina (bloccata se referenziato in `commessa_squadra`).
- **Voce di menu "Kantiere → Dipendenti"** nella nav office, **mostrata solo se il modulo è attivo**: il layout office calcola `hasKantiere` e lo passa a `OfficeShellClient`, che include la voce condizionalmente.
- **`squadra-panel.tsx`** (nuovo) nella sidebar della scheda commessa (`/office/commesse/[id]`), **renderizzato solo se modulo attivo**: mostra i membri della squadra raggruppati per capo, con picker per aggiungere dipendenti + impostare ruolo capo/membro. Mirror del pattern `tecnici-panel.tsx`.

## 4. Server actions

- `apps/web/app/office/_actions/dipendenti.ts`: `creaDipendente`, `aggiornaDipendente`, `eliminaDipendente` (guard: non referenziato in `commessa_squadra`). Pattern esistente: `'use server'` + zod + `requireTenantContext` + `createServerSupabase` + `revalidatePath`. Inserire sempre `tenant_id = ctx.tenantId`.
- `apps/web/app/office/_actions/commessa-squadre.ts`: `assegnaDipendenteSquadra` (upsert commessa_squadra con ruolo + capo), `aggiornaRuoloSquadra`, `rimuoviDaSquadra`, `elencaSquadraCommessa`. Mirror di `_actions/commessa-tecnici.ts`.
- Le action verificano `tenantHasModule('kantiere')` (oltre a RLS) e negano se off.

## 5. Punti d'innesto (dall'esplorazione)

| Compito | File |
|---|---|
| Migration tabelle + RLS | nuova `supabase/migrations/2026062*_kantiere_dipendenti_squadre.sql` |
| Nav office (voce condizionale) | `apps/web/app/office/_components/office-shell-client.tsx` (NAV array) + `office/layout.tsx` (passa `hasKantiere`) |
| Layout gating | nuovo `apps/web/app/office/kantiere/layout.tsx` |
| Pagina dipendenti | nuovo `apps/web/app/office/kantiere/dipendenti/page.tsx` + `_components/` |
| Action dipendenti | nuovo `apps/web/app/office/_actions/dipendenti.ts` |
| Pannello squadra | nuovo `apps/web/app/office/commesse/[id]/_components/squadra-panel.tsx` + montaggio in `commessa-sidebar.tsx` (gated) |
| Action squadra | nuovo `apps/web/app/office/_actions/commessa-squadre.ts` |
| UI primitives | `@kommessa/ui` (Card, Button, Dialog, Input, Label, Badge, Select…) |

## 6. Sicurezza / produzione

- Tutto **gated dal modulo** → per Bertaiola (kantiere off) la nav non mostra la voce, le route redirezionano, il pannello squadra non si renderizza. Zero impatto.
- La modifica a `office-shell-client.tsx` e `commessa-sidebar.tsx` (file condivisi con Bertaiola) deve essere **additiva e gated**: per `hasKantiere=false` il comportamento è identico a oggi. Review attenta.
- Migration additiva (due tabelle nuove). Apply cloud = umano.

## 7. Fuori scope Fase C (annotato)

- Enforcement permessi granulari `kantiere` (timbra/approva) → Fase E.
- Creazione "commessa leggera" per FPM (senza AI/voci) → se serve per il test, si crea una commessa con il flusso esistente (il folder-skip della Fase B evita errori Nextcloud); rifinitura eventuale più avanti.
- UI mobile per dipendenti/squadre (la PWA del capo per timbrare la squadra) → Fase E.

## 8. Testing

- Unit (Vitest): eventuale logica pura (es. raggruppamento membri per capo, label "con accesso/solo timbratura"). Estrarre in helper puro se non banale.
- Verifica: typecheck + build verdi. CRUD e gating provati manualmente al deploy di prova (creazione FPM + dipendenti).

## 9. Checkpoint test (dopo Fase C)

Applicare al cloud le migration A (`tenant_modules`), B (`storage_r2_mode`), C (dipendenti+squadre). Creare FPM dal wizard (R2, crea_cartelle off, Kantiere on). Login come admin FPM → verificare: voce menu Kantiere presente (e assente per Bertaiola), CRUD dipendenti, badge con-accesso/solo-timbratura, (se c'è una commessa) pannello squadra.
