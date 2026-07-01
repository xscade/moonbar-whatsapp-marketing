import { z } from "zod";

export const buttonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"]),
  text: z.string().default(""),
  url: z.string().optional(),
  phoneNumber: z.string().optional(),
  example: z.string().optional()
});

// Shared builder payload schema (create + edit).
export const builderSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, "Use only lowercase letters, numbers and underscores"),
  language: z.string().min(2).default("en_US"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  headerType: z.enum(["none", "text", "image", "video", "document"]).default("none"),
  headerText: z.string().max(60).optional(),
  headerHandle: z.string().optional(),
  headerFilename: z.string().optional(),
  body: z.string().min(1).max(1024),
  samples: z.record(z.string()).optional(),
  footer: z.string().max(60).optional(),
  buttons: z.array(buttonSchema).max(10).optional()
});

export type BuilderPayload = z.infer<typeof builderSchema>;

export function metaErrorMessage(
  body: Record<string, unknown> | undefined,
  fallback: string
) {
  const err = (body?.error ?? {}) as Record<string, unknown>;
  return (
    (err.error_user_msg as string) ||
    (err.error_user_title as string) ||
    (err.message as string) ||
    fallback
  );
}
