'use client';

import * as React from 'react';
import { KeyRound, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
} from '@impiantixplus/ui';
import { createBrowserSupabase } from '@impiantixplus/api/client';

export function CambioPasswordForm() {
  const [pwd, setPwd] = React.useState('');
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cambia password
          </h2>
        </div>
        <div>
          <Label htmlFor="np">Nuova password</Label>
          <Input
            id="np"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="mt-1.5 h-10 font-mono"
            minLength={8}
            placeholder="Almeno 8 caratteri"
          />
        </div>
        {msg ? <p className="text-sm text-success">{msg}</p> : null}
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        <div className="flex justify-end">
          <Button
            disabled={pending || pwd.length < 8}
            onClick={() => {
              setMsg(null);
              setErr(null);
              start(async () => {
                const supabase = createBrowserSupabase();
                const { error } = await supabase.auth.updateUser({
                  password: pwd,
                });
                if (error) setErr(error.message);
                else {
                  setMsg('Password aggiornata.');
                  setPwd('');
                }
              });
            }}
          >
            <Save className="h-3.5 w-3.5" />
            Aggiorna
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
