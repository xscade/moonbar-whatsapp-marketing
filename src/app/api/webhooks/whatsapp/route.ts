import { NextRequest, NextResponse } from "next/server";
import {
  processWebhookPayload,
  verifyChallenge,
  verifyWebhookSignature
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

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
  const rawBody = await request.text();
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

  const result = await processWebhookPayload(payload as never);

  return NextResponse.json(
    {
      success: true,
      result
    },
    { status: 200 }
  );
}
