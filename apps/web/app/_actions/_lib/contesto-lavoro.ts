import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Per chi è, e dove si va.**
 *
 * Le due domande che si fa chi riceve un avviso sul telefono, e le due cose
 * che l'avviso non diceva. Stanno qui, in un posto solo, perché la risposta
 * non è una lettura ma una **catena di ripieghi**, e tre mittenti che la
 * ricostruiscono ognuno a modo suo è esattamente come nascono le divergenze
 * che poi si passano un pomeriggio a riallineare.
 *
 * ## La catena, e perché è fatta così
 *
 * **Il cliente**: la ragione sociale in anagrafica se c'è (`cliente_id`),
 * altrimenti il nome come è stato detto al telefono (`cliente_testo`). Su una
 * cosa da fare dentro una commessa è il cliente della commessa.
 *
 * **Il posto**: `commessa_todo.indirizzo` se l'ufficio l'ha scritto —
 * ⭐ quel campo è un **override**, non una copia: vuoto significa «quello del
 * cliente», e qui si ripiega lì. Dentro una commessa si ripiega sull'indirizzo
 * del cantiere, che è il posto dove si lavora.
 *
 * ⚠️ **Non solleva mai.** Un avviso che non parte perché non si è riusciti a
 * leggere il nome del cliente è peggio di un avviso senza il nome del cliente.
 * Se qualcosa non si legge, si torna `null` e il testo si compone con quello
 * che c'è.
 */
export interface ContestoLavoro {
  /** Come si chiama chi ha chiamato, o il cliente della commessa. */
  cliente: string | null;
  /** Dove bisogna andare, già pronto da leggere. */
  dove: string | null;
  /** Il codice della commessa, quando il lavoro ne ha una. */
  codiceCommessa: string | null;
}

const VUOTO: ContestoLavoro = { cliente: null, dove: null, codiceCommessa: null };

function pulito(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length > 0 ? t : null;
}

/** Unisce i pezzi di un indirizzo saltando quelli che non ci sono. */
function componiIndirizzo(parti: Array<unknown>): string | null {
  const vive = parti.map(pulito).filter(Boolean) as string[];
  return vive.length > 0 ? vive.join(', ') : null;
}

/** Il contesto di una cosa da fare o di una richiesta al telefono. */
export async function contestoDelTodo(
  supabase: SupabaseClient,
  todoId: string,
): Promise<ContestoLavoro> {
  try {
    const { data } = await supabase
      .from('commessa_todo' as never)
      .select(
        `indirizzo, cliente_testo, commessa_id,
         cliente:clienti!commessa_todo_cliente_id_fkey ( ragione_sociale, indirizzo, citta ),
         commessa:commesse!commessa_todo_commessa_id_fkey (
           codice_interno, cliente_indirizzo_cantiere,
           cliente:clienti ( ragione_sociale, indirizzo, citta )
         )`,
      )
      .eq('id', todoId)
      .maybeSingle();
    if (!data) return VUOTO;

    const r = data as unknown as {
      indirizzo: string | null;
      cliente_testo: string | null;
      commessa_id: string | null;
      cliente: { ragione_sociale: string | null; indirizzo: string | null; citta: string | null } | null;
      commessa: {
        codice_interno: string | null;
        cliente_indirizzo_cantiere: string | null;
        cliente: { ragione_sociale: string | null; indirizzo: string | null; citta: string | null } | null;
      } | null;
    };

    // ⚠️ PostgREST restituisce un array quando la relazione non è univoca:
    // si normalizza qui, una volta, invece che in ogni punto che legge.
    const unoSolo = <T,>(v: T | T[] | null): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : v;
    const cliDiretto = unoSolo(r.cliente);
    const comm = unoSolo(r.commessa);
    const cliComm = comm ? unoSolo(comm.cliente) : null;

    const cliente =
      pulito(cliDiretto?.ragione_sociale) ??
      pulito(r.cliente_testo) ??
      pulito(cliComm?.ragione_sociale);

    const dove =
      pulito(r.indirizzo) ??
      pulito(comm?.cliente_indirizzo_cantiere) ??
      componiIndirizzo([
        cliDiretto?.indirizzo ?? cliComm?.indirizzo,
        cliDiretto?.citta ?? cliComm?.citta,
      ]);

    return { cliente, dove, codiceCommessa: pulito(comm?.codice_interno) };
  } catch {
    return VUOTO;
  }
}

/** Il contesto di una commessa, per l'avviso «sei su questo lavoro». */
export async function contestoDellaCommessa(
  supabase: SupabaseClient,
  commessaId: string,
): Promise<ContestoLavoro> {
  try {
    const { data } = await supabase
      .from('commesse')
      .select(
        'codice_interno, cliente_indirizzo_cantiere, cliente:clienti ( ragione_sociale, indirizzo, citta )',
      )
      .eq('id', commessaId)
      .maybeSingle();
    if (!data) return VUOTO;

    const r = data as unknown as {
      codice_interno: string | null;
      cliente_indirizzo_cantiere: string | null;
      cliente:
        | { ragione_sociale: string | null; indirizzo: string | null; citta: string | null }
        | Array<{ ragione_sociale: string | null; indirizzo: string | null; citta: string | null }>
        | null;
    };
    const cli = Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : r.cliente;

    return {
      cliente: pulito(cli?.ragione_sociale),
      dove:
        pulito(r.cliente_indirizzo_cantiere) ??
        componiIndirizzo([cli?.indirizzo, cli?.citta]),
      codiceCommessa: pulito(r.codice_interno),
    };
  } catch {
    return VUOTO;
  }
}
