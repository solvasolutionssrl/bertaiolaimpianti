'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@impiantixplus/ui';
import { MoreHorizontal, ShieldCheck, UserMinus, UserPlus2, Sliders } from 'lucide-react';
import {
  cambiaRuolo,
  disattivaUtente,
  riattivaUtente,
} from '../_actions/utenti';
import { InviteDialog } from './invite-dialog';
import { PermissionsSheet } from './permissions-sheet';
import type { AppRole } from '@impiantixplus/api';
import type { UserPermissionOverrides } from '@impiantixplus/api/types';

export interface UtenteRow {
  id: string;
  display_name: string | null;
  email: string;
  role: AppRole;
  attivo: boolean;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  permission_overrides: UserPermissionOverrides | null;
}

const ROLE_OPTS: { value: AppRole; label: string; hint?: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'Super-admin del tenant' },
  { value: 'admin', label: 'Admin', hint: 'Gestione operativa' },
  { value: 'office', label: 'Office', hint: 'Ufficio / segreteria' },
  { value: 'capo', label: 'Capo cantiere' },
  { value: 'tecnico', label: 'Tecnico' },
  { value: 'cliente', label: 'Cliente' },
];

const ROLE_VARIANT: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'default',
  office: 'secondary',
  capo: 'secondary',
  tecnico: 'outline',
  cliente: 'outline',
};

function initials(name: string, email: string) {
  const src = name?.trim() || email;
  return (
    src
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
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
  const [pending, start] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);

  const [permSheet, setPermSheet] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    role: AppRole;
    overrides: UserPermissionOverrides | null;
  }>({ open: false, userId: '', userName: '', role: 'tecnico', overrides: null });

  function openPermissions(u: UtenteRow) {
    setPermSheet({
      open: true,
      userId: u.id,
      userName: u.display_name?.trim() || u.email,
      role: u.role,
      overrides: u.permission_overrides,
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {utenti.length === 0
              ? 'Nessun utente nel tenant.'
              : `${utenti.length} utenti, ${utenti.filter((u) => u.attivo).length} attivi.`}
          </p>
          {canEdit ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus2 className="mr-1.5 h-4 w-4" />
              Invita utente
            </Button>
          ) : null}
        </div>

        {utenti.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Ancora nessun utente nel tenant.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="hidden grid-cols-12 gap-3 border-b border-border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
              <div className="col-span-4">Persona</div>
              <div className="col-span-2">Ruolo</div>
              <div className="col-span-2">Stato</div>
              <div className="col-span-2">Ultimo accesso</div>
              <div className="col-span-2 text-right">Azioni</div>
            </div>
            <ul className="divide-y divide-border">
              {utenti.map((u) => {
                const isSelf = u.id === currentUserId;
                const hasOverrides =
                  u.permission_overrides &&
                  Object.keys(u.permission_overrides).length > 0;

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
                          <AvatarImage src={u.avatar_url} alt={u.display_name ?? u.email} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {initials(u.display_name ?? '', u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.display_name?.trim() || u.email}
                          {isSelf ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">(tu)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        {hasOverrides ? (
                          <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-primary">
                            <Sliders className="h-2.5 w-2.5" />
                            permessi custom
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <Badge variant={ROLE_VARIANT[u.role]} className="capitalize">
                        {u.role}
                      </Badge>
                    </div>

                    <div className="md:col-span-2">
                      {u.attivo ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Attivo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                          Disattivato
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground md:col-span-2">
                      {formatDate(u.last_sign_in_at)}
                    </div>

                    <div className="md:col-span-2 md:text-right">
                      {canEdit ? (
                        <div className="flex items-center gap-1 md:justify-end">
                          {/* Quick permissions button */}
                          <button
                            type="button"
                            onClick={() => openPermissions(u)}
                            title="Gestisci permessi avanzati"
                            className={cn(
                              'rounded-lg p-1.5 transition-colors hover:bg-muted',
                              hasOverrides
                                ? 'text-primary hover:text-primary'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                            aria-label={`Permessi di ${u.display_name ?? u.email}`}
                          >
                            <Sliders className="h-4 w-4" />
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={pending}
                                aria-label={`Azioni su ${u.display_name ?? u.email}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Cambia ruolo
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
                                        alert(e instanceof Error ? e.message : 'Errore');
                                      }
                                    })
                                  }
                                >
                                  <span className="capitalize">{r.label}</span>
                                  {r.hint ? (
                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                      {r.hint}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => openPermissions(u)}>
                                <Sliders className="mr-2 h-4 w-4" />
                                Permessi avanzati
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.attivo ? (
                                <DropdownMenuItem
                                  disabled={isSelf}
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    if (!confirm(`Disattivare ${u.display_name ?? u.email}?`)) return;
                                    start(async () => {
                                      try {
                                        await disattivaUtente({ userId: u.id });
                                        router.refresh();
                                      } catch (e) {
                                        alert(e instanceof Error ? e.message : 'Errore');
                                      }
                                    });
                                  }}
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  Disattiva utente
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    start(async () => {
                                      try {
                                        await riattivaUtente({ userId: u.id });
                                        router.refresh();
                                      } catch (e) {
                                        alert(e instanceof Error ? e.message : 'Errore');
                                      }
                                    })
                                  }
                                >
                                  <UserPlus2 className="mr-2 h-4 w-4" />
                                  Riattiva utente
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
          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        ) : null}
      </div>

      {/* Permissions slide-over */}
      <PermissionsSheet
        open={permSheet.open}
        onClose={() => setPermSheet((s) => ({ ...s, open: false }))}
        userId={permSheet.userId}
        userName={permSheet.userName}
        role={permSheet.role}
        overrides={permSheet.overrides}
      />
    </>
  );
}
