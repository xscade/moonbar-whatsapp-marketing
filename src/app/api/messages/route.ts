import { handleRouteError, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/mongodb";
import { serializeDocs } from "@/lib/serializers";

export async function GET(request: Request) {
  try {
    await requireUser();
    const db = await getDb();
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone");

    const filter: Record<string, unknown> = {};
    if (phone) {
      filter.$or = [{ from: phone }, { to: phone }];
    }

    const [messages, statuses, events] = await Promise.all([
      db
        .collection("whatsapp_messages")
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(300)
        .toArray(),
      db
        .collection("whatsapp_message_statuses")
        .find({})
        .sort({ createdAt: -1 })
        .limit(300)
        .toArray(),
      db
        .collection("whatsapp_webhook_events")
        .find({})
        .sort({ createdAt: -1 })
        .limit(40)
        .toArray()
    ]);

    return json({
      messages: serializeDocs(messages),
      statuses: serializeDocs(statuses),
      events: serializeDocs(events)
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
