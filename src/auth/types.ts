export const ROLES = [
  "participant",
  "reviewer",
  "event_admin",
  "super_admin",
] as const;

export type Role = (typeof ROLES)[number];

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  roles: Role[];
  mfaEnabled: boolean;
  createdAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
};

export type VerificationToken = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type PasswordResetToken = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type AuditEvent = {
  action: string;
  outcome: "success" | "failure";
  requestId: string;
  userId?: string;
  ip?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
};
