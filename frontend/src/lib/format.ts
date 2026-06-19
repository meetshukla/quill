// X counts text by weighted code points; URLs count as 23, CJK as 2.
// This is a faithful-enough approximation for the composer counter.
const TWEET_LIMIT = 280;
const URL_WEIGHT = 23;
const urlRegex = /https?:\/\/[^\s]+/gi;

export function tweetLength(text: string): number {
  if (!text) return 0;
  let working = text;
  let count = 0;
  const urls = working.match(urlRegex) ?? [];
  for (const url of urls) {
    count += URL_WEIGHT;
    working = working.replace(url, "");
  }
  for (const ch of working) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK, full-width and similar ranges weigh 2.
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    count += isWide ? 2 : 1;
  }
  return count;
}

export const TWEET_MAX = TWEET_LIMIT;

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return "now";
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Accept either a raw numeric tweet id or a full x.com/twitter.com status URL.
export function parseXPostId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/i);
  return match ? match[1] : null;
}

// Convert a <input type="datetime-local"> value (local wall-clock, no tz)
// into an ISO-8601 string with the correct offset for the backend.
export function datetimeLocalToISO(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}
