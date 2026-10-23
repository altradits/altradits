// Department playbooks: how Altradits delivers work, so any approved team
// member can pick up a task and do it to the same standard without Stanley.
// Shown to the assignee on every task, used by the operations agent to brief
// and route work, and listed on the "Join the team" page.

export const DEPARTMENTS = [
  {
    id: "social",
    name: "Social media & content",
    services: ["social-management", "content-writing", "short-video"],
    turnaroundHours: 48,
    tools: ["Meta Business Suite", "Buffer or Later", "Canva", "CapCut", "Google Docs"],
    intake: [
      "Which platforms and account handles?",
      "Brand voice: 3 words, plus 2 posts they love (theirs or anyone's)",
      "What to promote this month (offers, events, launches)",
      "Topics or claims to avoid",
      "Who approves posts before they go live, and how fast?",
    ],
    steps: [
      "Read the client's voice notes and last 10 posts before writing anything",
      "Draft the content calendar or piece in the shared doc, one idea per slot",
      "Send for approval in the portal; never publish unapproved content",
      "Schedule approved posts; reply to comments and DMs within one business day",
      "Log results (reach, clicks, replies) in the monthly one-page report",
    ],
    quality: [
      "Matches the client's voice; reads naturally aloud",
      "No spelling errors; links and tags checked",
      "Images sized for each platform, with alt text",
      "No health, financial or legal claims the client hasn't provided",
    ],
    escalate: ["Negative comment storm or press enquiry", "Account locked or hacked", "Client asks to post something misleading"],
  },
  {
    id: "admin",
    name: "Office administration",
    services: ["inbox-calendar", "data-docs", "bookkeeping-prep", "project-coordination", "hr-recruiting"],
    turnaroundHours: 24,
    tools: ["Gmail / Outlook (delegated access)", "Google Calendar", "Google Sheets / Excel", "Notion, Trello, Asana or ClickUp", "Bitwarden or 1Password sharing"],
    intake: [
      "Which inbox, calendar and tools; how access is granted (delegate or password-manager share only)",
      "What counts as urgent (people, keywords, amounts)",
      "Reply templates or examples in their voice",
      "Working hours and meeting rules (buffers, no-meeting days)",
      "Who the accountant / bookkeeper is, if any",
    ],
    steps: [
      "Confirm access works and record where it came from (never store passwords in notes or email)",
      "Sort into three piles: needs the client now, handled, can wait",
      "Act on 'handled' items using templates; log anything unusual",
      "Send the daily 5-line summary at the agreed time",
      "Keep files named `CLIENT | Topic | YYMMDD` in the shared folder",
    ],
    quality: [
      "Nothing in 'needs you now' waits more than 4 working hours",
      "Numbers reconcile: every invoice matched to a payment or flagged",
      "Calendar invites have agenda, link and timezone",
      "Personal data is shared only with the client and the people they named",
    ],
    escalate: ["Legal letters, tax notices or anything with a deadline under 48 hours", "Payment requests that look like fraud", "Any request to move money"],
  },
  {
    id: "personal",
    name: "Personal assistance",
    services: ["travel-life", "executive-assist", "events"],
    turnaroundHours: 24,
    tools: ["Google Flights / Skyscanner", "Booking.com / Airbnb", "Google Maps", "Calendar", "Notion or Google Docs"],
    intake: [
      "Preferences: airlines, seat, hotel style, dietary needs, loyalty numbers",
      "Budget ranges and who pays (client card stays with the client)",
      "Family members or contacts we may coordinate with",
      "Time zone and quiet hours",
    ],
    steps: [
      "Research at least 3 options and present them side by side with prices",
      "Book only after the client approves; the client completes any payment step",
      "Put every booking in the calendar with confirmations attached",
      "Send reminders 48h and 3h before anything time-sensitive",
    ],
    quality: [
      "Times shown in the client's time zone",
      "Cancellation terms stated for every option",
      "No card numbers, passport scans or passwords in chat or email",
    ],
    escalate: ["Missed flight or cancelled booking", "Medical or safety issue", "Anything requiring the client's payment credentials"],
  },
  {
    id: "growth",
    name: "Sales & customer care",
    services: ["customer-support", "lead-generation", "ecommerce-ops", "host-assist", "research"],
    turnaroundHours: 24,
    tools: ["Help desk or shared inbox", "WhatsApp Business", "Shopify / Etsy / Amazon / Jumia admin", "Google Sheets CRM", "LinkedIn"],
    intake: [
      "Top 10 customer questions and the approved answers",
      "Refund and discount rules (exact limits)",
      "Ideal customer profile for lead lists",
      "Tone for customer replies and sign-off name",
    ],
    steps: [
      "Build or update the FAQ answer bank before replying to customers",
      "Reply within the agreed time using the answer bank; tag new questions",
      "For lead lists: verify every contact is real and relevant; note the source",
      "Weekly: report volumes, response times and the 3 most common issues",
    ],
    quality: [
      "Refunds and discounts never exceed the client's written limits",
      "Every lead has a source and a reason it fits",
      "No spammy outreach: personalised, opt-out respected",
    ],
    escalate: ["Angry customer threatening chargeback or public complaint", "Refund above the written limit", "Data-protection request (delete my data)"],
  },
  {
    id: "tech",
    name: "Web, automation & Bitcoin",
    services: ["website", "store-payments", "automation-ai", "bitcoin", "translation"],
    turnaroundHours: 72,
    tools: ["GitHub", "Zapier / Make / n8n", "Shopify / WooCommerce", "Stripe / Paystack / M-Pesa", "BTCPay / LND"],
    intake: [
      "Current site, hosting and who has admin access",
      "Payment providers and currencies needed",
      "What 'done' looks like (one sentence) and the deadline",
      "For Bitcoin: confirm the client keeps their own keys (we never hold seeds)",
    ],
    steps: [
      "Write a one-paragraph plan with the definition of done; get approval",
      "Build in a test or staging environment first",
      "Test failure cases: declined payment, wrong input, slow network, mobile",
      "Hand over with a short written guide and a 10-minute walkthrough",
    ],
    quality: [
      "Mobile-first, loads fast, keyboard accessible",
      "Every automation has failure alerts and an off switch",
      "Secrets live in the platform's secret store, never in code or docs",
      "Bitcoin: client holds keys; we never see seed phrases",
    ],
    escalate: ["Production outage", "Suspected security breach or leaked secret", "Anything touching client funds or keys"],
  },
];

const BY_SERVICE = Object.fromEntries(DEPARTMENTS.flatMap((d) => d.services.map((s) => [s, d.id])));

export const departmentForService = (serviceId) => BY_SERVICE[serviceId] || null;
export const findDepartment = (id) => DEPARTMENTS.find((d) => d.id === id) || null;

// Keyword routing used when a task arrives without a service attached.
const ROUTES = [
  ["social", /instagram|tiktok|facebook|linkedin post|post|reel|video|caption|newsletter|blog|content|canva|social/i],
  ["tech", /website|landing|wordpress|shopify theme|domain|dns|automation|zapier|n8n|make\.com|api|bitcoin|lightning|payment link|checkout|bug|translate|transcri/i],
  ["growth", /customer|support|refund|ticket|lead|prospect|outreach|listing|order|inventory|airbnb|guest|review|research|competitor/i],
  ["personal", /flight|hotel|travel|trip|booking|reservation|gift|restaurant|appointment|event|webinar|birthday|errand/i],
  ["admin", /email|inbox|calendar|schedule|meeting|invoice|receipt|bookkeep|spreadsheet|excel|data entry|document|crm|hire|recruit|cv|notion|trello|asana/i],
];

export function routeTask(text, hintServiceId) {
  const fromService = hintServiceId && departmentForService(hintServiceId);
  if (fromService) return fromService;
  for (const [dept, re] of ROUTES) if (re.test(text)) return dept;
  return "admin";
}
