import type { AppRole, TenantContext } from '@impiantixplus/api';

export const ROLES_ADMIN: ReadonlyArray<AppRole> = ['owner', 'admin'];

export function canManageTenant(ctx: { role: AppRole }): boolean {
  return ROLES_ADMIN.includes(ctx.role);
}

/**
 * Throw se l'utente non può gestire impostazioni tenant.
 * Usare nelle Server Actions di scrittura.
 */
export function assertCanManageTenant(ctx: TenantContext): void {
  if (!canManageTenant(ctx)) {
    throw new Error(
      'FORBIDDEN: solo gli amministratori del tenant possono eseguire questa operazione.',
    );
  }
}
