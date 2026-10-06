'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@kommessa/ui';
import {
  HardHat,
  KeyRound,
  MoreHorizontal,
  ShieldCheck,
  UserMinus,
  UserPlus2,
} from 'lucide-react';
import type { AppRole } from '@kommessa/api';
import { CAPACITA_META, haCapacita } from '@kommessa/api/capacita';
import { etichettaAccesso, etichettaRuolo } from '@kommessa/api/identita';

import { reimpostaAccesso } from '@/app/_actions/account';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';
import { cambiaRuolo, disattivaUtente, riattivaUtente } from '../_actions/utenti';
import { salvaPotere } from '../_actions/permissions';
import { CreaAccessoDialog } from './crea-accesso-dialog';
import { RigaCredenziale, useCopia } from './riga-credenziale';

export interface UtenteRow {
  id: string;
  display_name: string | null;
  email: string;
  role: AppRole;
  attivo: boolean;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  /** `users.permissions`: i poteri in più di quelli del ruolo. */
  permissions: unknown;
  /** Se è ancora sulla password consegnata dall'ufficio. */
  must_change_password: boolean;
}

const ROLE_OPTS: { value: AppRole; label: string; hint?: string }[] = [
  { value: 'admin', label: 'Amministratore', hint: 'Tutto, comprese le impostazioni' },
  { value: 'office', label: 'Ufficio', hint: 'Gestisce i lavori dal computer' },
  { value: 'tecnico', label: 'Tecnico', hint: 'Lavora in cantiere, usa il telefono' },
];


const ROLE_VARIANT: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  office: 'secondary',
  tecnico: 'outline',
  cliente: 'outline',
};

function iniziali(nome: string, accesso: string) {
  const src = nome?.trim() || accesso;
  return (
    src
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function quando(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function UtentiTable({
  utenti,
  canEdit,
  currentUserId,
}: {
  utenti: UtenteRow[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const chiedi = useConfirm();
  const avvisa = useAlert();
  const [pending, start] = React.useTransition();
  const [creaAperto, setCreaAperto] = React.useState(false);
  const { copiato, copia } = useCopia();

  /** La password appena rigenerata: si vede una volta sola. */
  const [nuovaPassword, setNuovaPassword] = React.useState<{
    nome: string;
    username: string | null;
    password: string;
  } | null>(null);

  async function cambiaPotere(u: UtenteRow, acceso: boolean) {
    const r = await salvaPotere({ userId: u.id, capacita: 'capo_squadra', acceso });
    if (!r.ok) {
      await avvisa({ title: 'Non modificato', body: r.error });
      return;
    }
    router.refresh();
  }

  async function reimposta(u: UtenteRow) {
    const ok = await chiedi({
      title: `Dare una password nuova a ${u.display_name ?? etichettaAccesso(u.email)}?`,
      description:
        'La password di adesso smette di funzionare subito. Te ne diamo una nuova da dettare, che la persona dovrà cambiare al primo accesso.',
      confirmLabel: 'Genera',
    });
    if (!ok) return;
    start(async () => {
      const r = await reimpostaAccesso({ userId: u.id });
      if (!r.ok) {
        await avvisa({ title: 'Non riuscito', body: r.error });
        return;
      }
      setNuovaPassword({
        nome: u.display_name ?? etichettaAccesso(u.email),
        username: r.data.username,
        password: r.data.password,
      });
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {utenti.length === 0
              ? 'Nessuna persona in questo spazio di lavoro.'
              : `${utenti.length} persone, ${utenti.filter((u) => u.attivo).length} attive.`}
          </p>
          {canEdit ? (
            <Button size="sm" onClick={() => setCreaAperto(true)}>
              <UserPlus2 className="mr-1.5 h-4 w-4" />
              Nuovo accesso
            </Button>
          ) : null}
        </div>

        {utenti.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Ancora nessuna persona.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="hidden grid-cols-12 gap-3 border-b border-border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <div className="col-span-4">Persona</div>
              <div className="col-span-2">Ruolo</div>
              <div className="col-span-2">Accesso</div>
              <div className="col-span-2">Ultima volta</div>
              <div className="col-span-2 text-right">Azioni</div>
            </div>
            <ul className="divide-y divide-border">
              {utenti.map((u) => {
                const sonoIo = u.id === currentUserId;
                const accesso = etichettaAccesso(u.email);
                const eCapo = haCapacita({ role: u.role, permissions: u.permissions }, 'capo_squadra');
                // Il distintivo si mostra solo dove è una scelta: su un
                // amministratore sarebbe rumore, ce l'ha per mestiere.
                const mostraDistintivoCapo = u.role === 'tecnico' && eCapo;

                return (
                  <li
                    key={u.id}
                    className={cn(
                      'grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-12 md:items-center',
                      !u.attivo && 'opacity-60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3 md:col-span-4">
                      <Avatar className="h-9 w-9 shrink-0">
                        {u.avatar_url ? (
                          <AvatarImage src={u.avatar_url} alt={u.display_name ?? accesso} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {iniziali(u.display_name ?? '', accesso)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.display_name?.trim() || accesso}
                          {sonoIo ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>
                          ) : null}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{accesso}</p>
                        {mostraDistintivoCapo ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            <HardHat className="h-2.5 w-2.5" />
                            {CAPACITA_META.capo_squadra.etichetta}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <Badge variant={ROLE_VARIANT[u.role]}>{etichettaRuolo(u.role)}</Badge>
                    </div>

                    <div className="md:col-span-2">
                      <StatoAccesso
                        attivo={u.attivo}
                        devoCambiare={u.must_change_password}
                        invitoMandato={u.invite_sent_at}
                        invitoAccettato={u.invite_accepted_at}
                        maiEntrato={u.last_sign_in_at === null}
                      />
                    </div>

                    <div className="text-xs text-muted-foreground md:col-span-2">
                      {quando(u.last_sign_in_at)}
                    </div>

                    <div className="md:col-span-2 md:text-right">
                      {canEdit ? (
                        <div className="flex items-center gap-1 md:justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={pending}
                                aria-label={`Azioni su ${u.display_name ?? accesso}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Che lavoro fa
                              </DropdownMenuLabel>
                              {ROLE_OPTS.map((r) => (
                                <DropdownMenuItem
                                  key={r.value}
                                  disabled={u.role === r.value}
                                  onSelect={() =>
                                    start(async () => {
                                      try {
                                        await cambiaRuolo({ userId: u.id, role: r.value });
                                        router.refresh();
                                      } catch (e) {
                                        await avvisa({
                                          title: 'Non modificato',
                                          body: e instanceof Error ? e.message : 'Errore',
                                        });
                                      }
                                    })
                                  }
                                >
                                  <span>{r.label}</span>
                                  {r.hint ? (
                                    <span className="ml-auto pl-3 text-[10px] text-muted-foreground">
                                      {r.hint}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              ))}

                              {/* Il potere in più. Solo per i tecnici: all'ufficio
                                  e agli amministratori è già compreso. */}
                              {u.role === 'tecnico' ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => start(() => cambiaPotere(u, !eCapo))}
                                  >
                                    <HardHat className="mr-2 h-4 w-4" />
                                    {eCapo ? 'Togli capo squadra' : 'Rendi capo squadra'}
                                    <span className="ml-auto pl-3 text-[10px] text-muted-foreground">
                                      {eCapo ? 'può aprire lavori' : 'non può aprire lavori'}
                                    </span>
                                  </DropdownMenuItem>
                                </>
                              ) : null}

                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => void reimposta(u)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Password nuova
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />
                              {u.attivo ? (
                                <DropdownMenuItem
                                  disabled={sonoIo}
                                  className="text-destructive focus:text-destructive"
                                  onSelect={async () => {
                                    const ok = await chiedi({
                                      title: `Chiudere l’accesso a ${u.display_name ?? accesso}?`,
                                      description:
                                        'Non entrerà più. Il lavoro che ha fatto resta tutto: foto, cose fatte, storico.',
                                      destructive: true,
                                    });
                                    if (!ok) return;
                                    start(async () => {
                                      try {
                                        await disattivaUtente({ userId: u.id });
                                        router.refresh();
                                      } catch (e) {
                                        await avvisa({
                                          title: 'Non modificato',
                                          body: e instanceof Error ? e.message : 'Errore',
                                        });
                                      }
                                    });
                                  }}
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Chiudi l’accesso
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    start(async () => {
                                      try {
                                        await riattivaUtente({ userId: u.id });
                                        router.refresh();
                                      } catch (e) {
                                        await avvisa({
                                          title: 'Non modificato',
                                          body: e instanceof Error ? e.message : 'Errore',
                                        });
                                      }
                                    })
                                  }
                                >
                                  <UserPlus2 className="mr-2 h-4 w-4" />
                                  Riapri l’accesso
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {canEdit ? (
          <CreaAccessoDialog open={creaAperto} onOpenChange={setCreaAperto} />
        ) : null}
      </div>

      {/* La password rigenerata: si vede una volta sola. */}
      <Dialog
        open={nuovaPassword !== null}
        onOpenChange={(v) => {
          if (!v) setNuovaPassword(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password nuova per {nuovaPassword?.nome}</DialogTitle>
            <DialogDescription>
              Dettala adesso: non si rivede più. Al primo accesso l&apos;app chiederà
              di scegliersene una sua.
            </DialogDescription>
          </DialogHeader>
          {nuovaPassword ? (
            <div className="space-y-2">
              {nuovaPassword.username ? (
                <RigaCredenziale
                  etichetta="Utente"
                  valore={nuovaPassword.username}
                  chiave="r-ut"
                  copiato={copiato}
                  onCopia={copia}
                />
              ) : null}
              <RigaCredenziale
                etichetta="Password"
                valore={nuovaPassword.password}
                chiave="r-pw"
                copiato={copiato}
                onCopia={copia}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setNuovaPassword(null)}>
              Ho annotato, chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * In che stato è l'accesso di una persona.
 *
 * Quattro situazioni che prima erano tre, e la quarta è quella che serve
 * davvero domani: **«ha la password dell'ufficio»**. Senza questa riga non
 * c'era modo di sapere chi fra venti tecnici non è ancora entrato per la prima
 * volta.
 */
function StatoAccesso({
  attivo,
  devoCambiare,
  invitoMandato,
  invitoAccettato,
  maiEntrato,
}: {
  attivo: boolean;
  devoCambiare: boolean;
  invitoMandato: string | null;
  invitoAccettato: string | null;
  maiEntrato: boolean;
}) {
  if (!attivo) return <Pallino colore="bg-muted-foreground/50" testo="Chiuso" />;
  if (devoCambiare) {
    return (
      <Pallino
        colore="bg-amber-500"
        testo={maiEntrato ? 'Password da consegnare' : 'Deve scegliere la password'}
        forte="text-amber-700 dark:text-amber-400"
      />
    );
  }
  if (invitoAccettato || !maiEntrato) {
    return <Pallino colore="bg-emerald-500" testo="Attivo" forte="text-emerald-700 dark:text-emerald-400" />;
  }
  if (invitoMandato) {
    return <Pallino colore="bg-sky-500" testo="Invito mandato" forte="text-sky-700 dark:text-sky-400" />;
  }
  return <Pallino colore="bg-border" testo="Mai entrato" />;
}

function Pallino({
  colore,
  testo,
  forte,
}: {
  colore: string;
  testo: string;
  forte?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        forte ? `font-medium ${forte}` : 'text-muted-foreground',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', colore)} />
      {testo}
    </span>
  );
}
