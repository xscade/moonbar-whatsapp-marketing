import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import {
  createSession,
  hashPassword,
  hasAdminUsers,
  setSessionCookie
} from "@/lib/auth";
import { error, json } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return error("Check the setup form and try again", 422);

  if (await hasAdminUsers()) {
    return error("An admin account already exists", 409);
  }

  const db = await getDb();
  const now = new Date();
  const result = await db.collection("admin_users").insertOne({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash: await hashPassword(parsed.data.password),
    role: "owner",
    createdAt: now,
    updatedAt: now
  });

  const token = await createSession({
    userId: result.insertedId.toString(),
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    role: "owner"
  });
  await setSessionCookie(token);

  return json({ ok: true });
}
