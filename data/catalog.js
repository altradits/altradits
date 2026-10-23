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
  referralCreditPct: 10,       // referrer earns this % of the new client's first month as credit
  // Altra misuse guard: chats that look abusive, automated or off-purpose are
  // paused until this many sats are paid over Lightning (proves a real person).
  humanCheckSats: 100,
  maxTurnsUnqualified: 20,     // messages without an email or proposal before the check
  maxTurnsVerified: 40,        // more room after someone has paid the check
  maxAiTurnsPerDay: 400,       // hard ceiling on AI chat turns per day across all visitors
};

export const PILLARS = [
  { id: "social", name: "Social media & content", color: "#E11D74" },
  { id: "admin", name: "Office administration", color: "#2F5BEA" },
  { id: "personal", name: "Personal assistance", color: "#12A37F" },
  { id: "growth", name: "Sales & customer care", color: "#E4572E" },
  { id: "tech", name: "Web, automation & Bitcoin", color: "#8B5CF6" },
];

// Every service is a fixed scope at a fixed price: what you see is what you
// pay, and payment places the order. type: "monthly" (billed each month) or
// "project" (one-off). deliverables are exactly what the client receives;
// delivery is when; youSend is what we need from them; keywords help search.
const S = (o) => ({ ...o, includes: o.deliverables.join("; ") });
export const SERVICES = [
  S({ id: "social-management", pillar: "social", type: "monthly", price: 450, unit: "/mo",
    name: "Social media management",
    outcome: "You show up every week on the platforms your buyers use, without thinking about it.",
    deliverables: ["12 posts a month on up to 3 platforms, written and designed in your brand", "A content calendar for your OK before each month starts", "Scheduling and publishing", "Replies to comments and DMs on weekdays", "A one-page results report every month"],
    delivery: "First calendar within 3 business days, then every month",
    youSend: "Your social logins (shared safely), logo and brand colours",
    keywords: "instagram facebook linkedin tiktok x twitter posts captions content calendar social" }),
  S({ id: "content-writing", pillar: "social", type: "project", price: 120,
    name: "Newsletter, blog post or web copy",
    outcome: "One piece of writing that sounds like you and gets replies.",
    deliverables: ["1 newsletter, blog post, product description set or page of copy (up to 1,000 words)", "Written in your voice from your notes or a short brief", "Search basics: title, headings and keywords", "1 round of edits"],
    delivery: "3 business days",
    youSend: "The topic and any notes, links or examples",
    keywords: "write writing blog article newsletter email copy copywriting bio product descriptions" }),
  S({ id: "short-video", pillar: "social", type: "monthly", price: 380, unit: "/mo",
    name: "Short video & reels editing",
    outcome: "Your raw clips become 8 polished short videos a month.",
    deliverables: ["8 short videos a month (up to 60 seconds each)", "Captions, a hook and a thumbnail on every video", "Posting to TikTok, Reels and Shorts", "1 round of edits per video"],
    delivery: "First 2 videos within 5 business days",
    youSend: "Your raw clips (a shared folder link)",
    keywords: "video reels tiktok shorts youtube editing edit clips captions" }),
  S({ id: "inbox-calendar", pillar: "admin", type: "monthly", price: 349, unit: "/mo",
    name: "Inbox & calendar management",
    outcome: "You only see the emails that need you.",
    deliverables: ["Your inbox sorted every weekday: needs you, handled, can wait", "Same-day replies to routine emails, from templates you approve", "Meetings scheduled and your calendar kept tidy", "A 5-line summary every weekday"],
    delivery: "Starts within 2 business days of access",
    youSend: "Delegated access to your email and calendar",
    keywords: "email inbox gmail outlook calendar schedule meetings appointments replies" }),
  S({ id: "data-docs", pillar: "admin", type: "project", price: 90,
    name: "Data entry, documents & spreadsheets",
    outcome: "Clean spreadsheets, tidy folders and documents you can find.",
    deliverables: ["Up to 3 hours of data entry, spreadsheet clean-up, formatting, slides or document work", "Delivered as Google Sheets/Docs, Excel, Word or PowerPoint", "A short note of what was changed"],
    delivery: "2 business days",
    youSend: "The files or a shared folder link",
    keywords: "data entry excel spreadsheet google sheets crm documents word pdf slides powerpoint formatting files sop" }),
  S({ id: "bookkeeping-prep", pillar: "admin", type: "monthly", price: 290, unit: "/mo",
    name: "Invoicing & bookkeeping prep",
    outcome: "Your numbers are tidy before your accountant asks.",
    deliverables: ["Up to 40 invoices a month sent and chased", "Receipts matched to bank, mobile money and wallet records", "A monthly summary sheet for your accountant", "Your accountant does the final sign-off"],
    delivery: "Every month; first summary at the end of month one",
    youSend: "Read-only access to your invoicing tool and statements",
    keywords: "invoice invoicing bookkeeping receipts accounts quickbooks xero expenses reconciliation finance mpesa" }),
  S({ id: "project-coordination", pillar: "admin", type: "monthly", price: 520, unit: "/mo",
    name: "Project & operations coordination",
    outcome: "Deadlines stop slipping through the cracks.",
    deliverables: ["Your project board (Notion, Trello, Asana or ClickUp) kept up to date", "Updates chased from your team every week", "Meeting notes with action items within 24 hours", "A status note every Friday"],
    delivery: "Starts within 2 business days of access",
    youSend: "Access to your board and the team's contacts",
    keywords: "project management operations notion trello asana clickup team meetings notes deadlines" }),
  S({ id: "hr-recruiting", pillar: "admin", type: "project", price: 350,
    name: "Hire for one role",
    outcome: "A shortlist of good candidates without reading 200 CVs.",
    deliverables: ["A job post written and published on up to 3 job boards", "Every CV screened against your criteria", "A shortlist of up to 5 candidates with notes", "Interviews scheduled for the shortlist", "An offer letter template"],
    delivery: "Shortlist within 10 business days",
    youSend: "The role, salary range and must-haves",
    keywords: "hiring recruit recruiting hr job post cv resume candidates interview staff employee" }),
  S({ id: "travel-life", pillar: "personal", type: "monthly", price: 299, unit: "/mo",
    name: "Personal assistant",
    outcome: "Life admin handled while you work.",
    deliverables: ["Up to 10 errands a month: travel, bookings, appointments, gifts, bills, subscriptions", "3 options with prices for anything you buy, and you pick", "Reminders for renewals and important dates", "Everything done online"],
    delivery: "Each request handled within 1 business day",
    youSend: "Your preferences, and payment approval for anything bought",
    keywords: "travel flights hotel booking restaurant appointments gifts errands bills personal family life admin" }),
  S({ id: "executive-assist", pillar: "personal", type: "monthly", price: 690, unit: "/mo",
    name: "Executive & chief-of-staff support",
    outcome: "One person holds all the context so you can think.",
    deliverables: ["Daily triage of your requests and priorities", "A prep brief before each important meeting", "Follow-ups sent after meetings", "A monthly board or investor update draft", "A Monday plan for your week"],
    delivery: "Starts within 2 business days",
    youSend: "Access to your email and calendar, and your top 3 goals",
    keywords: "executive assistant chief of staff ceo founder board investor update priorities meeting prep" }),
  S({ id: "events", pillar: "personal", type: "project", price: 250,
    name: "Plan one event or webinar",
    outcome: "An event that runs smoothly from invite to follow-up.",
    deliverables: ["1 event, online or in person, up to 100 guests", "Platform or venue setup and invitations", "RSVP tracking and 2 reminder emails", "A run-of-show document", "A follow-up email to guests afterwards"],
    delivery: "Plan within 3 business days",
    youSend: "Date, audience and budget",
    keywords: "event webinar meetup zoom conference party invitations rsvp" }),
  S({ id: "customer-support", pillar: "growth", type: "monthly", price: 420, unit: "/mo",
    name: "Customer support desk",
    outcome: "Customers get fast, kind answers.",
    deliverables: ["Email, chat and WhatsApp replies, up to 300 conversations a month", "Order tracking, and refunds within your written rules", "Replies within 4 business hours", "Your FAQ updated monthly", "A monthly report of top questions"],
    delivery: "Starts within 3 business days",
    youSend: "Access to your help inbox and your refund rules",
    keywords: "customer support service helpdesk replies tickets whatsapp chat refunds complaints" }),
  S({ id: "lead-generation", pillar: "growth", type: "project", price: 300,
    name: "100 leads + outreach messages",
    outcome: "A list of real prospects and messages that start conversations.",
    deliverables: ["100 researched leads that match your ideal customer, with a verified email or profile", "A personalised first message and 2 follow-ups", "Everything in a simple pipeline sheet"],
    delivery: "5 business days",
    youSend: "Who your ideal customer is",
    keywords: "leads lead generation prospects outreach cold email sales list linkedin b2b pipeline" }),
  S({ id: "ecommerce-ops", pillar: "growth", type: "monthly", price: 480, unit: "/mo",
    name: "E-commerce & marketplace ops",
    outcome: "Listings live, orders out and stock counted.",
    deliverables: ["Up to 30 new or updated product listings a month (Shopify, Etsy, Amazon or Jumia)", "Daily order processing and customer updates", "A weekly stock check", "Supplier emails"],
    delivery: "Starts within 2 business days of access",
    youSend: "Store access and your supplier contacts",
    keywords: "ecommerce shopify etsy amazon jumia products listings orders inventory stock store" }),
  S({ id: "host-assist", pillar: "growth", type: "monthly", price: 260, unit: "/mo",
    name: "Airbnb & short-let host assistant",
    outcome: "Five-star guest communication without the 2 a.m. messages.",
    deliverables: ["Guest messaging for up to 3 listings", "Check-in instructions and house rules sent to every guest", "Cleaners scheduled between stays", "A reply to every review", "A monthly pricing check against nearby listings"],
    delivery: "Starts within 2 business days of access",
    youSend: "Access to your host account and cleaner contacts",
    keywords: "airbnb booking.com host guests short let rental property cleaners reviews" }),
  S({ id: "research", pillar: "growth", type: "project", price: 180,
    name: "Research report (one page)",
    outcome: "A one-page answer you can decide from.",
    deliverables: ["1 question answered in a one-page report", "Up to 10 sources, each rated for reliability", "A clear recommendation, and what we couldn't find"],
    delivery: "3 business days",
    youSend: "Your question and why it matters",
    keywords: "research market competitors suppliers tools compare report analysis" }),
  S({ id: "website", pillar: "tech", type: "project", price: 600,
    name: "Website or landing page",
    outcome: "A site that explains what you do in five seconds and gets people to contact you.",
    deliverables: ["1 landing page or a site of up to 5 pages", "Plain-language copy written for you", "Mobile-friendly, fast and accessible", "Contact form and search basics", "Launched on your domain, plus 14 days of fixes"],
    delivery: "10 business days",
    youSend: "Your logo, photos and domain login",
    keywords: "website web site landing page wordpress design redesign domain seo" }),
  S({ id: "store-payments", pillar: "tech", type: "project", price: 900,
    name: "Online store & payments",
    outcome: "Customers pay the way they prefer and every order matches a real payment.",
    deliverables: ["An online store or checkout on your platform", "Up to 20 products added", "Card, mobile money and Bitcoin payments", "Tested with real and failed payments before launch"],
    delivery: "15 business days",
    youSend: "Product list, photos and payment account details (entered by you)",
    keywords: "online store shop checkout payments stripe mpesa card ecommerce sell" }),
  S({ id: "automation-ai", pillar: "tech", type: "project", price: 350,
    name: "One automation or AI assistant",
    outcome: "A repetitive job runs on its own and tells you when it fails.",
    deliverables: ["1 automation (Zapier, Make or n8n) or 1 AI assistant", "Failure alerts to your email", "A one-page description and an off switch", "30 days of fixes"],
    delivery: "5 business days",
    youSend: "The task you want automated and access to the tools involved",
    keywords: "automation automate zapier make n8n ai agent chatbot workflow integration" }),
  S({ id: "bitcoin", pillar: "tech", type: "project", price: 250,
    name: "Bitcoin & Lightning setup",
    outcome: "You accept Bitcoin and your books stay clean.",
    deliverables: ["Lightning invoicing or a checkout for your business", "An accounting sheet in your local currency", "A 1-hour live wallet and backup session", "Your keys stay with you: we never hold them"],
    delivery: "5 business days",
    youSend: "Where you sell (website, shop, invoices)",
    keywords: "bitcoin lightning crypto btc wallet payments accept" }),
  S({ id: "translation", pillar: "tech", type: "project", price: 60,
    name: "Transcription or translation",
    outcome: "Meetings, interviews and documents in the words you need.",
    deliverables: ["1 hour of audio transcribed with timestamps, or 1,000 words translated", "A short summary", "Checked by a person"],
    delivery: "2 business days",
    youSend: "The audio file or document",
    keywords: "transcription transcribe translation translate swahili french audio interview subtitles" }),
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

export const PAYG = { hourly: 25, minimumHours: 2,
  deliverables: ["2 hours of any task from the list above", "Done within 2 business days", "A note of what was done and the time used"] };

export const GUARANTEES = [
  { name: "Fixed price, fixed scope", text: "You pay the price shown for exactly what's listed. No hidden fees, no surprises." },
  { name: "Fixed-scope promise", text: "If what I deliver doesn't match the proposal, I fix it free for 14 days after handover." },
  { name: "Cancel any month", text: "Retainers are month to month. Unused hours roll over once." },
];

// Everything a visitor can buy straight from the site, by id.
export function orderable(id) {
  const pkg = findPackage(id);
  if (pkg) return { id, kind: "package", name: `${pkg.name} plan (${pkg.hours} hrs/month)`, price: pkg.price, type: "monthly", draft: { package_id: id },
    deliverables: pkg.features, delivery: "Kick-off within 48 hours; billed monthly" };
  if (id === "hourly") return { id, kind: "hourly", name: `Pay as you go (${PAYG.minimumHours} hours)`, price: PAYG.hourly * PAYG.minimumHours, type: "project",
    draft: { service_id: "hourly", quantity: PAYG.minimumHours }, deliverables: PAYG.deliverables, delivery: "2 business days" };
  const svc = findService(id);
  if (svc) return { id, kind: "service", name: svc.name, price: svc.price, type: svc.type, draft: { service_id: id },
    deliverables: svc.deliverables, delivery: svc.delivery, youSend: svc.youSend };
  return null;
}

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
