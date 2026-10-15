import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import {
  forwardWebhook,
  processWebhookPayload,
  recordWebhookForward,
  shouldForwardWebhook,
  verifyChallenge,
  verifyWebhookSignature
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
// Forwarding to the valet app can take up to 10s before we reply to Meta.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const challenge = verifyChallenge(request.nextUrl.searchParams);

  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }

  return NextResponse.json(
    { error: "Verification failed" },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  // Keep the exact bytes: the valet app re-verifies Meta's signature over them.
  const body = await request.arrayBuffer();
  const rawBody = new TextDecoder().decode(body);
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 403 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = new ObjectId();

  // Forward before replying: on Vercel, work left after the response can be cut off.
  const [processed, forwarded] = await Promise.allSettled([
    processWebhookPayload(payload as never, eventId),
    signature
      ? shouldForwardWebhook(payload as never).then((forward) =>
          forward ? forwardWebhook(body, signature) : null
        )
      : null
  ]);

  const forward = forwarded.status === "fulfilled" ? forwarded.value : null;
  if (forward) {
    await recordWebhookForward(eventId, forward);
  }

  if (processed.status === "rejected") {
    throw processed.reason;
  }

  return NextResponse.json(
    {
      success: true,
      result: processed.value,
      forward
    },
    { status: 200 }
  );
}
