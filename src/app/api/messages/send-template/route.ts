import { ObjectId } from "mongodb";
import { z } from "zod";

import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDoc } from "@/lib/serializers";
import { normalizePhone, sendTemplate } from "@/lib/whatsapp";

const schema = z.object({
  to: z.string().min(8),
  templateName: z.string().min(1),
  language: z.string().min(2).default("en_US"),
  parameters: z.record(z.string()).default({}),
  parameterOrder: z.array(z.string()).default([]),
  parameterFormat: z.enum(["NAMED", "POSITIONAL"]).optional(),
  headerImageId: z.string().optional(),
  contactName: z.string().optional()
});

function extractErrorMessage(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    result.error &&
    typeof result.error === "object" &&
    "message" in result.error
  ) {
    return String((result.error as { message?: unknown }).message);
  }
  return "Template message could not be sent";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ ok: false, error: "Invalid template message" }, { status: 422 });
    }

    const db = await getDb();
    const now = new Date();
    const to = normalizePhone(parsed.data.to);
    const contact = await db
      .collection("contacts")
      .findOne({ phone: to }, { projection: { name: 1 } });

    let response: Awaited<ReturnType<typeof sendTemplate>>;
    try {
      response = await sendTemplate({
        to,
        templateName: parsed.data.templateName,
        language: parsed.data.language,
        parameters: parsed.data.parameters,
        parameterOrder: parsed.data.parameterOrder,
        parameterFormat: parsed.data.parameterFormat,
        headerImageId: parsed.data.headerImageId
      });
    } catch (err) {
      response = {
        ok: false,
        status: 0,
        result: {
          error: {
            message: err instanceof Error ? err.message : "Meta request failed"
          }
        }
      };
    }

    const result = response.result as {
      messages?: Array<{ id?: string; message_status?: string }>;
      error?: unknown;
    };
    const metaMessage = result.messages?.[0];
    const messageId = metaMessage?.id || `local_${new ObjectId().toString()}`;
    const lastStatus = response.ok
      ? metaMessage?.message_status || "accepted"
      : "failed";
    const errorMessage = response.ok ? undefined : extractErrorMessage(result);

    await db.collection("whatsapp_messages").updateOne(
      { messageId },
      {
        $setOnInsert: {
          messageId,
          direction: "outbound",
          from: process.env.WHATSAPP_PHONE_NUMBER_ID,
          to,
          contactName: contact?.name || parsed.data.contactName,
          type: "template",
          templateName: parsed.data.templateName,
          text: parsed.data.templateName,
          payload: {
            source: "inbox",
            templateName: parsed.data.templateName,
            language: parsed.data.language,
            parameters: parsed.data.parameters,
            metaStatus: response.status,
            metaResponse: response.result
          },
          createdBy: user._id,
          createdAt: now
        },
        $set: {
          lastStatus,
          errors: response.ok ? [] : [result.error || response.result],
          updatedAt: now
        }
      },
      { upsert: true }
    );

    const stored = await db.collection("whatsapp_messages").findOne({ messageId });

    return json({
      ok: response.ok,
      error: errorMessage,
      message: stored ? serializeDoc(stored) : undefined
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
