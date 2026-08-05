/** Roles allowed to use admin password reset flows */
export const ADMIN_RESET_ROLES = ["admin", "editor", "super-admin"] as const;

export type AdminResetRole = (typeof ADMIN_RESET_ROLES)[number];

export function isAdminResetRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return (ADMIN_RESET_ROLES as readonly string[]).includes(role);
}
