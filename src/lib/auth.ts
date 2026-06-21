import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { serializeDoc } from "@/lib/serializers";
import type { AdminUser, Role } from "@/types/entities";

const SESSION_COOKIE = "moonbar_admin_session";

type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
};

function getSecret() {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    "moonbar-local-development-secret";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<AdminUser | null> {
  const session = await getSession();
  if (!session?.userId || !ObjectId.isValid(session.userId)) return null;

  const db = await getDb();
  const user = await db.collection("admin_users").findOne({
    _id: new ObjectId(session.userId)
  });

  if (!user) return null;

  const safeUser = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
  return serializeDoc(safeUser) as unknown as AdminUser;
}

export async function hasAdminUsers() {
  const db = await getDb();
  return (await db.collection("admin_users").countDocuments()) > 0;
}
