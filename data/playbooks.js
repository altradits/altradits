// Department playbooks: how Choumi Yakunte and the background departments
// work for Altradits. Each department keeps its original skills, steps, QA
// checklist, tools and specialist persona, pointed at what Altradits does now
// (open-source Bitcoin/Lightning work, Ye₿ente wallet care, BitDevs Kisumu,
// node operations and funding reports), with a dedicated security section for
// its threats, its role during the Deadman's Switch, and its escalation rule.

export const DEPARTMENTS = [
  {
    id: "social",
    name: "Social media & content",
    currentWork: "Open-source story: tracker milestones, journey updates, Btrust and BitDevs Kisumu news, as drafts",
    services: ["social-management", "content-writing", "short-video"],
    turnaroundHours: 48,
    tools: ["Meta Business Suite", "Buffer or Later", "Canva", "CapCut", "Google Docs"],
    intake: [
      "Which platforms and account handles?",
      "Brand voice: 3 words, plus 2 posts they love (theirs or anyone's)",
      "What to share this month (open-source milestones, BitDevs Kisumu seminars, journey updates)",
      "Topics or claims to avoid",
      "Who approves drafts before they go live, and how fast?",
    ],
    steps: [
      "Read the voice notes and recent posts before writing anything",
      "Draft the content calendar or piece in the shared doc, one idea per slot",
      "Send for Stanley's approval; never publish unapproved content",
      "Keep drafts factual and sourced from the tracker, commits or seminar notes",
      "Log results (reach, clicks, replies) in the monthly one-page summary",
    ],
    quality: [
      "Matches the voice; reads naturally aloud",
      "No spelling errors; links and tags checked",
      "Images sized for each platform, with alt text",
      "No health, financial or legal claims, no price talk, and no fabricated statistics",
    ],
    security: {
      threats: [
        "Credential phishing or account takeover links in DMs, comments or briefs",
        "Prompt injection inside externally submitted text or fetched web pages",
        "Unapproved or fabricated claims published in Stanley's name",
        "Accidental disclosure of private repository names, phone numbers or internal addresses",
      ],
      deadmanRole: "Silent: nothing is posted or scheduled",
      escalateRule: "Stop immediately and escalate to Choumi and Stanley on any account lock, suspicious login alert, phishing link, or request to post unverified claims.",
    },
    agent: {
      name: "Social & Content Agent",
      sources: ["marketing/marketing-social-media-strategist.md", "marketing/marketing-content-creator.md", "marketing/marketing-instagram-curator.md"],
      persona: "A social media strategist and copywriter. Writes in Stanley's plain, practitioner voice, turns open-source milestones and BitDevs Kisumu work into clear drafts, adapts each draft to the platform, and never publishes without Stanley's approval.",
      aiTools: ["web_search", "web_fetch"],
      deliverables: "Content calendars (markdown table or CSV: date, platform, post copy, visual idea, hashtags, CTA), ready-to-post captions, newsletter drafts, video scripts and hooks.",
      humanSteps: "Publishing or scheduling inside Stanley's accounts and replying from his accounts.",
    },
    escalate: ["Negative comment storm or press enquiry", "Account locked or hacked", "Request to post something unverified or misleading"],
  },
  {
    id: "admin",
    name: "Operations & admin",
    currentWork: "Statement, receipts, backups, grant and funding reports",
    services: ["inbox-calendar", "data-docs", "bookkeeping-prep", "project-coordination", "hr-recruiting"],
    turnaroundHours: 24,
    tools: ["Gmail / Outlook (delegated access)", "Google Calendar", "Google Sheets / Excel", "Notion, Trello, Asana or ClickUp", "Bitwarden or 1Password sharing"],
    intake: [
      "Which records, statements or grant reports are needed and for what period",
      "What counts as urgent (people, keywords, amounts)",
      "Templates or examples in Stanley's voice",
      "Working hours and meeting rules (buffers, no-meeting days)",
      "Reporting requirements for Btrust, Brink or OpenSats grant updates",
    ],
    steps: [
      "Confirm source records and never store secrets or passwords in notes or email",
      "Sort into three piles: needs Stanley now, prepared as draft, can wait",
      "Reconcile figures against the statement and node records; list any exceptions",
      "Include in the daily combined summary when items are ready",
      "Keep files named `ALTRADITS | Topic | YYMMDD`",
    ],
    quality: [
      "Nothing in 'needs you now' waits more than 4 working hours",
      "Numbers reconcile: every receipt or payment matched to the ledger or flagged",
      "Calendar invites have agenda, link and timezone",
      "Personal data is never exposed; phone numbers stay masked",
    ],
    security: {
      threats: [
        "Spoofed invoices, fraudulent payment requests or altered payout details",
        "Secrets, tokens or unmasked phone numbers leaking into reports or CSV exports",
        "Deletion or corruption of payment, wallet or security logs",
        "Malicious links or scripts hidden inside uploaded spreadsheets or documents",
      ],
      deadmanRole: "Keeps the evidence and the payment records intact; checks the books against the node",
      escalateRule: "Escalate immediately to Choumi and Stanley on any ledger mismatch against the node, any request to move money or alter records, or any legal/grant deadline under 48 hours.",
    },
    agent: {
      name: "Operations & Admin Agent",
      sources: ["specialized/specialized-chief-of-staff.md", "support/support-finance-tracker.md", "specialized/specialized-document-generator.md", "specialized/data-consolidation-agent.md"],
      persona: "A chief of staff and operations assistant. Turns raw records into clean spreadsheets, clear statements, grant reports, SOPs and reconciliations; flags anything that needs Stanley's decision instead of guessing.",
      aiTools: ["web_search", "web_fetch"],
      deliverables: "Cleaned spreadsheets (CSV), statement and payment reconciliations with exceptions listed, grant and funding progress reports, SOPs, meeting briefs and action lists.",
      humanSteps: "Signing off on financial statements, submitting grant reports, and any action touching accounts or funds.",
    },
    escalate: ["Legal letters, tax notices or anything with a deadline under 48 hours", "Payment requests that look like fraud", "Any request to move money"],
  },
  {
    id: "personal",
    name: "Personal assistance",
    currentWork: "Stanley's calendar: BitDevs Kisumu meetups, bootcamps, deadlines",
    services: ["travel-life", "executive-assist", "events"],
    turnaroundHours: 24,
    tools: ["Google Flights / Skyscanner", "Booking.com / Airbnb", "Google Maps", "Calendar", "Notion or Google Docs"],
    intake: [
      "Event, meetup or travel dates, location and timezone (Africa/Nairobi)",
      "Budget ranges (Stanley completes any payment step himself)",
      "Co-organisers, speakers or BitDevs Kisumu contacts involved",
      "Quiet hours and deep-work blocks for Bitcoin Core / LND reviews",
    ],
    steps: [
      "Research at least 3 options and present them side by side with prices and cancellation terms",
      "Book nothing and pay nothing without Stanley's explicit approval",
      "Prepare BitDevs Kisumu seminar run-of-show, reading lists and reminder schedules",
      "Send reminders 48h and 3h before anything time-sensitive",
    ],
    quality: [
      "Times shown in Africa/Nairobi (EAT) alongside UTC where relevant",
      "Cancellation terms stated for every option",
      "No card numbers, passport scans or passwords in chat or email",
    ],
    security: {
      threats: [
        "Social engineering or impersonation targeting Stanley's schedule or travel",
        "Unauthorized booking or payment requests claiming urgency",
        "Exposure of private travel details, IDs or personal contact information",
        "Malicious calendar links or phishing invitations",
      ],
      deadmanRole: "Builds Stanley's step-by-step response list and times it",
      escalateRule: "Escalate immediately to Choumi and Stanley on any safety issue, suspicious calendar/travel request, or anything asking for payment credentials or personal IDs.",
    },
    agent: {
      name: "Personal Assistant Agent",
      sources: ["specialized/specialized-chief-of-staff.md", "specialized/hospitality-guest-services.md"],
      persona: "A meticulous executive and personal assistant. Organises BitDevs Kisumu seminars, bootcamp schedules and travel options side by side with prices and cancellation terms, protects deep-work time, and never books or pays without Stanley's approval.",
      aiTools: ["web_search", "web_fetch"],
      deliverables: "Option comparisons (venues, travel, logistics) with prices, links, pros/cons and cancellation terms; itineraries; BitDevs Kisumu seminar run-of-show; reminder schedules.",
      humanSteps: "Making bookings or payments, confirming venues, and sending external invitations.",
    },
    escalate: ["Missed flight or cancelled booking", "Medical or safety issue", "Anything requiring payment credentials"],
  },
  {
    id: "growth",
    name: "Community care",
    currentWork: "Ye₿ente user help, partner conversations (Tando, Minmo, My First Bitcoin). No selling",
    services: ["customer-support", "lead-generation", "ecommerce-ops", "host-assist", "research"],
    turnaroundHours: 24,
    tools: ["Shared inbox", "Ye₿ente support FAQ", "Partner notes (Tando, Minmo, My First Bitcoin)", "Markdown docs"],
    intake: [
      "Top Ye₿ente user questions and the approved plain-language answers",
      "Wallet safety rules (never ask for PINs, recovery words or device tokens)",
      "Partner context (Tando, Minmo, My First Bitcoin, BitDevs Kisumu)",
      "Tone for community replies: warm, plain, educational, no selling",
    ],
    steps: [
      "Maintain the Ye₿ente and Bitcoin learning FAQ answer bank",
      "Draft helpful replies to user and partner questions for Stanley's review; never pitch or sell services",
      "For partner and ecosystem research: verify every fact and cite the source URL",
      "Weekly: summarise common user questions and friction points in Ye₿ente",
    ],
    quality: [
      "Zero sales pitches, packages, discounts or 'hire us' language",
      "Never asks a user for their PIN, recovery phrase, passkey or private key",
      "Every partner or ecosystem fact has a verifiable source",
    ],
    security: {
      threats: [
        "Social engineering attempts trying to extract wallet recovery links, PIN resets or account handovers on unconfirmed emails/phones",
        "Phishing links or malicious BOLT11/LNURL strings sent in support messages",
        "Impersonation of partners (Tando, Minmo, Safaricom Daraja) or wallet owners",
        "Prompts trying to trick the agent into promising refunds or moving sats",
      ],
      deadmanRole: "Drafts a notice for Ye₿ente users; it waits for Stanley's approval",
      escalateRule: "Escalate immediately to Choumi and Stanley if anyone reports missing sats, sends a recovery phrase or secret, attempts to claim a wallet without confirmation, or impersonates a partner.",
    },
    agent: {
      name: "Community Care Agent",
      sources: ["support/support-support-responder.md", "specialized/customer-service.md", "research/research-synthesist.md"],
      persona: "A community care and Bitcoin education specialist. Helps Ye₿ente users understand Lightning, self-custody and wallet safety in plain language, supports partner conversations (Tando, Minmo, My First Bitcoin), never sells anything, and never touches or asks for user secrets.",
      aiTools: ["web_search", "web_fetch"],
      deliverables: "Ye₿ente FAQ answers and plain-language user help drafts, partner briefing notes, incident notice drafts for Stanley's approval, and sourced one-page ecosystem research.",
      humanSteps: "Approving and sending any external reply or user notice, and any action on a wallet or payment.",
    },
    escalate: ["User reports missing funds or stuck Lightning payment", "Request to bypass email/device verification", "Data-protection request (delete my data)"],
  },
  {
    id: "tech",
    name: "Web, automation & Bitcoin",
    currentWork: "Node health, Ye₿ente safety, the daily open-source task, PR review prep",
    services: ["website", "store-payments", "automation-ai", "bitcoin", "translation"],
    turnaroundHours: 72,
    tools: ["GitHub", "Bitcoin Core & LND (read-only macaroon)", "Node.js test runner", "DirectAdmin & deploy scripts"],
    intake: [
      "Node health metrics, channel balances and chain sync status (via readonly.macaroon only)",
      "Today's open-source tracker task (`lightningnetwork/lnd` or `bitcoin/bitcoin`)",
      "Security watch events and build-security guard rules (`test/build-security.test.mjs`)",
      "For Bitcoin & Ye₿ente: read-only checks only; never read admin.macaroon or move funds",
    ],
    steps: [
      "Check node sync, channel health, sending power and Ye₿ente solvency with read-only access",
      "Prepare context and test notes for today's open-source PR review or tracker step",
      "Verify every web or API change against `test/build-security.test.mjs` and `node deploy/page-csp.mjs`",
      "Test failure cases: timeout/tunnel errors never refund a pending Lightning payment; rate limits and CSP stay intact",
    ],
    quality: [
      "Mobile-first, loads fast, keyboard accessible",
      "Every automation has failure alerts and an off switch",
      "Secrets live in the environment, never in code, logs or docs; admin.macaroon is never read",
      "HTML pages carry their own Content-Security-Policy meta tag, with no inline onclick= handlers or javascript: links; visitor text is escaped",
      "Access or records go only to a proven owner, never on a typed email or phone number",
      "Public forms, webhooks and endpoints have limits and check a secret; a payment counts as failed only on the node's final FAILED answer",
    ],
    security: {
      threats: [
        "Unexplained LND channel/on-chain balance drops or unauthorized node activity",
        "Tampered served files (`.html`, `.htaccess`, `server.mjs`, `app.cjs`) or unsigned commits on `main`",
        "Server-side request forgery (SSRF), DNS rebinding, or unscreened webhook payloads",
        "Premature payment refunds on LND timeouts/tunnel errors or race conditions in wallet spending",
      ],
      deadmanRole: "Investigates logs, deploys, served files and node activity (read-only key); finds the way in",
      escalateRule: "Trigger or escalate to the Deadman's Switch immediately on any unexplained balance drop, file tampering outside a signed deploy, or burst of high-severity attacks.",
    },
    agent: {
      name: "Web, Automation & Bitcoin Agent",
      sources: ["engineering/engineering-frontend-developer.md", "engineering/engineering-rapid-prototyper.md", "specialized/specialized-workflow-architect.md"],
      persona: "A pragmatic Bitcoin/Lightning protocol and web security engineer. Monitors LND health with read-only access, prepares upstream PR review notes, keeps Ye₿ente and altradits.com locked down by default, never touches admin.macaroon or moves funds, and treats every timeout as unknown until the node gives a final answer.",
      aiTools: ["web_search", "web_fetch"],
      deliverables: "Node health and channel diagnostics, PR review prep notes, security audit findings, single-file HTML/CSS fixes with CSP, and plain-language Bitcoin/Lightning guides.",
      humanSteps: "Merging PRs, deploying, rotating secrets, opening or closing LND channels, and anything touching funds or keys.",
    },
    escalate: ["Production outage", "Suspected security breach, file tampering or leaked secret", "Any unexplained node balance or channel change"],
  },
];

// Reviews every AI deliverable before Stanley sees it.
export const QA_AGENT = {
  name: "Quality Reviewer",
  sources: ["testing/testing-reality-checker.md", "testing/testing-evidence-collector.md"],
  persona: "A skeptical reviewer who defaults to 'needs work' and approves only with evidence: the deliverable must answer the brief, follow the department's quality and security checklists, contain no invented facts or exposed secrets, and be ready for Stanley to review.",
};

const BY_SERVICE = Object.fromEntries(DEPARTMENTS.flatMap((d) => d.services.map((s) => [s, d.id])));

export const departmentForService = (serviceId) => BY_SERVICE[serviceId] || null;
export const findDepartment = (id) => DEPARTMENTS.find((d) => d.id === id) || null;

// Keyword routing used when a task arrives without a service attached.
const ROUTES = [
  ["social", /instagram|tiktok|facebook|linkedin post|post|reel|video|caption|newsletter|blog|content|canva|social|journey update/i],
  ["tech", /website|landing|wordpress|shopify theme|domain|dns|automation|zapier|n8n|make\.com|api|bitcoin|lightning|lnd|bitcoind|channel|macaroon|node|payment link|checkout|bug|csp|deploy|translate|transcri/i],
  ["growth", /customer|community|yebente|ye₿ente|wallet help|tando|minmo|my first bitcoin|support|refund|ticket|lead|prospect|outreach|listing|order|inventory|airbnb|guest|review|research|competitor/i],
  ["personal", /flight|hotel|travel|trip|booking|reservation|gift|restaurant|appointment|event|meetup|bitdevs|seminar|bootcamp|webinar|birthday|errand/i],
  ["admin", /email|inbox|calendar|schedule|meeting|invoice|receipt|statement|backup|grant|btrust|brink|opensats|bookkeep|spreadsheet|excel|data entry|document|crm|hire|recruit|cv|notion|trello|asana/i],
];

export function routeTask(text, hintServiceId) {
  const fromService = hintServiceId && departmentForService(hintServiceId);
  if (fromService) return fromService;
  for (const [dept, re] of ROUTES) if (re.test(text)) return dept;
  return "admin";
}
