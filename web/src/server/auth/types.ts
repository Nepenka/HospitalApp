export const roles = ["platform_admin", "organization_owner", "billing_admin", "clinician"] as const;
export type UserRole = (typeof roles)[number];
export interface SessionUser { id: string; role: UserRole; organizationId: string | null; displayName: string; mustChangePassword: boolean }
export interface SessionPayload { user: SessionUser; sessionId: string; issuedAt: number; expiresAt: number }
