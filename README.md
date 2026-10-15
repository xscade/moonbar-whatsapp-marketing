# Moonbar WhatsApp Marketing

Admin portal for Moon Bar and Kitchen WhatsApp campaigns, contacts, lists,
templates, delivery tracking, and inbound webhook events.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. On a fresh database, the app starts at `/setup`
so you can create the first admin user.

## Required Environment

`.env.local` must include:

```bash
MONGODB_URI=
AUTH_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=moonbar_verify_token
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com
```

`AUTH_SECRET` signs admin sessions. Set it to its own random value: without
it, sessions fall back to `WHATSAPP_APP_SECRET`, which the valet app also holds.

## WhatsApp Webhook

The production callback URL is:

```text
https://yourdomain.com/api/webhooks/whatsapp
```

Use the same value as `WHATSAPP_VERIFY_TOKEN` in Meta's webhook
configuration. For the current local config, that value is:

```text
moonbar_verify_token
```

Subscribe these WhatsApp webhook fields:

- `messages`
- `message_template_status_update`
- `message_template_quality_update`
- `phone_number_name_update`
- `phone_number_quality_update`

Webhook POSTs are stored in MongoDB collections:

- `whatsapp_webhook_events`
- `whatsapp_messages`
- `whatsapp_message_statuses`
- `whatsapp_template_events`

The dashboard Inbox tab reads from those collections.

## Scheduled sending & retries

A single cron job drives both scheduled campaign sending and automatic retries.
Point cron-job.org at `POST /api/cron/campaigns` every minute with an
`Authorization: Bearer $CRON_SECRET` header.

`CRON_SECRET` (and optional `RETRY_MAX_ATTEMPTS`, default 3) gate the retry
dispatcher. See [docs/retry-failed-deliveries.md](docs/retry-failed-deliveries.md)
for the retry feature — architecture, metrics, API, and cron-job.org setup.

## Forwarding to the Valet App

The valet app shares this Meta app, and a Meta app has only one callback URL,
so this endpoint passes events on to it. Set:

```bash
VALET_WEBHOOK_FORWARD_URL=https://valetq-api.vercel.app/webhooks/whatsapp
```

Leave it unset to turn forwarding off. When it is set, a webhook POST is
re-sent with the exact body bytes and Meta's `X-Hub-Signature-256` header, so
the valet app can verify it with the same App Secret, when it contains any of:

- A valet message to `WHATSAPP_PHONE_NUMBER_ID`: text (or a button or list
  reply) matching `\btag\s+(VQ-[A-Z]+\d{2}|[0-9A-F]{6})\b` anywhere
  (case-insensitive), starting with `ACCEPT-`, or that is just `car`,
  `retrieve`, `pickup` or `Get My Car` (ignoring case and surrounding spaces).
- A delivery status for a message this app didn't send. Every send path here
  stores the message in `whatsapp_messages` with `from` set, so a status with
  no such row belongs to the valet app.
- A template update for `WHATSAPP_BUSINESS_ACCOUNT_ID` about a template this
  app didn't create. Templates created from the dashboard are stored with
  `createdVia: "dashboard"`; older ones count as ours if we have sent them.

A signed body can't be trimmed, so the whole POST is forwarded when any part of
it qualifies, and nothing is forwarded if any part belongs to another phone
number or business account, or is another kind of event. If ownership can't be
checked because MongoDB is unavailable, the POST is forwarded.

The forward finishes (10 second timeout) before we reply to Meta, and Meta
always gets a 200 whatever the valet app answers. Each result is stored on the
event in `whatsapp_webhook_events` and shown in the Inbox under Developer
events, Webhooks tab.

`tests/webhook-forward.test.mts` covers these rules end to end against the real
route, with an in-memory MongoDB fake and a local stand-in for the valet app.
Run it after `npm ci` with `npx tsx tests/webhook-forward.test.mts`.

The valet app answers valet messages itself, so this app must never
auto-reply to them. It has no auto-replies today. Staff can reply by hand from
the Inbox, so they should leave valet conversations to the valet app.
