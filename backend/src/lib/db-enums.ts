// String unions for what used to be Prisma enums. SQLite has no native enum
// type, so the schema stores these as String and this module is the single
// source of truth for the allowed values.

export type ScheduledPostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "POSTING"
  | "POSTED"
  | "FAILED"
  | "CANCELED";

export type PostType = "ORIGINAL" | "REPLY" | "QUOTE" | "REPOST";

export type AutomationStatus =
  | "PENDING"
  | "ACTIVE"
  | "POSTED"
  | "PAUSED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

export type AssistantRole = "USER" | "ASSISTANT" | "SYSTEM";

export type XOperationType = "OWNED_READ" | "EXTERNAL_READ" | "WRITE" | "MEDIA" | "AUTH";
