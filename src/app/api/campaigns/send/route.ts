import { z } from "zod";
import { ObjectId } from "mongodb";
import { error, handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { sendTemplate } from "@/lib/whatsapp";

const sendSchema = z.object({
  name: z.string().min(1),
  templateName: z.string().min(1),
  language: z.string().min(2),
  parameters: z.record(z.string()),
  parameterOrder: z.array(z.string()).default([]),
  listIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([])
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return error("Invalid campaign payload", 422, parsed.error.flatten());

    const db = await getDb();
    const recipientFilter: Record<string, unknown> = {
      consentStatus: "subscribed"
    };

    if (parsed.data.contactIds.length || parsed.data.listIds.length) {
      recipientFilter.$or = [];
      if (parsed.data.contactIds.length) {
        (recipientFilter.$or as unknown[]).push({
          _id: {
            $in: parsed.data.contactIds
              .filter(ObjectId.isValid)
              .map((id) => new ObjectId(id))
          }
        });
      }
      if (parsed.data.listIds.length) {
        (recipientFilter.$or as unknown[]).push({
          listIds: { $in: parsed.data.listIds }
        });
      }
    }

    const contacts = await db
      .collection("contacts")
      .find(recipientFilter)
      .limit(1000)
      .toArray();

    if (!contacts.length) return error("No subscribed recipients selected", 422);

    const now = new Date();
    const campaignResult = await db.collection("campaigns").insertOne({
      name: parsed.data.name,
      templateName: parsed.data.templateName,
      language: parsed.data.language,
      parameters: parsed.data.parameters,
      listIds: parsed.data.listIds,
      recipients: contacts.map((contact) => ({
        contactId: contact._id.toString(),
        name: contact.name,
        phone: contact.phone,
        status: "queued"
      })),
      status: "sending",
      acceptedCount: 0,
      failedCount: 0,
      createdBy: user._id,
      createdAt: now
    });

    const recipients = [];
    for (const contact of contacts) {
      const response = await sendTemplate({
        to: contact.phone,
        templateName: parsed.data.templateName,
        language: parsed.data.language,
        parameters: parsed.data.parameters,
        parameterOrder: parsed.data.parameterOrder
      });

      const message = response.result?.messages?.[0];
      if (message?.id) {
        await db.collection("whatsapp_messages").updateOne(
          { messageId: message.id },
          {
            $setOnInsert: {
              messageId: message.id,
              direction: "outbound",
              from: process.env.WHATSAPP_PHONE_NUMBER_ID,
              to: contact.phone,
              contactName: contact.name,
              type: "template",
              templateName: parsed.data.templateName,
              text: parsed.data.templateName,
              payload: {
                templateName: parsed.data.templateName,
                language: parsed.data.language,
                parameters: parsed.data.parameters
              },
              campaignId: campaignResult.insertedId.toString(),
              createdAt: new Date()
            },
            $set: {
              lastStatus: message.message_status || "accepted",
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      }
      recipients.push({
        contactId: contact._id.toString(),
        name: contact.name,
        phone: contact.phone,
        status: response.ok ? "accepted" : "failed",
        messageId: message?.id,
        error: response.ok
          ? undefined
          : response.result?.error?.message || JSON.stringify(response.result)
      });
    }

    const acceptedCount = recipients.filter((recipient) => recipient.status === "accepted").length;
    const failedCount = recipients.length - acceptedCount;

    await db.collection("campaigns").updateOne(
      { _id: campaignResult.insertedId },
      {
        $set: {
          recipients,
          acceptedCount,
          failedCount,
          status:
            failedCount === 0 ? "sent" : acceptedCount > 0 ? "partial" : "failed",
          sentAt: new Date()
        }
      }
    );

    return json({
      _id: campaignResult.insertedId.toString(),
      acceptedCount,
      failedCount,
      recipients
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
