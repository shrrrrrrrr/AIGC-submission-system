import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function equalTokenHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase();
}
