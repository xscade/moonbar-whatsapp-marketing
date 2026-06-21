import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { error, json } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return error("Enter a valid email and password", 422);

  const db = await getDb();
  const user = await db.collection("admin_users").findOne({
    email: parsed.data.email.toLowerCase()
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return error("Invalid email or password", 401);
  }

  const token = await createSession({
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role
  });
  await setSessionCookie(token);

  return json({ ok: true });
}
