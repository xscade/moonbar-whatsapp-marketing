// End-to-end test of the webhook route's forwarding to the valet app: the real
// route handler, an in-memory MongoDB fake with seeded data, and a local HTTP
// server standing in for the valet app. No network or real database needed.
//
// Run after `npm ci`:  npx tsx tests/webhook-forward.test.mts
// (tsx resolves the tsconfig "@/" alias). The timeout case takes ~10 seconds.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import assert from "node:assert/strict";

const SECRET = "test_app_secret";
const MOON_BAR_PHONE_ID = "111111111111111";
const OTHER_PHONE_ID = "222222222222222";
const WABA_ID = "1733459198099874";

process.env.WHATSAPP_APP_SECRET = SECRET;
process.env.WHATSAPP_PHONE_NUMBER_ID = MOON_BAR_PHONE_ID;
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = WABA_ID;
process.env.MONGODB_URI = "mongodb://fake";

// ---- in-memory Mongo fake ---------------------------------------------------
type Doc = Record<string, unknown>;
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Doc[]).some((f) => matches(doc, f));
    const value = doc[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Doc;
      if ("$in" in c) return (c.$in as unknown[]).includes(value);
      if ("$exists" in c) return (value !== undefined) === c.$exists;
      if ("$lt" in c) return value !== undefined && new Date(value as string) < new Date(c.$lt as string);
    }
    return String(value) === String(cond) && value !== undefined;
  });
}
const SEED: Record<string, Doc[]> = {
  whatsapp_messages: [
    // Sent by us (campaign / inbox): has `from`.
    { messageId: "wamid.OURS1", direction: "outbound", from: MOON_BAR_PHONE_ID, to: "919876543210", type: "template", templateName: "diwali_offer", createdAt: "2026-09-01T10:00:00Z" },
    { messageId: "wamid.OURS2", direction: "outbound", from: MOON_BAR_PHONE_ID, to: "919876543211", type: "text", createdAt: "2026-10-20T10:00:00Z" },
    // Staff sent the valet app's template from our inbox after forwarding existed.
    { messageId: "wamid.OURS3", direction: "outbound", from: MOON_BAR_PHONE_ID, to: "919876543212", type: "template", templateName: "get_my_car", createdAt: "2026-10-20T10:00:00Z" },
    // Placeholder created by processStatuses for a valet-app message: no `from`.
    { messageId: "wamid.VALET_SEEN", direction: "outbound", to: "919876543210", type: "template" },
    // Inbound guest message: direction inbound.
    { messageId: "wamid.IN1", direction: "inbound", from: "919876543210", type: "text" }
  ],
  message_templates: [
    { name: "weekend_menu", language: "en", metaId: "554" },
    { name: "get_my_car", language: "en", metaId: "555" },
    { name: "diwali_offer", language: "en", metaId: "556" }
  ],
  // Created from the dashboard. old_promo has since been deleted from message_templates.
  template_ownership: [
    { name: "weekend_menu", createdVia: "dashboard" },
    { name: "old_promo", createdVia: "dashboard" }
  ]
};
let store: Record<string, Doc[]> = {};
const calls: Array<{ coll: string; op: string; args: unknown[] }> = [];
let dbFails = false;
const fakeDb = {
  collection(coll: string) {
    const rows = () => (store[coll] ??= []);
    const guard = () => { if (dbFails) throw new Error("db down"); };
    return {
      async insertOne(doc: Doc) { guard(); calls.push({ coll, op: "insertOne", args: [doc] }); rows().push(doc); return { insertedId: doc._id }; },
      async updateOne(filter: Doc, update: Doc, opts?: Doc) { guard(); calls.push({ coll, op: "updateOne", args: [filter, update, opts] }); return { modifiedCount: 0, upsertedCount: 0, matchedCount: 0 }; },
      async findOne(filter: Doc) { guard(); calls.push({ coll, op: "findOne", args: [filter] }); return rows().find((d) => matches(d, filter)) ?? null; },
      find(filter: Doc) {
        return { toArray: async () => { guard(); calls.push({ coll, op: "find", args: [filter] }); return rows().filter((d) => matches(d, filter)); } };
      }
    };
  }
};
(globalThis as Record<string, unknown>).moonbarMongoClientPromise = Promise.resolve({ db: () => fakeDb });

// ---- stand-in for the valet app ---------------------------------------------
type Received = { body: Buffer; headers: IncomingMessage["headers"] };
let received: Received[] = [];
let mode: "ok" | "403" | "slow" = "ok";
const serverB = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    received.push({ body: Buffer.concat(chunks), headers: req.headers });
    if (mode === "ok") { res.writeHead(200); res.end('{"ok":true}'); }
    else if (mode === "403") { res.writeHead(403); res.end('{"error":"forwarding not enabled"}'); }
    else setTimeout(() => { res.writeHead(200); res.end("late"); }, 12_000).unref();
  });
});
await new Promise<void>((r) => serverB.listen(0, "127.0.0.1", r));
const serverBUrl = `http://127.0.0.1:${(serverB.address() as AddressInfo).port}/webhooks/whatsapp`;

function serverBVerifies(r: Received) {
  const sig = r.headers["x-hub-signature-256"];
  if (typeof sig !== "string") return false;
  const expected = `sha256=${createHmac("sha256", SECRET).update(r.body).digest("hex")}`;
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const { POST } = await import("@/app/api/webhooks/whatsapp/route");
const { isValetMessage } = await import("@/lib/whatsapp/forwardWebhook");
const { NextRequest } = await import("next/server");

const sign = (bytes: Buffer) => `sha256=${createHmac("sha256", SECRET).update(bytes).digest("hex")}`;
async function call(payloadOrBytes: unknown, signature?: string | null) {
  const bytes = Buffer.isBuffer(payloadOrBytes) ? payloadOrBytes : Buffer.from(JSON.stringify(payloadOrBytes));
  const sig = signature === undefined ? sign(bytes) : signature;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig) headers["x-hub-signature-256"] = sig;
  const res = await POST(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", body: bytes, headers }));
  return { res, json: await res.json(), bytes };
}

const wrap = (changes: unknown[], wabaId = WABA_ID) => ({ object: "whatsapp_business_account", entry: [{ id: wabaId, changes }] });
function messagesChange(phoneId: string, value: Record<string, unknown>) {
  return { field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "919999999999", phone_number_id: phoneId }, contacts: [{ profile: { name: "Guest" }, wa_id: "919876543210" }], ...value } };
}
let n = 0;
const text = (body: string) => ({ from: "919876543210", id: `wamid.T${++n}`, timestamp: "1760600000", type: "text", text: { body } });
const button = (t: string) => ({ from: "919876543210", id: `wamid.B${++n}`, timestamp: "1760600000", type: "button", button: { text: t, payload: "GMC" }, context: { id: "wamid.VALET_SEEN" } });
const interactive = (title: string) => ({ from: "919876543210", id: `wamid.I${++n}`, timestamp: "1760600000", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title } } });
const image = () => ({ from: "919876543210", id: `wamid.M${++n}`, timestamp: "1760600000", type: "image", image: { id: "123", mime_type: "image/jpeg" } });
const msgs = (...messages: unknown[]) => wrap([messagesChange(MOON_BAR_PHONE_ID, { messages })]);
const status = (id: string, s = "delivered") => ({ id, status: s, timestamp: "1760600002", recipient_id: "919876543210" });
const stats = (...statuses: unknown[]) => wrap([messagesChange(MOON_BAR_PHONE_ID, { statuses })]);
const tmpl = (name: string, field = "message_template_status_update") => ({ field, value: { event: "APPROVED", message_template_id: 999, message_template_name: name, message_template_language: "en", reason: "NONE" } });

let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
  received = []; calls.length = 0; dbFails = false; mode = "ok";
  store = JSON.parse(JSON.stringify(SEED));
  process.env.VALET_WEBHOOK_FORWARD_URL = serverBUrl;
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = WABA_ID;
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (err) { failures++; console.log(`FAIL  ${name}\n      ${(err as Error).message.split("\n").slice(0, 4).join("\n      ")}`); }
}
const forwarded = async (payload: unknown) => { const r = await call(payload); assert.equal(r.res.status, 200); assert.equal(received.length, 1, "expected a forward"); assert.ok(received[0].body.equals(r.bytes), "bytes differ"); assert.ok(serverBVerifies(received[0])); assert.equal(r.json.forward.status, 200); };
const notForwarded = async (payload: unknown) => { const r = await call(payload); assert.equal(r.res.status, 200); assert.equal(received.length, 0, "expected no forward"); assert.equal(r.json.forward, null); };

// ---- guest messages ---------------------------------------------------------
await test("tag scan (new format, raw emoji, odd whitespace) forwarded byte-exact", async () => {
  const bytes = Buffer.from(JSON.stringify(msgs(text("👋 Hi Moon Bar and Kitchen! My car needs to be parked -- tag VQ-A01.")), null, 1).replace(/\n/g, "\r\n "), "utf8");
  await forwarded(bytes);
});
await test("tag scan (old format A1B3F0) forwarded", () => forwarded(msgs(text("Hi! My car needs to be parked -- tag A1B3F0"))));
await test("tag scan lowercase forwarded", () => forwarded(msgs(text("tag vq-a01"))));
for (const t of ["car", "Car", "CAR ", "retrieve", "Pickup"]) {
  await test(`car request ${JSON.stringify(t)} forwarded`, () => forwarded(msgs(text(t))));
}
await test("ACCEPT- staff reply forwarded", () => forwarded(msgs(text("ACCEPT-A1B3F0"))));
await test("accept- lowercase with leading space forwarded", () => forwarded(msgs(text("  accept-A1B3F0"))));
await test("Get My Car template button forwarded", () => forwarded(msgs(button("Get My Car"))));
await test("Get My Car interactive reply forwarded", () => forwarded(msgs(interactive("Get my car"))));
await test("plain Hi not forwarded", () => notForwarded(msgs(text("Hi"))));
await test("campaign reply not forwarded", () => notForwarded(msgs(text("Yes, book a table for 4 tonight"))));
for (const t of ["car please", "Car Please", "My car please", "Can you pick up my car?", "pick up", "PICK  UP now"]) {
  await test(`car request phrase ${JSON.stringify(t)} forwarded`, () => forwarded(msgs(text(t))));
}
await test("'my car' not forwarded (single-word car requests must be the whole message)", () => notForwarded(msgs(text("my car"))));
await test("'my tag is VQ-A01' not forwarded", () => notForwarded(msgs(text("my tag is VQ-A01"))));
await test("image without caption not forwarded", () => notForwarded(msgs(image())));
await test("other button text not forwarded", () => notForwarded(msgs(button("Book a table"))));
await test("batch Hi + car forwarded (any valet item forwards the whole POST)", () => forwarded(msgs(text("Hi"), text("car"))));
await test("valet message for another number not forwarded", () => notForwarded(wrap([messagesChange(OTHER_PHONE_ID, { messages: [text("car")] })])));
await test("valet message mixed with another number's change not forwarded", () => notForwarded(wrap([messagesChange(MOON_BAR_PHONE_ID, { messages: [text("car")] }), messagesChange(OTHER_PHONE_ID, { messages: [text("Hi")] })])));

// ---- delivery statuses -------------------------------------------------------
await test("status for our campaign message not forwarded", () => notForwarded(stats(status("wamid.OURS1"))));
await test("status for our inbox reply not forwarded", () => notForwarded(stats(status("wamid.OURS2", "read"))));
await test("status for an unknown message (valet app's) forwarded", () => forwarded(stats(status("wamid.VALET_NEW", "sent"))));
await test("later status for a valet message we've seen (placeholder row) forwarded", () => forwarded(stats(status("wamid.VALET_SEEN", "read"))));
await test("batch: our status + valet status forwarded", () => forwarded(stats(status("wamid.OURS1"), status("wamid.VALET_NEW"))));
await test("non-valet guest message + valet status forwarded", () => forwarded(wrap([messagesChange(MOON_BAR_PHONE_ID, { messages: [text("Hi")], statuses: [status("wamid.VALET_NEW")] })])));
await test("valet status for another number not forwarded", () => notForwarded(wrap([messagesChange(OTHER_PHONE_ID, { statuses: [status("wamid.VALET_NEW")] })])));

// ---- template updates --------------------------------------------------------
await test("update for a template created from our dashboard not forwarded", () => notForwarded(wrap([tmpl("weekend_menu")])));
await test("update for an older template we sent before tracking began not forwarded", () => notForwarded(wrap([tmpl("diwali_offer", "message_template_quality_update")])));
await test("update for a deleted dashboard template not forwarded", () => notForwarded(wrap([tmpl("old_promo", "message_template_status_update")])));
await test("update for the valet app's template forwarded, even after our staff sent it", () => forwarded(wrap([tmpl("get_my_car")])));
await test("update for a template we've never seen forwarded", () => forwarded(wrap([tmpl("valet_ticket_ready", "template_category_update")])));
await test("template update without a name forwarded", () => forwarded(wrap([{ field: "message_template_components_update", value: { message_template_id: 1 } }])));
await test("valet template update for another WABA not forwarded", () => notForwarded(wrap([tmpl("get_my_car")], "999999999999999")));
await test("valet template update + phone number update not forwarded", () => notForwarded(wrap([tmpl("get_my_car"), { field: "phone_number_quality_update", value: { display_phone_number: "919999999999", event: "UPGRADE" } }])));
await test("our template update + valet message forwarded", () => forwarded(wrap([tmpl("weekend_menu"), messagesChange(MOON_BAR_PHONE_ID, { messages: [text("car")] })])));
await test("unknown field not forwarded", () => notForwarded(wrap([{ field: "account_update", value: {} }])));

// ---- failure handling --------------------------------------------------------
await test("ownership check can't reach MongoDB: forwarded, then 500 (Meta retries)", async () => {
  dbFails = true;
  await assert.rejects(call(stats(status("wamid.OURS1"))), /db down/);
  assert.equal(received.length, 1);
});
await test("forwarding off: no forward and no ownership queries", async () => {
  delete process.env.VALET_WEBHOOK_FORWARD_URL;
  const { json } = await call(stats(status("wamid.VALET_NEW")));
  assert.equal(received.length, 0); assert.equal(json.forward, null);
  assert.ok(!calls.some((c) => c.op === "find"), "ownership query ran while forwarding is off");
});
await test("valet app 403: Meta still gets 200, failure recorded on the event", async () => {
  mode = "403";
  const { res, json } = await call(msgs(text("car")));
  assert.equal(res.status, 200); assert.equal(json.forward.status, 403); assert.match(json.forward.error, /forwarding not enabled/);
  assert.ok(calls.some((c) => c.coll === "whatsapp_webhook_events" && c.op === "updateOne"));
});
await test("bad signature: 403, nothing forwarded", async () => {
  const { res } = await call(msgs(text("car")), "sha256=" + "0".repeat(64));
  assert.equal(res.status, 403); assert.equal(received.length, 0);
});
await test("valet app hangs: forward times out at ~10s, Meta gets 200", async () => {
  mode = "slow"; const t = Date.now();
  const { res, json } = await call(msgs(text("car")));
  const ms = Date.now() - t;
  assert.equal(res.status, 200); assert.equal(json.forward.error, "Timed out after 10000ms"); assert.ok(ms >= 9_900 && ms < 11_500, `took ${ms}ms`);
});

// ---- isValetMessage edge cases (pure) ----------------------------------------
await test("isValetMessage edge cases", async () => {
  const yes = ["tag VQ-AB12", "TAG A1B3F0", "tag VQ-A01", " pickup ", "GET MY CAR", "pick up", "car please!"];
  const no = ["hashtag VQ-A01", "tag: VQ-A01", "tag VQ-A1", "pick-up", "car.", "", "ACCEPT A1B3F0", "carplease", "pickup truck", "scar please"];
  for (const t of yes) assert.ok(isValetMessage({ text: { body: t } }), `should match ${JSON.stringify(t)}`);
  for (const t of no) assert.ok(!isValetMessage({ text: { body: t } }), `should not match ${JSON.stringify(t)}`);
  assert.ok(!isValetMessage({} as never)); assert.ok(!isValetMessage(null as never));
});

serverB.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
