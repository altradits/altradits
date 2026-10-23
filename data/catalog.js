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

// Quick jobs: small, stand-alone tasks at prices any small business can say
// yes to. One fixed deliverable each, paid in full, routed to the department
// of the parent service.
const Q = (id, pillar, service, price, name, deliverables, delivery, youSend, keywords) =>
  ({ id, pillar, service, price, name, deliverables, delivery, youSend, keywords, type: "project" });
export const QUICK_JOBS = [
  // social media & content
  Q("q-bio", "social", "social-management", 9, "Profile bio rewrite for 3 platforms", ["A sharp bio for Instagram, LinkedIn and X (or any 3)", "Matching one-line tagline", "1 round of edits"], "1 business day", "Your current bios and what you sell", "bio profile instagram linkedin tagline"),
  Q("q-captions", "social", "social-management", 15, "10 social media captions", ["10 ready-to-post captions in your voice", "Hashtags and a call to action on each", "1 round of edits"], "1 business day", "Your topic or photos", "captions posts hashtags instagram facebook linkedin tiktok"),
  Q("q-schedule", "social", "social-management", 12, "Schedule a week of your posts", ["Up to 7 of your posts scheduled at the best times", "On up to 3 platforms", "A screenshot of the schedule"], "1 business day", "The posts and a safe way to access your accounts", "schedule posting buffer meta planner later"),
  Q("q-graphics", "social", "social-management", 25, "5 branded post graphics", ["5 social media graphics in your brand colours (Canva)", "Sized for your platform", "Editable Canva link included"], "2 business days", "Logo, colours and the text for each post", "graphics design canva images posts flyer banner"),
  Q("q-reel", "social", "short-video", 15, "Edit 1 short video or reel", ["1 video up to 60 seconds, trimmed and cut", "Captions and a hook on screen", "Exported for TikTok, Reels and Shorts"], "2 business days", "Your raw clip", "video reel tiktok shorts edit captions"),
  Q("q-newsletter", "social", "content-writing", 25, "Write 1 newsletter email", ["1 newsletter up to 500 words in your voice", "Subject line and preview text", "1 round of edits"], "2 business days", "Your news, offer or notes", "newsletter email mailchimp campaign"),
  Q("q-blog", "social", "content-writing", 35, "Write 1 blog post (600 words)", ["1 blog post of about 600 words", "Search-friendly title and headings", "1 round of edits"], "2 business days", "The topic and any links", "blog article post seo writing"),
  Q("q-product-copy", "social", "content-writing", 29, "10 product descriptions", ["10 product descriptions that sell (up to 80 words each)", "Search keywords included", "Delivered in a sheet ready to paste"], "2 business days", "Product names, photos or specs", "product descriptions shopify etsy amazon copy"),
  // office administration
  Q("q-data-entry", "admin", "data-docs", 12, "1 hour of data entry", ["1 hour of typing or copying data (about 200 rows)", "Into your sheet, CRM or form", "Spot-checked for errors"], "1 business day", "The source files and where it goes", "data entry typing copy paste crm excel"),
  Q("q-pdf-sheet", "admin", "data-docs", 15, "PDF or scans to spreadsheet", ["Up to 10 pages of PDFs, scans or photos typed into a spreadsheet", "Clean columns and totals checked", "Excel or Google Sheets"], "1 business day", "The files", "pdf convert excel spreadsheet scans table"),
  Q("q-sheet-cleanup", "admin", "data-docs", 19, "Clean up 1 spreadsheet", ["Duplicates removed and formatting fixed (up to 2,000 rows)", "Consistent names, dates and phone numbers", "Filters and a tidy header row"], "1 business day", "The spreadsheet", "spreadsheet excel google sheets clean duplicates format contacts list"),
  Q("q-slides", "admin", "data-docs", 25, "Format a 10-slide presentation", ["Up to 10 slides made clean and consistent", "Your brand fonts and colours", "PowerPoint or Google Slides"], "2 business days", "Your draft slides", "slides powerpoint presentation deck pitch google slides"),
  Q("q-sop", "admin", "data-docs", 25, "Write 1 SOP (how-to guide)", ["1 step-by-step guide from your screen recording or notes", "Screenshots where useful", "Google Doc or PDF"], "2 business days", "A recording or notes of the task", "sop procedure process guide how-to documentation"),
  Q("q-inbox-cleanup", "admin", "inbox-calendar", 29, "One-time inbox clean-up", ["Up to 2,000 emails sorted, labelled or archived", "Unsubscribed from junk lists", "Simple filters so it stays clean"], "2 business days", "Temporary delegated access to your inbox", "inbox email cleanup gmail outlook unsubscribe zero"),
  Q("q-meeting-notes", "admin", "project-coordination", 12, "Meeting notes from a recording", ["Notes from a meeting up to 60 minutes", "Decisions and action items with owners", "Ready to send to attendees"], "1 business day", "The recording link", "meeting notes minutes action items zoom recording"),
  Q("q-invoices", "admin", "bookkeeping-prep", 19, "Invoice template + send 10 invoices", ["A branded invoice template", "Up to 10 invoices prepared and sent", "A sheet of who owes what"], "1 business day", "Client list, amounts and your invoicing tool", "invoice invoices billing template payment reminders"),
  Q("q-receipts", "admin", "bookkeeping-prep", 25, "Match 50 receipts to your statement", ["Up to 50 receipts matched to bank or M-Pesa lines", "Missing receipts listed", "A summary sheet for your accountant"], "2 business days", "Statement and receipts", "receipts bank statement reconcile expenses mpesa bookkeeping"),
  Q("q-job-post", "admin", "hr-recruiting", 19, "Write and post 1 job ad", ["1 clear job ad", "Posted on 2 free job boards", "Applications sent to one inbox"], "1 business day", "Role, pay range and must-haves", "job ad post hiring vacancy recruit"),
  Q("q-cv-screen", "admin", "hr-recruiting", 35, "Screen 30 CVs, shortlist 5", ["Up to 30 CVs scored against your criteria", "Top 5 with one-line notes each", "Polite rejection email template"], "2 business days", "The CVs and your criteria", "cv resume screening shortlist candidates hiring"),
  // personal assistance
  Q("q-booking", "personal", "travel-life", 9, "Book 1 restaurant, appointment or gift", ["3 options with prices; you pick", "Booked or ordered for you", "Confirmation and reminder"], "Same or next business day", "What, when, budget; you approve any payment", "book booking restaurant appointment gift reservation errand"),
  Q("q-trip", "personal", "travel-life", 19, "Trip plan with flights and hotels", ["3 flight and 3 hotel options with prices", "A day-by-day itinerary", "Visa and entry notes"], "1 business day", "Dates, budget and preferences", "travel trip flights hotels itinerary holiday vacation"),
  Q("q-subscriptions", "personal", "travel-life", 19, "Subscription audit + cancel 5", ["Every recurring charge listed with cost", "Up to 5 cancelled for you", "Money saved per year"], "2 business days", "Recent statements; you approve cancellations", "subscriptions cancel bills save money audit recurring"),
  Q("q-rsvp", "personal", "events", 19, "Send invitations and track RSVPs", ["Invitations to up to 50 guests", "RSVPs tracked in one sheet", "1 reminder to non-responders"], "1 business day", "Guest list and event details", "invitations rsvp guests event party wedding meetup"),
  // sales & customer care
  Q("q-leads", "growth", "lead-generation", 29, "25 researched leads", ["25 prospects that match your ideal customer", "Name, role, company and email or profile", "Delivered in a sheet"], "2 business days", "Who your ideal customer is", "leads prospects list emails b2b sales"),
  Q("q-cold-email", "growth", "lead-generation", 19, "3-email outreach sequence", ["A first email and 2 follow-ups", "Subject lines that get opened", "1 round of edits"], "1 business day", "Your offer and audience", "cold email outreach sequence follow up sales"),
  Q("q-reply-templates", "growth", "customer-support", 19, "10 customer reply templates", ["10 ready replies for your most common questions", "Friendly and in your voice", "For email, chat or WhatsApp"], "1 business day", "Your common questions and policies", "customer service replies templates support whatsapp canned responses"),
  Q("q-faq", "growth", "customer-support", 25, "Write your FAQ page", ["Up to 15 questions and answers", "Written to cut support messages", "Ready to paste on your site"], "2 business days", "Your common questions", "faq questions website support page"),
  Q("q-reviews", "growth", "host-assist", 12, "Reply to 20 reviews", ["Replies to up to 20 reviews on Google, Airbnb, Amazon or similar", "Thankful, professional, on-brand", "Posted for you or delivered to paste"], "1 business day", "Access or a list of the reviews", "reviews replies google airbnb amazon reputation"),
  Q("q-listings", "growth", "ecommerce-ops", 25, "Upload or improve 10 product listings", ["10 listings added or improved on your store", "Titles, descriptions, tags and photos placed", "Checked live"], "2 business days", "Store access and product info", "listings products upload shopify etsy amazon jumia store"),
  Q("q-competitors", "growth", "research", 29, "Compare 5 competitors", ["5 competitors compared in a one-page table", "Prices, offers and what they do better", "3 ideas you can use"], "2 business days", "Your business and any competitors you know", "competitors research compare market analysis"),
  Q("q-suppliers", "growth", "research", 25, "Find 5 suppliers", ["5 suppliers with prices, minimum orders and contacts", "Reliability notes for each", "One-page table"], "2 business days", "What you need and where", "suppliers sourcing manufacturers wholesale vendors"),
  // web, automation & bitcoin
  Q("q-email-signature", "tech", "website", 9, "Professional email signature", ["A clean email signature with logo and links", "Installed in Gmail or Outlook, or sent to paste", "Works on mobile"], "1 business day", "Logo and details to show", "email signature gmail outlook branding"),
  Q("q-site-fix", "tech", "website", 19, "Fix 1 website issue", ["1 fix: broken link, text or image change, or small bug", "Tested on phone and desktop", "Before and after screenshot"], "1 business day", "The page and what to change, plus access", "website fix bug broken update text image wordpress"),
  Q("q-google-profile", "tech", "website", 25, "Google Business Profile setup", ["Profile set up or completed: hours, photos, services", "Categories and description for local search", "Review link to share with customers"], "2 business days", "Business details and photos", "google business profile maps local seo listing"),
  Q("q-business-email", "tech", "website", 25, "Business email on your domain", ["Email like you@yourbusiness.com set up (up to 3 mailboxes)", "Works on phone and computer", "Spam settings done so emails land"], "2 business days", "Domain access and the provider you prefer", "business email domain google workspace zoho professional email"),
  Q("q-automation", "tech", "automation-ai", 29, "1 simple automation", ["1 two-step automation, e.g. form to spreadsheet or new order to email", "Zapier, Make or n8n", "Tested, with a failure alert"], "2 business days", "The two apps and access to them", "automation zapier make n8n integrate form sheet"),
  Q("q-lightning", "tech", "bitcoin", 15, "Get a Lightning address to accept Bitcoin", ["A Lightning wallet and address set up for your business", "A QR to show customers", "A 30-minute walkthrough. Your keys stay with you"], "1 business day", "Your phone", "bitcoin lightning wallet accept payments qr"),
  Q("q-transcribe", "tech", "translation", 9, "Transcribe 15 minutes of audio", ["Up to 15 minutes transcribed", "Speaker names and timestamps", "Checked by a person"], "1 business day", "The audio or video file", "transcribe transcription audio interview podcast"),
  Q("q-translate", "tech", "translation", 9, "Translate 1 page (300 words)", ["Up to 300 words translated", "English, Swahili, French and other major languages", "Checked by a person"], "1 business day", "The text", "translate translation swahili french document"),
];

export function findQuick(id) {
  return QUICK_JOBS.find((q) => q.id === id);
}

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
  const q = findQuick(id);
  if (q) return { id, kind: "quick", name: q.name, price: q.price, type: "project", service: q.service, draft: { quick_id: id },
    deliverables: q.deliverables, delivery: q.delivery, youSend: q.youSend };
  const svc = findService(id);
  if (svc) return { id, kind: "service", service: id, name: svc.name, price: svc.price, type: svc.type, draft: { service_id: id },
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
