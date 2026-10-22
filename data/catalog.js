// Single source of truth for services, prices and business settings.
// Imported by the website (as an ES module) and by the API agents, so a price
// changed here changes everywhere. All prices are USD.

export const BUSINESS = {
  name: "Altradits",
  owner: "Stanley",
  email: "altradits@gmail.com",
  whatsapp: "254707172370",
  timezone: "Africa/Nairobi (UTC+3)",
  // Paste a Cal.com / Calendly link to let the concierge offer self-serve calls.
  bookingUrl: "",
  siteUrl: "https://altradits.com",
};

// Agent autonomy limits. Anything outside these goes to Stanley for approval.
export const RULES = {
  autoApproveLimitUsd: 2000,   // proposals at or under this total go straight to the client
  maxDiscountPct: 10,          // only for 3-month prepay or 3+ services bundled
  depositPctProjects: 50,      // one-off projects: 50% to start
  freeTrialMaxHours: 1,        // the free sample task
};

export const PILLARS = [
  { id: "social", name: "Social media & content", color: "#E11D74" },
  { id: "admin", name: "Office administration", color: "#2F5BEA" },
  { id: "personal", name: "Personal assistance", color: "#12A37F" },
  { id: "growth", name: "Sales & customer care", color: "#E4572E" },
  { id: "tech", name: "Web, automation & Bitcoin", color: "#8B5CF6" },
];

// type: "monthly" recurring or "project" one-off. price = starting price.
export const SERVICES = [
  { id: "social-management", pillar: "social", type: "monthly", price: 450, unit: "/mo",
    name: "Social media management",
    outcome: "Show up every week on the platforms your buyers use, without thinking about it.",
    includes: "Content calendar in your voice, 12 posts a month across up to 3 platforms, scheduling, comment and DM replies, and a monthly one-page results report." },
  { id: "content-writing", pillar: "social", type: "project", price: 120,
    name: "Newsletters, blogs & copy",
    outcome: "Words that sound like you and get replies.",
    includes: "Newsletters sent only to people who opted in, blog posts with search basics, product descriptions and profile bios. Price is per piece." },
  { id: "short-video", pillar: "social", type: "monthly", price: 380, unit: "/mo",
    name: "Short video & reels editing",
    outcome: "Your raw clips become 8 polished shorts a month.",
    includes: "Captions, hooks, thumbnails, and posting to TikTok, Reels and Shorts." },
  { id: "inbox-calendar", pillar: "admin", type: "monthly", price: 349, unit: "/mo",
    name: "Inbox & calendar management",
    outcome: "You only see the emails that need you.",
    includes: "Three piles: needs you now, handled, can wait. Same-day replies from templates in your voice, scheduling, and a daily 5-line summary." },
  { id: "data-docs", pillar: "admin", type: "project", price: 90,
    name: "Data entry, documents & spreadsheets",
    outcome: "Clean spreadsheets, tidy folders and documents you can find.",
    includes: "CRM clean-up, data entry, file organisation, formatting reports, slides and SOP write-ups." },
  { id: "bookkeeping-prep", pillar: "admin", type: "monthly", price: 290, unit: "/mo",
    name: "Invoicing & bookkeeping prep",
    outcome: "Your numbers are tidy before your accountant asks.",
    includes: "Invoices sent and chased, receipts matched to bank, mobile money or wallet records, and a monthly summary. Your accountant signs off." },
  { id: "project-coordination", pillar: "admin", type: "monthly", price: 520, unit: "/mo",
    name: "Project & operations coordination",
    outcome: "Deadlines stop slipping through the cracks.",
    includes: "Running your Notion, Trello, Asana or ClickUp, chasing updates, meeting notes with action items, and a weekly status note." },
  { id: "hr-recruiting", pillar: "admin", type: "project", price: 350,
    name: "Recruiting & HR admin",
    outcome: "A shortlist of good candidates without reading 200 CVs.",
    includes: "Job posts, CV screening against your criteria, interview scheduling, offer and onboarding documents." },
  { id: "travel-life", pillar: "personal", type: "monthly", price: 299, unit: "/mo",
    name: "Personal assistant",
    outcome: "Life admin handled while you work.",
    includes: "Travel research and booking, appointments, reservations, gifts, reminders, bills, subscriptions and family logistics, all done online." },
  { id: "executive-assist", pillar: "personal", type: "monthly", price: 690, unit: "/mo",
    name: "Executive & chief-of-staff support",
    outcome: "One person holds all the context so you can think.",
    includes: "Priorities triage, meeting prep briefs, follow-ups, board and investor updates, and a Monday plan for your week." },
  { id: "events", pillar: "personal", type: "project", price: 250,
    name: "Events, meetups & webinars",
    outcome: "An event that runs smoothly from invite to follow-up.",
    includes: "Venue or platform setup, invites, RSVPs, run-of-show, reminders and post-event follow-up emails." },
  { id: "customer-support", pillar: "growth", type: "monthly", price: 420, unit: "/mo",
    name: "Customer support desk",
    outcome: "Customers get fast, kind answers, even overnight.",
    includes: "Email, chat and WhatsApp replies, order tracking, refunds within your rules, and an FAQ that keeps improving." },
  { id: "lead-generation", pillar: "growth", type: "project", price: 300,
    name: "Lead lists & outreach",
    outcome: "A list of real prospects and messages that start conversations.",
    includes: "Researched lead lists, personalised outreach drafts, follow-up sequences and a simple pipeline tracker." },
  { id: "ecommerce-ops", pillar: "growth", type: "monthly", price: 480, unit: "/mo",
    name: "E-commerce & marketplace ops",
    outcome: "Listings live, orders out and stock counted.",
    includes: "Product listings on Shopify, Etsy, Amazon or Jumia, order processing, inventory checks and supplier emails." },
  { id: "host-assist", pillar: "growth", type: "monthly", price: 260, unit: "/mo",
    name: "Airbnb & short-let host assistant",
    outcome: "Five-star guest communication without the 2 a.m. messages.",
    includes: "Guest messaging, check-in instructions, cleaner scheduling, review replies and pricing checks." },
  { id: "research", pillar: "growth", type: "project", price: 180,
    name: "Research & one-page reports",
    outcome: "A one-page answer you can decide from.",
    includes: "Market, competitor, supplier or tool research with sources rated for reliability. Gaps are stated plainly." },
  { id: "website", pillar: "tech", type: "project", price: 600,
    name: "Websites & landing pages",
    outcome: "A page that explains what you do in five seconds and gets people to contact you.",
    includes: "Plain-language copy, mobile-first, fast, accessible, with search basics set up from day one. Small fixes from $150." },
  { id: "store-payments", pillar: "tech", type: "project", price: 900,
    name: "Online store & payments",
    outcome: "Customers pay the way they prefer and every order matches a real payment.",
    includes: "Hosted checkout, card, mobile money and Bitcoin, tested with failed payments before going live." },
  { id: "automation-ai", pillar: "tech", type: "project", price: 350,
    name: "Automations & AI agents for your business",
    outcome: "Repetitive work runs on its own and tells you when it fails.",
    includes: "Zapier, Make or n8n workflows and AI assistants like the one on this site, each with failure alerts, a written description and an off switch." },
  { id: "bitcoin", pillar: "tech", type: "project", price: 250,
    name: "Bitcoin & Lightning setup",
    outcome: "Accept Bitcoin and keep the books clean.",
    includes: "Lightning invoices or a checkout, accounting sheet in local currency, and a one-hour wallet and backup session. I never hold your keys." },
  { id: "translation", pillar: "tech", type: "project", price: 60,
    name: "Transcription & translation",
    outcome: "Meetings, interviews and documents in the words you need.",
    includes: "Transcripts with timestamps, summaries, and translation between English, Swahili and major languages with a human check. Price per hour of audio or per 1,000 words." },
];

// Monthly retainers: blended hours across any services above.
export const PACKAGES = [
  { id: "lite", name: "Lite", price: 349, hours: 15,
    pitch: "For one recurring job you want off your plate.",
    features: ["15 hours a month", "1 service area", "Replies within one business day", "Monthly summary"] },
  { id: "core", name: "Core", price: 749, hours: 35, popular: true,
    pitch: "For owners who want a dependable right hand.",
    features: ["35 hours a month", "Up to 3 service areas", "Same-day replies", "Weekly status note", "Shared task board"] },
  { id: "partner", name: "Partner", price: 1390, hours: 70,
    pitch: "Fractional operations: inbox to invoices to social.",
    features: ["70 hours a month", "All service areas", "Priority same-day turnaround", "Daily summary + Monday plan", "Monthly strategy call"] },
];

export const PAYG = { hourly: 25, minimumHours: 2 };

export const GUARANTEES = [
  { name: "First task free", text: "Send one real task (up to an hour). If you don't like the result, we part as friends." },
  { name: "Fixed-scope promise", text: "If what I deliver doesn't match the proposal, I fix it free for 14 days after handover." },
  { name: "Cancel any month", text: "Retainers are month to month. Unused hours roll over once." },
];

// Public payment details shown after a client accepts a proposal.
// Leave a field empty to hide that method.
export const PAYMENTS = {
  lightningAddress: "potablesignal21@walletofsatoshi.com",
  lnurl: "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhqmm5v93xcetnd9nkuctvxgcsm55zyn",
  mpesa: "",       // e.g. "Send to 07xx xxx xxx (Stanley C.)"
  paypal: "",      // e.g. "https://paypal.me/yourname"
  wise: "",        // e.g. "https://wise.com/pay/me/yourname"
  cardLink: "",    // e.g. a Stripe Payment Link
};

// Delegation quiz maths, shared by the website and the welcome email.
// Assumes we can take ~70% of the listed hours off the owner's plate.
export function recommend(hoursPerWeek, hourValue = 0) {
  const monthly = Math.round(hoursPerWeek * 4.33 * 0.7);
  const pkg = monthly <= 15 ? PACKAGES[0] : monthly <= 35 ? PACKAGES[1] : PACKAGES[2];
  return { hoursBack: monthly, valueBack: Math.round(monthly * hourValue), pkg };
}

export function findService(id) {
  return SERVICES.find((s) => s.id === id);
}

export function findPackage(id) {
  return PACKAGES.find((p) => p.id === id);
}
