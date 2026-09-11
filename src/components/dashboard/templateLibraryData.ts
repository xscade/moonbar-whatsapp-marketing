import type { TemplateCategory } from "@/types/entities";

export type LibraryButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
  text?: string;
  url?: string;
  phone_number?: string;
};

export type LibraryTemplate = {
  name: string;
  category: TemplateCategory;
  description: string;
  header?: string;
  body: string;
  footer?: string;
  buttons?: LibraryButton[];
};

// Curated starter templates. Meta does not expose a public API to enumerate its
// utility/authentication library (message_template_library is not readable and
// message_template_previews only serves authentication OTP previews), so — like
// AiSensy/Wati — we ship our own gallery that prefills the builder. All bodies
// use valid named variables and avoid Meta's rejection rules (no leading/
// trailing/adjacent variables).
export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  // ---------------- Marketing ----------------
  {
    name: "weekend_event_reminder",
    category: "MARKETING",
    description: "Promote a weekend event with a booking link.",
    body: "Hey {{name}}! 🎉 This {{day}} at Moon Bar & Kitchen — {{event}}. {{offer}} Doors open {{time}}. See you there!",
    footer: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Book a table", url: "https://moonbar.in/book" }]
  },
  {
    name: "ladies_night",
    category: "MARKETING",
    description: "Ladies-night promo with a themed header.",
    header: "SIP & SLAY — Ladies Night ✨",
    body: "Hey {{name}}, it's Ladies Night this {{day}}! Cocktails on us for the first hour 🍸 from {{time}} at Moon Bar & Kitchen.",
    footer: "Reply STOP to opt out"
  },
  {
    name: "happy_hour",
    category: "MARKETING",
    description: "Happy-hour discount announcement.",
    body: "🍹 {{name}}, Happy Hour is on! Flat {{discount}} off all drinks this {{day}}, {{start_time}} to {{end_time}} at Moon Bar & Kitchen.",
    buttons: [{ type: "QUICK_REPLY", text: "Remind me" }]
  },
  {
    name: "live_music_night",
    category: "MARKETING",
    description: "Live-music lineup with a reservation button.",
    header: "Live Music Night 🎶",
    body: "{{name}}, {{artist}} performs live this {{day}} at Moon Bar & Kitchen from {{time}}. Grab your table before it fills up!",
    buttons: [{ type: "URL", text: "Reserve", url: "https://moonbar.in/book" }]
  },
  {
    name: "new_menu_launch",
    category: "MARKETING",
    description: "Announce a new seasonal menu.",
    body: "{{name}}, our new {{season}} menu just launched at Moon Bar & Kitchen 🍽️ Come taste something new with us this week!"
  },
  {
    name: "birthday_offer",
    category: "MARKETING",
    description: "Birthday reward to bring guests in.",
    body: "Happy Birthday, {{name}}! 🎂 Celebrate at Moon Bar & Kitchen this month and enjoy a complimentary {{gift}} on us.",
    footer: "Valid this month only"
  },
  {
    name: "weekend_brunch",
    category: "MARKETING",
    description: "Weekend brunch promotion.",
    body: "{{name}}, weekend brunch is calling 🥂 Bottomless drinks and live music every {{day}} at Moon Bar & Kitchen. Book your spot today!",
    buttons: [{ type: "URL", text: "Book brunch", url: "https://moonbar.in/brunch" }]
  },

  // ---------------- Utility ----------------
  {
    name: "booking_confirmation",
    category: "UTILITY",
    description: "Confirm a table reservation.",
    body: "Hi {{name}}, your booking at Moon Bar & Kitchen is confirmed ✅\nDate: {{date}}\nTime: {{time}}\nGuests: {{guests}}\nSee you soon!"
  },
  {
    name: "booking_reminder",
    category: "UTILITY",
    description: "Remind a guest of an upcoming booking.",
    body: "Reminder: {{name}}, your table at Moon Bar & Kitchen is reserved for {{date}} at {{time}}. Reply here to modify or cancel."
  },
  {
    name: "order_ready",
    category: "UTILITY",
    description: "Notify a guest their order is ready.",
    body: "Hi {{name}}, your order {{order_id}} is ready for pickup at Moon Bar & Kitchen. Thank you!"
  },
  {
    name: "payment_receipt",
    category: "UTILITY",
    description: "Send a payment confirmation.",
    body: "Thanks {{name}}! We've received your payment of {{amount}} for {{purpose}}. Reference: {{order_id}}. See you again soon!",
    footer: "Moon Bar & Kitchen"
  },
  {
    name: "reservation_cancelled",
    category: "UTILITY",
    description: "Confirm a cancelled reservation.",
    body: "Hi {{name}}, your reservation for {{date}} at Moon Bar & Kitchen has been cancelled. We hope to see you again soon."
  },
  {
    name: "feedback_request",
    category: "UTILITY",
    description: "Ask for feedback after a visit.",
    body: "Hi {{name}}, thanks for visiting Moon Bar & Kitchen on {{date}}! We'd love to hear how your experience was.",
    buttons: [{ type: "URL", text: "Leave feedback", url: "https://moonbar.in/feedback" }]
  },
  {
    name: "table_ready",
    category: "UTILITY",
    description: "Tell a waiting guest their table is ready.",
    body: "Hi {{name}}, great news — your table at Moon Bar & Kitchen is ready! Please head to the host desk. Thanks for waiting."
  }
];
