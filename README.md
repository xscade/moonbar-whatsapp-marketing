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
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=moonbar_verify_token
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com
```

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
