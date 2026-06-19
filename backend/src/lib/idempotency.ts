import { createHash } from "node:crypto";
import { nanoid } from "nanoid";

export function makeIdempotencyKey(parts: Array<string | number | Date | null | undefined>): string {
  const stable = parts
    .map((part) => (part instanceof Date ? part.toISOString() : String(part ?? "")))
    .join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function randomIdempotencySeed(prefix: string): string {
  return `${prefix}_${nanoid(24)}`;
}

