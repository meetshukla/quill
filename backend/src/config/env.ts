import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY_BASE64: z.string().min(32),
  DEFAULT_USER_EMAIL: z.string().email().default("owner@example.com"),
  DEFAULT_USER_NAME: z.string().default("Owner"),
  // X app credentials are optional in env — the UI setup flow stores them in
  // the database (encrypted). Env values act as a fallback.
  X_CLIENT_ID: z.string().optional().default(""),
  X_CLIENT_SECRET: z.string().optional().default(""),
  X_CALLBACK_URL: z.string().optional().default(""),
  X_SCOPES: z.string().default("tweet.read users.read tweet.write media.write offline.access"),
  // NOTE: z.coerce.boolean() turns the string "false" into `true` (any non-empty
  // string is truthy). Parse the literal instead so analytics stays off by default.
  ANALYTICS_ENABLED: z
    .string()
    .default("false")
    .transform((value) => /^true$/i.test(value.trim())),
  ANALYTICS_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  ANALYTICS_MAX_POSTS: z.coerce.number().int().positive().default(500),
  ANALYTICS_REFRESH_LAST_24H_HOURS: z.coerce.number().int().positive().default(3),
  ANALYTICS_REFRESH_DAYS_2_TO_7_HOURS: z.coerce.number().int().positive().default(12),
  MONTHLY_OWNED_READ_BUDGET: z.coerce.number().int().nonnegative().default(10000),
  DAILY_OWNED_READ_SOFT_LIMIT: z.coerce.number().int().nonnegative().default(300),
  DAILY_OWNED_READ_HARD_LIMIT: z.coerce.number().int().nonnegative().default(500),
  AI_PROVIDER: z.string().default("none"),
  AI_API_KEY: z.string().optional().default(""),
  // When set, every /api request must send `Authorization: Bearer <key>`
  // (except health + the OAuth callback). Leave empty for open local dev.
  API_KEY: z.string().optional().default("")
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const xScopes = env.X_SCOPES.split(/\s+/).filter(Boolean);
