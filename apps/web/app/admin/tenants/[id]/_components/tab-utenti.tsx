'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@kommessa/ui';
import {
  attivaUserGlobal,
  cambiaRuoloTenantUser,
  creaUtenteManuale,
  disattivaUserGlobal,
  eliminaUserGlobal,
  impostaPasswordManuale,
  invitaUtenteTenant,
  resetPasswordUser,
} from '../../../_actions/utenti';
import { impersonateUser } from '../../../_actions/tenants';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

interface UtenteRow {
  id: string;
  display_name: string | null;
  email: string;
  role: string;
  attivo: boolean;
  created_at: string;
}

const ROLES = ['admin', 'office', 'tecnico'] as const;

export function TabUtenti({
  tenantId,
  utenti,
}: {
  tenantId: string;
  utenti: UtenteRow[];
}) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [open, setOpen] = React.useState(false);
  const [openManual, setOpenManual] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [nome, setNome] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<(typeof ROLES)[number]>('tecnico');
  const [err, setErr] = React.useState<string | null>(null);

  // Manual create state
  const [manualUsername, setManualUsername] = React.useState('');
  const [manualDisplayName, setManualDisplayName] = React.useState('');
  const [manualRole, setManualRole] = React.useState<(typeof ROLES)[number]>('tecnico');
  const [manualPassword, setManualPassword] = React.useState('');
  const [manualErr, setManualErr] = React.useState<string | null>(null);
  const [manualResult, setManualResult] = React.useState<
    | { loginEmail: string; password: string }
    | null
  >(null);

  // Set password manual state
  const [pwUser, setPwUser] = React.useState<UtenteRow | null>(null);
  const [pwValue, setPwValue] = React.useState('');
  const [pwErr, setPwErr] = React.useState<string | null>(null);
  const [pwResult, setPwResult] = React.useState<string | null>(null);

  function resetManualForm() {
    setManualUsername('');
    setManualDisplayName('');
    setManualRole('tecnico');
    setManualPassword('');
    setManualErr(null);
    setManualResult(null);
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Utenti del tenant ({utenti.length})
          </h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenManual(true)}
              title="Crea utente con username + password manuale, senza email di invito"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Crea manuale
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Invita via email
            </Button>
          </div>
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
                            if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
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
                            onClick={async () => {
                              if (
                                !(await askConfirm({
                                  title: `Entrare come ${u.display_name ?? u.email}?`,
                                  description: 'Tutte le azioni saranno tracciate in audit a tuo nome.',
                                }))
                              )
                                return;
                              start(async () => {
                                const res = await impersonateUser({
                                  tenantId,
                                  targetUserId: u.id,
                                });
                                if (res && 'ok' in res && !res.ok) await showAlert({ title: 'Errore', body: res.error });
                              });
                            }}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Gestisci password"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuItem
                              onSelect={() => {
                                setPwUser(u);
                                setPwValue(generaPassword());
                                setPwErr(null);
                                setPwResult(null);
                              }}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Imposta password manuale
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                start(async () => {
                                  const res = await resetPasswordUser(u.id);
                                  if (!res.ok)
                                    await showAlert({ title: 'Errore', body: res.error });
                                  else
                                    await showAlert({
                                      title: 'Email inviata',
                                      body: 'Email reset inviata.',
                                    });
                                })
                              }
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Invia link reset via email
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {u.attivo ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Disattiva"
                            onClick={() =>
                              start(async () => {
                                const res = await disattivaUserGlobal(u.id);
                                if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
                                router.refresh();
                              })
                            }
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Riattiva"
                              onClick={() =>
                                start(async () => {
                                  const res = await attivaUserGlobal(u.id);
                                  if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
                                  router.refresh();
                                })
                              }
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="Elimina definitivamente"
                              onClick={async () => {
                                const ok = await askConfirm({
                                  title: `Eliminare ${u.display_name ?? u.email}?`,
                                  description:
                                    'Operazione irreversibile. L\'utente verrà rimosso dal sistema di autenticazione e dalla tabella utenti. Lo storico (commesse, foto, TODO) resta ma con autore = "—". Da fare solo per utenti creati per errore o dipendenti usciti.',
                                  destructive: true,
                                  confirmLabel: 'Elimina definitivamente',
                                });
                                if (!ok) return;
                                start(async () => {
                                  const res = await eliminaUserGlobal(u.id);
                                  if (!res.ok)
                                    await showAlert({ title: 'Errore', body: res.error });
                                  router.refresh();
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
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

        {/* ─── DIALOG: crea utente manuale (no email) ─────────────────── */}
        <Dialog
          open={openManual}
          onOpenChange={(o) => {
            if (!o) {
              setOpenManual(false);
              resetManualForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crea utente manuale</DialogTitle>
              <DialogDescription>
                Nessuna email di invito. Username + password sono assegnati da
                te e consegnati al cliente fuori canale.
              </DialogDescription>
            </DialogHeader>

            {manualResult ? (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" />
                    Utente creato. Consegna queste credenziali al cliente:
                  </p>
                </div>
                <CredField label="Login (email)" value={manualResult.loginEmail} />
                <CredField label="Password" value={manualResult.password} mono />
                <p className="text-[11px] text-muted-foreground">
                  L&apos;email è un identificatore sintetico:{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                    .kommessa.local
                  </code>{' '}
                  non viene mai consegnato a un server SMTP — è solo l&apos;ID di
                  login. Scrivila identica nella pagina di accesso.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="m_dn">Nome visualizzato *</Label>
                  <Input
                    id="m_dn"
                    value={manualDisplayName}
                    onChange={(e) => {
                      setManualDisplayName(e.target.value);
                      // Auto-popola username dal nome se è vuoto
                      if (!manualUsername) {
                        setManualUsername(slugifyUsername(e.target.value));
                      }
                    }}
                    placeholder="Es. Mario Rossi"
                    className="mt-1.5 h-10"
                  />
                </div>
                <div>
                  <Label htmlFor="m_user">Username login *</Label>
                  <Input
                    id="m_user"
                    value={manualUsername}
                    onChange={(e) =>
                      setManualUsername(
                        e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
                      )
                    }
                    placeholder="mario"
                    className="mt-1.5 h-10 font-mono"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Minuscolo, lettere/numeri/&quot;.&quot;/&quot;-&quot;/&quot;_&quot;. L&apos;utente
                    digiterà al login l&apos;email completa che verrà generata da
                    questo username.
                  </p>
                </div>
                <div>
                  <Label htmlFor="m_role">Ruolo *</Label>
                  <select
                    id="m_role"
                    value={manualRole}
                    onChange={(e) =>
                      setManualRole(e.target.value as (typeof ROLES)[number])
                    }
                    className="mt-1.5 h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="m_pw">Password *</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="m_pw"
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                      type="text"
                      className="h-10 flex-1 font-mono"
                      placeholder="min 8 caratteri"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setManualPassword(generaPassword())}
                      title="Genera password sicura"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Auto
                    </Button>
                  </div>
                </div>
                {manualErr ? (
                  <p className="text-sm text-destructive">{manualErr}</p>
                ) : null}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {manualResult ? (
                <Button
                  onClick={() => {
                    setOpenManual(false);
                    resetManualForm();
                    router.refresh();
                  }}
                >
                  Fatto
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setOpenManual(false);
                      resetManualForm();
                    }}
                  >
                    Annulla
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => {
                      setManualErr(null);
                      start(async () => {
                        const res = await creaUtenteManuale({
                          tenantId,
                          username: manualUsername,
                          displayName: manualDisplayName,
                          role: manualRole,
                          password: manualPassword,
                        });
                        if (!res.ok) {
                          setManualErr(res.error);
                          return;
                        }
                        setManualResult({
                          loginEmail: res.loginEmail,
                          password: res.password,
                        });
                      });
                    }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Crea utente
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── DIALOG: imposta password manuale ───────────────────────── */}
        <Dialog
          open={pwUser !== null}
          onOpenChange={(o) => {
            if (!o) {
              setPwUser(null);
              setPwValue('');
              setPwErr(null);
              setPwResult(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Imposta password manuale</DialogTitle>
              <DialogDescription>
                {pwUser
                  ? `${pwUser.display_name ?? pwUser.email}. La password viene cambiata immediatamente — niente email.`
                  : ''}
              </DialogDescription>
            </DialogHeader>

            {pwResult ? (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" />
                    Password aggiornata. Consegnala al cliente:
                  </p>
                </div>
                {pwUser ? (
                  <CredField label="Login" value={pwUser.email} />
                ) : null}
                <CredField label="Nuova password" value={pwResult} mono />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="pw_value">Nuova password</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input
                      id="pw_value"
                      value={pwValue}
                      onChange={(e) => setPwValue(e.target.value)}
                      type="text"
                      className="h-10 flex-1 font-mono"
                      placeholder="min 8 caratteri"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPwValue(generaPassword())}
                      title="Genera password sicura"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Auto
                    </Button>
                  </div>
                </div>
                {pwErr ? <p className="text-sm text-destructive">{pwErr}</p> : null}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {pwResult ? (
                <Button
                  onClick={() => {
                    setPwUser(null);
                    setPwValue('');
                    setPwResult(null);
                  }}
                >
                  Fatto
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setPwUser(null)}>
                    Annulla
                  </Button>
                  <Button
                    disabled={pending || !pwUser}
                    onClick={() => {
                      if (!pwUser) return;
                      setPwErr(null);
                      start(async () => {
                        const res = await impostaPasswordManuale({
                          userId: pwUser.id,
                          password: pwValue,
                        });
                        if (!res.ok) {
                          setPwErr(res.error);
                          return;
                        }
                        setPwResult(res.password);
                      });
                    }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Imposta
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function CredField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1 flex items-center gap-2">
        <code
          className={
            'flex-1 select-all rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm ' +
            (mono ? 'font-mono' : '')
          }
        >
          {value}
        </code>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          aria-label="Copia"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function slugifyUsername(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 40);
}

function generaPassword(len = 14): string {
  // Crittograficamente sicura. Caratteri inequivoci (no 0/O, 1/l/I).
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[arr[i]! % alphabet.length];
  return out;
}
