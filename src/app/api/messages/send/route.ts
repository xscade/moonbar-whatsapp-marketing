import { ObjectId } from "mongodb";
import { z } from "zod";

import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDoc } from "@/lib/serializers";
import { normalizePhone, sendText } from "@/lib/whatsapp";

const sendMessageSchema = z.object({
  to: z.string().min(8),
  text: z.string().trim().min(1).max(4096),
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
    return String(result.error.message);
  }
  return "Message could not be sent";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = sendMessageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json(
        {
          ok: false,
          error: "Enter a valid WhatsApp number and message"
        },
        { status: 422 }
      );
    }

    const db = await getDb();
    const now = new Date();
    const to = normalizePhone(parsed.data.to);
    const contact = await db.collection("contacts").findOne(
      { phone: to },
      { projection: { name: 1 } }
    );

    let response: Awaited<ReturnType<typeof sendText>>;
    try {
      response = await sendText(to, parsed.data.text);
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
      ? metaMessage?.message_status || "sent"
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
          type: "text",
          text: parsed.data.text,
          payload: {
            source: "inbox",
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
