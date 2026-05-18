'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, KeyRound, Ban, RotateCcw, UserCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
} from '@impiantixplus/ui';
import {
  invitaUtenteTenant,
  resetPasswordUser,
  disattivaUserGlobal,
  attivaUserGlobal,
  cambiaRuoloTenantUser,
} from '../../../_actions/utenti';
import { impersonateUser } from '../../../_actions/tenants';

interface UtenteRow {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
  attivo: boolean;
  created_at: string;
}

const ROLES = ['owner', 'admin', 'office', 'capo', 'tecnico'] as const;

export function TabUtenti({
  tenantId,
  utenti,
}: {
  tenantId: string;
  utenti: UtenteRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [nome, setNome] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<(typeof ROLES)[number]>('tecnico');
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Utenti del tenant ({utenti.length})
          </h2>
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Invita utente
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-2 py-2 font-medium">Nome</th>
                <th className="px-2 py-2 font-medium">Email</th>
                <th className="px-2 py-2 font-medium">Ruolo</th>
                <th className="px-2 py-2 font-medium">Stato</th>
                <th className="px-2 py-2 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {utenti.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nessun utente. Invita il primo dal pulsante in alto.
                  </td>
                </tr>
              ) : (
                utenti.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2 font-medium">{u.display_name ?? '—'}</td>
                    <td className="px-2 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-2 py-2">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          start(async () => {
                            const res = await cambiaRuoloTenantUser(u.id, e.target.value);
                            if (!res.ok) alert(res.error);
                            router.refresh();
                          })
                        }
                        className="h-7 rounded-md border border-border bg-card px-2 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      {u.attivo ? (
                        <Badge variant="outline" className="border-success/30 text-success">
                          Attivo
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Disattivato</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {u.attivo ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={`Impersona ${u.display_name ?? u.email} (JWT shadow)`}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Entrare come ${u.display_name ?? u.email}?\n\nTutte le azioni saranno tracciate in audit a tuo nome.`,
                                )
                              )
                                return;
                              start(async () => {
                                const res = await impersonateUser({
                                  tenantId,
                                  targetUserId: u.id,
                                });
                                if (res && 'ok' in res && !res.ok) alert(res.error);
                              });
                            }}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Invia reset password"
                          onClick={() =>
                            start(async () => {
                              const res = await resetPasswordUser(u.id);
                              if (!res.ok) alert(res.error);
                              else alert('Email reset inviata.');
                            })
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {u.attivo ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Disattiva"
                            onClick={() =>
                              start(async () => {
                                const res = await disattivaUserGlobal(u.id);
                                if (!res.ok) alert(res.error);
                                router.refresh();
                              })
                            }
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Riattiva"
                            onClick={() =>
                              start(async () => {
                                const res = await attivaUserGlobal(u.id);
                                if (!res.ok) alert(res.error);
                                router.refresh();
                              })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invita un nuovo utente</DialogTitle>
              <DialogDescription>
                Riceverà un&apos;email con il link di invito Supabase.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="i_nome">Nome</Label>
                <Input
                  id="i_nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1.5 h-10"
                />
              </div>
              <div>
                <Label htmlFor="i_email">Email</Label>
                <Input
                  id="i_email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 h-10"
                  type="email"
                />
              </div>
              <div>
                <Label htmlFor="i_role">Ruolo</Label>
                <select
                  id="i_role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                  className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {err ? <p className="text-sm text-destructive">{err}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <Button
                disabled={pending || !nome || !email}
                onClick={() => {
                  setErr(null);
                  start(async () => {
                    const res = await invitaUtenteTenant({
                      tenantId,
                      email,
                      displayName: nome,
                      role,
                    });
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    setOpen(false);
                    setNome('');
                    setEmail('');
                    setRole('tecnico');
                    router.refresh();
                  });
                }}
              >
                Invita
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
