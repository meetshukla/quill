import { z } from "zod";

const cursorSchema = z.object({
  capturedAt: z.string().datetime(),
  id: z.string().uuid()
});

export type ResearchCursor = z.infer<typeof cursorSchema>;

export function encodeResearchCursor(value: ResearchCursor) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeResearchCursor(value: string): ResearchCursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new Error("invalid_research_cursor");
  }
}
