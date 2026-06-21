import { getDb } from "@/lib/mongodb";

type IncomingMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: unknown;
  image?: unknown;
  audio?: unknown;
  video?: unknown;
  document?: unknown;
};

type ContactProfile = {
  wa_id?: string;
  profile?: { name?: string };
};

export async function processIncomingMessages(
  messages: IncomingMessage[],
  contacts: ContactProfile[] = [],
  context: Record<string, unknown> = {}
) {
  if (!messages.length) return { inserted: 0 };

  const db = await getDb();
  const now = new Date();
  let inserted = 0;

  for (const message of messages) {
    const contact = contacts.find((item) => item.wa_id === message.from);
    const text =
      message.text?.body ||
      message.button?.text ||
      message.button?.payload ||
      (message.type === "interactive" ? "Interactive response" : "");

    await db.collection("whatsapp_messages").updateOne(
      { messageId: message.id },
      {
        $setOnInsert: {
          messageId: message.id,
          direction: "inbound",
          from: message.from,
          to: process.env.WHATSAPP_PHONE_NUMBER_ID,
          contactName: contact?.profile?.name,
          type: message.type,
          text,
          payload: message,
          context,
          createdAt: message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : now
        },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );
    inserted += 1;
  }

  return { inserted };
}
