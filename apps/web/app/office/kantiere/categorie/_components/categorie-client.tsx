'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  Merge,
  Pencil,
  Plus,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, Input, cn } from '@kommessa/ui';

import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { categoriaTono } from '@/app/_lib/cantiere-categoria';
import {
  attivaCategoria,
  creaCategoria,
  eliminaCategoria,
  rinominaCategoria,
  smistaValoreEsterno,
  unisciCategorie,
} from '@/app/_actions/categorie-cantiere';
import type { CategoriaRiga, DaSmistareRiga } from '../page';

const SELECT_CLS =
  'h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function CategorieClient({
  categorie,
  daSmistare,
  /** Il collegamento col gestionale locale è acceso per questo cliente. */
  gestionaleAttivo,
}: {
  categorie: CategoriaRiga[];
  daSmistare: DaSmistareRiga[];
  gestionaleAttivo: boolean;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const confirm = useConfirm();
  const [pending, start] = React.useTransition();

  const [nuova, setNuova] = React.useState('');
  const [inModifica, setInModifica] = React.useState<string | null>(null);
  const [bozzaNome, setBozzaNome] = React.useState('');
  const [inUnione, setInUnione] = React.useState<string | null>(null);

  const esegui = (fn: () => Promise<{ ok: boolean; error?: string }>, dopo?: () => void) => {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        await showAlert({ title: 'Non fatto', body: r.error });
        return;
      }
      dopo?.();
      router.refresh();
    });
  };

  const attive = categorie.filter((c) => c.attiva);
  const nascoste = categorie.filter((c) => !c.attiva);

  return (
    <div className="space-y-5">
      {/* ── Da smistare: sta in cima perché è la cosa che chiede una decisione ── */}
      {gestionaleAttivo && daSmistare.length > 0 ? (
        <Card className="border-amber-500/40">
          <CardContent className="space-y-3 py-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">
                  {daSmistare.length === 1
                    ? 'Dal gestionale locale è arrivata una categoria che non conosciamo'
                    : `Dal gestionale locale sono arrivate ${daSmistare.length} categorie che non conosciamo`}
                </h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Non {daSmistare.length === 1 ? 'la aggiungiamo' : 'le aggiungiamo'} da
                  soli, e non è pigrizia: basta un errore di battitura di là e ve lo
                  ritrovate nell’elenco per sempre. Dì tu se{' '}
                  {daSmistare.length === 1 ? 'va' : 'vanno'} su una categoria che avete
                  già, oppure se {daSmistare.length === 1 ? 'è' : 'sono'} roba nuova.
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {daSmistare.map((d) => (
                <li
                  key={d.valoreEsterno}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold">{d.valoreEsterno}</span>
                    {d.cantieri > 0 ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        su {d.cantieri} {d.cantieri === 1 ? 'cantiere' : 'cantieri'}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <select
                      className={SELECT_CLS}
                      defaultValue=""
                      disabled={pending}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        esegui(() =>
                          smistaValoreEsterno({
                            valoreEsterno: d.valoreEsterno,
                            categoriaId: v === '__nuova__' ? null : v,
                          }),
                        );
                      }}
                    >
                      <option value="">Aggancia a…</option>
                      {attive.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                      <option value="__nuova__">
                        ➕ Promuovi «{d.valoreEsterno}» a categoria
                      </option>
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Il registro ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">
                {categorie.length} {categorie.length === 1 ? 'categoria' : 'categorie'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={nuova}
                onChange={(e) => setNuova(e.target.value)}
                placeholder="Nuova categoria"
                className="h-8 max-w-[200px] text-sm"
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || !nuova.trim()) return;
                  e.preventDefault();
                  esegui(() => creaCategoria({ nome: nuova.trim() }), () => setNuova(''));
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={pending || !nuova.trim()}
                onClick={() =>
                  esegui(() => creaCategoria({ nome: nuova.trim() }), () => setNuova(''))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Aggiungi
              </Button>
            </div>
          </div>

          {categorie.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nessuna categoria. Aggiungine una, oppure lasciale nascere dai cantieri.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {[...attive, ...nascoste].map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  {inModifica === c.id ? (
                    <>
                      <Input
                        value={bozzaNome}
                        onChange={(e) => setBozzaNome(e.target.value)}
                        className="h-8 max-w-[240px] text-sm"
                        autoFocus
                        disabled={pending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || !bozzaNome.trim()}
                        onClick={() =>
                          esegui(
                            () => rinominaCategoria({ id: c.id, nome: bozzaNome.trim() }),
                            () => setInModifica(null),
                          )
                        }
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Salva
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setInModifica(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        rinominando, i {c.usata} cantieri che la usano seguono
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          'inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          categoriaTono(c.nome),
                          !c.attiva && 'opacity-50',
                        )}
                      >
                        {c.nome}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {c.usata} {c.usata === 1 ? 'cantiere' : 'cantieri'}
                      </span>
                      {c.origine === 'gestionale' ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-sky-500/30 bg-sky-500/10 px-1.5 py-0 text-[9px] text-sky-700 dark:text-sky-400"
                        >
                          <Cloud className="h-2.5 w-2.5" />
                          dal gestionale
                        </Badge>
                      ) : null}
                      {c.valoriEsterni.length > 0 ? (
                        <span
                          className="font-mono text-[10px] text-muted-foreground"
                          title={`Valori del gestionale agganciati: ${c.valoriEsterni.join(', ')}`}
                        >
                          ← {c.valoriEsterni.join(' · ')}
                        </span>
                      ) : null}
                      {!c.attiva ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                          nascosta
                        </Badge>
                      ) : null}

                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        {inUnione === c.id ? (
                          <>
                            <select
                              className={SELECT_CLS}
                              defaultValue=""
                              disabled={pending}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) return;
                                esegui(
                                  () => unisciCategorie({ daId: c.id, aId: v }),
                                  () => setInUnione(null),
                                );
                              }}
                            >
                              <option value="">Unisci a…</option>
                              {categorie
                                .filter((x) => x.id !== c.id)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.nome}
                                  </option>
                                ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setInUnione(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Rinomina"
                              disabled={pending}
                              onClick={() => {
                                setInModifica(c.id);
                                setBozzaNome(c.nome);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Unisci a un'altra"
                              disabled={pending || categorie.length < 2}
                              onClick={() => setInUnione(c.id)}
                            >
                              <Merge className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title={c.attiva ? 'Nascondi dai menu' : 'Rimetti nei menu'}
                              disabled={pending}
                              onClick={() =>
                                esegui(() => attivaCategoria({ id: c.id, attiva: !c.attiva }))
                              }
                            >
                              {c.attiva ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title={
                                c.usata > 0
                                  ? 'La usano dei cantieri: nascondila o uniscila'
                                  : 'Elimina'
                              }
                              disabled={pending || c.usata > 0}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: `Eliminare «${c.nome}»?`,
                                  description: 'Non la usa nessun cantiere. Si può ricreare.',
                                  confirmLabel: 'Elimina',
                                  destructive: true,
                                });
                                if (!ok) return;
                                esegui(() => eliminaCategoria({ id: c.id }));
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Nascondere toglie una categoria dai menu di scelta ma lascia leggibili i cantieri
            storici che la usano. Eliminare si può solo quando non la usa più nessuno.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
