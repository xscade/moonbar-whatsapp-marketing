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

## Forwarding to the Valet App

The valet app shares this Meta app, and a Meta app has only one callback URL,
so this endpoint passes events on to it. Set:

```bash
VALET_WEBHOOK_FORWARD_URL=https://valetq-api.vercel.app/webhooks/whatsapp
```

Leave it unset to turn forwarding off. When it is set, these webhook POSTs are
re-sent with the exact body bytes and Meta's `X-Hub-Signature-256` header, so
the valet app can verify them with the same App Secret:

- `messages` events for `WHATSAPP_PHONE_NUMBER_ID`: guest messages and
  delivery statuses (sent, delivered, read, failed) for everything sent from
  that number, campaigns included.
- Template updates (`message_template_status_update`,
  `message_template_quality_update`, `message_template_components_update`,
  `template_category_update`) for `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Phone number updates and events for other phone numbers are not forwarded. A
signed body can't be trimmed, so a POST mixing these with anything else is not
forwarded at all. The forward finishes (10 second timeout) before we reply to
Meta, and Meta always gets a 200 whatever the valet app answers. Each result is
stored on the event in `whatsapp_webhook_events` and shown in the Inbox tab's
Webhook Audit.

The valet app answers valet messages itself, so this app must never auto-reply
to them (it has no auto-replies today). They are tag scans matching
`\btag\s+(VQ-[A-Z]+\d{2}|[0-9A-F]{6})\b` (case-insensitive), staff replies
starting `ACCEPT-`, and messages that are just `car`, `retrieve` or `pickup`,
or a tap on the "Get My Car" button.
