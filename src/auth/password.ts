import { hash, verify } from "@node-rs/argon2";

const ARGON2ID_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  type: 2,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2ID_OPTIONS);
  } catch {
    return false;
  }
}
