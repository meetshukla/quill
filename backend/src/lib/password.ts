import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt-based password hashing — no external dependencies for personal accounts.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("base64")}.${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltRaw, hashRaw] = stored.split(".");
  if (!saltRaw || !hashRaw) return false;
  const salt = Buffer.from(saltRaw, "base64");
  const expected = Buffer.from(hashRaw, "base64");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}
