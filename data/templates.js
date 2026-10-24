// Free kits: complete, step-by-step templates for the jobs owners struggle
// with most. They're the top of the funnel: a visitor leaves an email to
// download one, joins the list tagged with that kit's topic, and the follow-up
// emails (lib/subscribers.js) walk them up the ladder:
//
//   DIY  Do it yourself   the free kit
//   DIT  Do it together   you start with the kit, we finish it with you (pay-as-you-go hours)
//   DFY  Done for you     the quick job or service that does it all
//
// Offers are catalog ids, so prices always match the shop.

export const LADDER = [
  { id: "diy", code: "DIY", name: "Do it yourself", line: "The free kit: every step and template you need." },
  { id: "dit", code: "DIT", name: "Do it together", line: "Start with the kit; we finish and polish it with you." },
  { id: "dfy", code: "DFY", name: "Done for you", line: "Hand it over. Fixed price, done the same day." },
];

const INBOX = `# Inbox Zero in 60 Minutes
A step-by-step kit to clear your inbox in one hour and keep it under control in 15 minutes a day. Works with Gmail and Outlook.

## What you need
- 60 minutes without meetings
- Your laptop (the phone app is too slow for bulk work)
- This kit open next to your inbox

## Step 1 (10 min): Archive the backlog safely
Archiving is not deleting: everything stays searchable. Archive anything you haven't needed in 30 days.
- Gmail: search older_than:30d in:inbox, tick the select-all box, choose "Select all conversations", then Archive.
- Outlook: create a folder called Archive 2026, search received:<30 days ago, select all, Move to Archive 2026.
- Do the same for promotions: Gmail search category:promotions in:inbox, Outlook use the Other tab.
Your inbox now holds only the last 30 days.

## Step 2 (10 min): Unsubscribe sweep
- Search the word unsubscribe. Sort by sender.
- Unsubscribe from every list you haven't opened in a month. Gmail shows an Unsubscribe link next to the sender name.
- Target: 10 lists gone. That is roughly 50 fewer emails a week for most people.

## Step 3 (10 min): Three labels, nothing more
Create three labels (Gmail) or folders (Outlook):
- 1 Act: needs a reply or action from you
- 2 Waiting: you've replied and are waiting on someone
- 3 Reference: receipts, confirmations, things to keep
The numbers keep them at the top of the list. Everything else gets archived.

## Step 4 (15 min): Process the last 30 days
Open the oldest email and decide in under 30 seconds:
- Under 2 minutes to answer? Reply now, then archive.
- Needs work? Label 1 Act and archive it out of the inbox.
- Waiting on someone? Label 2 Waiting and archive.
- Worth keeping? Label 3 Reference and archive.
- Nothing to do? Archive.
When you reach the newest email, your inbox is empty.

## Step 5 (10 min): Five filters that keep it clean
- Receipts: from contains receipt OR invoice OR "order confirmation" -> label 3 Reference, skip the inbox.
- Newsletters you keep: from the sender -> label Read later, skip the inbox.
- Calendar replies: subject contains Accepted: OR Declined: -> archive.
- Social notifications: from LinkedIn, Facebook, X -> skip the inbox.
- Your most important client or boss: from their address -> star and mark important.
Gmail: Settings > Filters and blocked addresses. Outlook: Settings > Mail > Rules.

## Twelve reply templates
Save these as Gmail templates (Settings > Advanced > Templates) or Outlook Quick Parts.

**1. Acknowledge, reply later**
Thanks, [Name]. Got this. I'll come back to you by [day] with a full answer.

**2. Say no politely**
Thanks for thinking of me, [Name]. I can't take this on right now, but I hope it goes well.

**3. Ask for what's missing**
Happy to help. To do this properly I need [item 1] and [item 2]. Could you send them over?

**4. Book a time**
Let's talk it through. Here are two slots that work for me: [option 1] or [option 2]. Pick whichever suits you.

**5. Follow up (no reply)**
Hi [Name], bumping this in case it got buried. Is [question] still on your side?

**6. Send a document**
Hi [Name], attached is [document]. The key point is on page [x]: [one line]. Shout if anything's unclear.

**7. Confirm next steps after a call**
Thanks for the call. To confirm: I'll [action] by [date], and you'll [action] by [date].

**8. Price question**
Thanks for asking. [Service] is [price], and it includes [what's included]. Want me to set it up?

**9. Delay notice**
Quick heads-up: [task] will be ready on [new date] instead of [old date], because [short reason]. Sorry for the wait.

**10. Thank you**
Thank you, [Name]. I really appreciate [specific thing].

**11. Introduce two people**
[Name A], meet [Name B]. [B] does [what], which I think could help with [reason]. I'll let you two take it from here.

**12. Out of office**
Thanks for your email. I'm away until [date] with limited access. For anything urgent, contact [name] at [email].

## The daily 15-minute routine
- Check email twice a day, for example 10:00 and 16:00, not first thing in the morning.
- Work the 1 Act label top to bottom.
- Glance at 2 Waiting: anything older than 3 days gets template 5.
- Close the tab when you're done.

## The weekly 10-minute review
- Archive anything in 1 Act that no longer matters.
- Unsubscribe from anything new and noisy.
- Check your filters still catch what they should.

## Checklist
- [ ] Backlog older than 30 days archived
- [ ] 10 lists unsubscribed
- [ ] 3 labels created
- [ ] Last 30 days processed
- [ ] 5 filters running
- [ ] Reply templates saved
- [ ] Two email times blocked in your calendar`;

const SOCIAL = `# 30-Day Social Media Content Kit
Plan a month of posts in one afternoon and never stare at a blank caption again. Includes a 30-day calendar (spreadsheet) and 30 caption formulas.

## Step 1 (15 min): Pick three content pillars
A pillar is a topic you'll post about again and again. Three is enough:
- Teach: tips, how-tos, mistakes to avoid in your field
- Show: behind the scenes, your process, your team, your workspace
- Sell: your product or service, offers, results you can prove
Write one sentence for each, specific to your business.

## Step 2 (5 min): Choose a rhythm you can keep
- Starting out: 3 posts a week (Monday Teach, Wednesday Show, Friday Sell)
- Growing: 5 posts a week
Consistency beats volume. A month of 3 a week beats two weeks of daily posts and then silence.

## Step 3 (60 min): Fill the calendar
Open the 30-day calendar spreadsheet in this kit. It already has a pillar and a format for each day. For each row, write a one-line hook idea. Don't write captions yet.

## Step 4 (90 min): Batch-write captions
Write all captions in one sitting using the formulas below. Batching takes a third of the time of writing day by day.

## 30 caption formulas
**Teach**
1. The mistake: "Most [audience] [common mistake]. Do [better thing] instead."
2. The steps: "How to [result] in [number] steps: 1... 2... 3..."
3. The myth: "Myth: [belief]. Truth: [reality]."
4. The tool: "The one tool I use for [task]: [tool], because [reason]."
5. The checklist: "Before you [action], check these [number] things."
6. The question we hear most: "People always ask [question]. Here's the honest answer."
7. The comparison: "[Option A] vs [Option B]: which is right for you?"
8. The number: "[Number] [things] that [result]."
9. The shortcut: "Save [time] on [task] with this."
10. The warning: "Stop [doing thing] until you've read this."

**Show**
11. The day: "A day in our [business]: [morning], [afternoon], [evening]."
12. The process: "What happens after you order: [step 1], [step 2], [step 3]."
13. The workspace: "Where the work happens. [Detail about the space]."
14. The team: "Meet [name], who [does what]. Ask them anything."
15. The why: "Why we started: [short story]."
16. The before and after: "Before: [state]. After: [state]."
17. The lesson: "Something I learned the hard way: [lesson]."
18. The milestone: "This week we [milestone]. Thank you for [what]."
19. The tools: "The [number] tools that run our business."
20. The honest moment: "Not every day goes to plan. Here's what went wrong and what we changed."

**Sell**
21. The offer: "[Product], [price], [what's included]. [How to get it]."
22. The problem: "Tired of [pain]? [Product] fixes it by [how]."
23. The question: "Would [result] change your week? [Product] does exactly that."
24. The objection: "'It's too expensive.' Here's what it actually costs you not to."
25. The deadline: "[Offer] closes on [date]." (Only if it's true.)
26. The proof: "[Specific result you can show]." (Only real results.)
27. The how-to-buy: "Getting started takes [time]: [step 1], [step 2]."
28. The FAQ: "Three things people ask before buying [product]."
29. The small start: "Not ready for [big offer]? Start with [small offer]."
30. The invitation: "If [situation] sounds like you, [call to action]."

## Step 5 (30 min): Schedule it
- Meta Business Suite schedules Facebook and Instagram for free.
- LinkedIn lets you schedule posts natively (the clock icon).
- Use the Status column in the spreadsheet: Drafted, Scheduled, Posted.

## Hashtags in 5 minutes
- Use 3 to 5 specific hashtags, not 30 generic ones.
- One about your topic, one about your audience, one about your location or niche.
- Keep a list in the spreadsheet and reuse it.

## Measure once a month
- Which pillar got the most comments and saves?
- Which posts brought messages or sales?
- Do more of what worked next month.

## Checklist
- [ ] Three pillars written
- [ ] Rhythm chosen
- [ ] 30 hook ideas in the calendar
- [ ] Captions batch-written
- [ ] Posts scheduled
- [ ] Monthly review in your calendar`;

const INVOICES = `# Get Paid on Time Kit
Everything you need to invoice properly, chase late payments without awkwardness, and close your books each month. Includes an invoice tracker spreadsheet.

## Part 1: The invoice
Every invoice needs these, or payment gets delayed:
- Your business name, address and contact email
- The client's name and billing address
- A unique invoice number (for example 2026-001, 2026-002)
- Issue date and due date
- What you did, line by line, with quantity, rate and amount
- Total, currency, and any tax shown separately if you charge it
- How to pay: bank details, payment link or wallet
- Payment terms in one line

## Payment terms that work
Pick one and put it on every invoice and quote:
- "Payment due within 7 days of the invoice date."
- "50% due before work starts, 50% on delivery."
- "Due on receipt." (for small jobs)
Shorter terms get paid faster. Avoid "Net 30" unless the client insists.

## Part 2: Four reminder emails
Send them on schedule. Polite and predictable is what gets you paid.

**3 days before the due date**
Subject: Invoice [number] due on [date]
Hi [Name], a quick reminder that invoice [number] for [amount] is due on [date]. The payment details are on the invoice, attached again here. Thanks!

**On the due date**
Subject: Invoice [number] due today
Hi [Name], invoice [number] for [amount] is due today. If it's already on its way, thank you and please ignore this.

**7 days overdue**
Subject: Invoice [number] is now 7 days overdue
Hi [Name], invoice [number] for [amount] was due on [date]. Could you let me know when I can expect payment? If there's a problem with the invoice, tell me and I'll fix it.

**14 days overdue (final)**
Subject: Final reminder: invoice [number]
Hi [Name], invoice [number] for [amount] is now 14 days overdue. Please arrange payment by [date]. After that I'll need to pause any further work until the account is settled.

## Part 3: Prevent late payments
- Invoice the same day you deliver, not at the end of the month.
- Ask for a deposit on new clients and big jobs.
- Make paying easy: one link or one set of details, not three options to choose from.
- Confirm who approves invoices at the client before you send the first one.

## Part 4: Close your books each month (45 minutes)
- [ ] Download last month's bank statement
- [ ] Match every incoming payment to an invoice in the tracker; mark them Paid
- [ ] Match every outgoing payment to a receipt; chase any missing receipts
- [ ] List overdue invoices and send the right reminder
- [ ] Save receipts in one folder named by month (2026-10)
- [ ] Note total income, total expenses and what's still owed
- [ ] Send everything to your accountant if you have one

## Using the invoice tracker
One row per invoice. Fill in the dates when reminders go out and when it's paid. Sort by Due date every Monday and you'll always know who owes you what.`;

const REPLIES = `# Customer Reply Playbook
Twenty ready-to-send replies for the messages every business gets, plus the rules that keep customers happy even when things go wrong.

## The three-part reply
Every good reply does three things, in this order:
1. Acknowledge: show you read and understood the message.
2. Answer: the actual answer or fix, in plain words.
3. Next step: what happens now, and when.

## Response-time standards
- Acknowledge every message within 4 working hours, even if the full answer takes longer.
- Resolve simple questions the same day.
- Complaints: first reply within 2 hours if you can, and a named person owns it until it's closed.

## Tone rules
- Use their name and yours.
- Short sentences. No jargon.
- Apologise once, sincerely, then fix it. Don't over-apologise.
- Never argue in public. Move heated conversations to private messages or email.

## Twenty replies

**1. General enquiry**
Hi [Name], thanks for getting in touch. [Answer]. If you have any other questions, just reply here.

**2. Price question**
Hi [Name], [product/service] is [price] and includes [what's included]. You can [how to buy]. Happy to help you choose.

**3. Availability**
Hi [Name], yes, we can do [date/time]. Shall I book it in for you?

**4. Order status**
Hi [Name], your order [number] is [status] and should reach you by [date]. Here's the tracking link: [link].

**5. Late delivery**
Hi [Name], I'm sorry your order is late. It's now due on [date] because [reason]. [What you're doing to make it right].

**6. Wrong item or mistake**
Hi [Name], I'm sorry we got this wrong. We'll [fix: send the right item / redo the work] by [date], at no cost to you.

**7. Refund request**
Hi [Name], I've processed your refund of [amount]. You'll see it in [timeframe]. I'm sorry this one didn't work out.

**8. Refund you can't give**
Hi [Name], I understand the frustration. Under our terms we can't refund [reason], but we can [alternative: replace, credit, redo].

**9. Complaint**
Hi [Name], thank you for telling us, and I'm sorry. Here's what happened: [short honest explanation]. Here's what we're doing: [fix], by [date].

**10. Angry message**
Hi [Name], I can hear how frustrating this has been, and I want to sort it out. Could you share [detail] so I can fix it today?

**11. Positive review reply**
Thank you, [Name]! We loved working on [specific thing]. See you next time.

**12. Negative review reply**
Hi [Name], I'm sorry we fell short on [issue]. That's not the standard we aim for. Please message us at [contact] so we can put it right.

**13. Asking for a review**
Hi [Name], thanks again for choosing us. If you have a minute, a short review would help other people find us: [link]. Thank you!

**14. Following up after a sale**
Hi [Name], how's [product/service] working for you? If anything isn't right, reply and we'll help.

**15. Discount request**
Hi [Name], thanks for asking. Our prices are fixed so everyone gets the same fair deal, but [smaller option] might suit your budget.

**16. Can't help with this**
Hi [Name], that's outside what we do, but [name/company] specialise in it. I'd recommend them.

**17. Out of stock / fully booked**
Hi [Name], we're fully booked until [date]. Would you like me to hold the first free slot for you?

**18. Payment problem**
Hi [Name], it looks like the payment didn't go through. Could you try again here: [link]? If it fails again, reply and we'll sort it out.

**19. Cancellation**
Hi [Name], that's done: your [order/subscription] is cancelled and you won't be charged again. If you ever want to come back, we'll be here.

**20. Thank you for your business**
Hi [Name], a quick note to say thank you for working with us this year. It means a lot.

## Saving them for speed
- Gmail: Settings > Advanced > Templates.
- Outlook: Quick Parts or My Templates.
- WhatsApp Business: Business tools > Quick replies (use a / shortcut like /late).
- Instagram and Facebook: Saved replies in Meta Business Suite.`;

const OUTREACH = `# Cold Outreach Starter Kit
Find the right people, write messages they answer, and follow up without being pushy. Includes a lead research spreadsheet.

## Step 1: Describe your ideal customer (15 min)
Answer in one line each:
- Industry and size: who are they?
- Role: who decides to buy?
- Problem: what costs them time or money that you fix?
- Trigger: what happens right before they need you (hiring, launching, growing, a bad review)?
- Where they are: which platforms, groups, directories or events?

## Step 2: Find 25 leads (60 min)
Good free sources:
- LinkedIn search filtered by role, industry and location
- Google Maps for local businesses (search "[business type] in [city]")
- Industry directories and association member lists
- People posting about the problem you solve
Add each one to the lead research spreadsheet.

## Step 3: Research each lead (2 min each)
For every row, find one real, specific reason to contact them:
- Something they posted, launched or announced
- Something you noticed (a broken link, no posts since March, slow replies)
- A shared connection or community
No reason, no message. Personal beats perfect.

## Step 4: The three-email sequence
**Email 1 (day 1): the observation**
Subject: [Their company] + [specific thing]
Hi [Name], I noticed [specific observation]. We help [type of business] [result] by [how]. Would it be useful if I sent over [small, concrete thing]?

**Email 2 (day 4): the value**
Subject: Re: [Their company] + [specific thing]
Hi [Name], one idea in case it helps: [a genuinely useful tip about their situation]. Happy to share more if it's useful.

**Email 3 (day 9): the close**
Subject: Should I close this?
Hi [Name], I don't want to fill your inbox. If [problem] isn't a priority right now, no worries at all. If it is, reply "yes" and I'll send [small next step].

## LinkedIn connection note (under 300 characters)
Hi [Name], saw your post about [topic]. I work with [type of business] on [problem]. Would be good to connect.

## Follow-up rules
- Three touches, then stop.
- Never send the same message twice.
- Reply to every answer within a day, including a "no thanks" ("Thanks for letting me know!").
- Only email people where outreach is allowed, and remove anyone who asks.

## Track what works
In the spreadsheet, mark Sent, Replied and Booked. After 25 leads:
- Reply rate under 5%: your reason to contact isn't specific enough.
- Replies but no bookings: your next step is too big. Offer something smaller.

## Checklist
- [ ] Ideal customer written
- [ ] 25 leads in the sheet
- [ ] A specific reason for each
- [ ] Email 1 sent to all 25
- [ ] Follow-ups scheduled for day 4 and day 9`;

const HIRING = `# Hire Your First Assistant Kit
A job ad, screening scorecard, paid trial task, interview questions and a first-week onboarding plan. Includes a candidate scorecard spreadsheet.

## Step 1: Decide what to hand over (20 min)
For one week, write down every task you do. Mark each one:
- A: only you can do it
- B: someone could do it with instructions
- C: someone could do it today
The B and C tasks are your job description.

## Step 2: The job ad
**Title:** Virtual Assistant (Part-time, Remote), [hours] hours a week

**About us:** [Business] helps [customers] with [what you do]. We're a small team and you'll work directly with [your name].

**What you'll do:**
- [Task 1, e.g. manage my inbox and calendar]
- [Task 2, e.g. schedule social media posts]
- [Task 3, e.g. send invoices and chase payments]

**You'll be great if you:**
- Write clear, friendly emails
- Are organised and follow through without reminders
- Are comfortable with [tools, e.g. Google Workspace, Canva]

**Details:** [hours], [time zone overlap], [pay], starting [date].

**To apply:** send a short note about why this role suits you, and include the word [keyword] so we know you read this.

## Step 3: Screen in 10 minutes each
Skip anyone who didn't include the keyword. Score the rest 1 to 5 on the scorecard spreadsheet:
- Written communication
- Relevant experience
- Tools they know
- Availability and time zone fit
- Attention to detail
Interview the top 5.

## Step 4: A paid trial task (1-2 hours, paid)
Give the same real-world task to your top 3, for example: "Here are 20 emails from my inbox. Sort them into Act, Waiting and Reference, and draft replies to the 3 most urgent." Pay for the trial, always.

## Step 5: Ten interview questions
1. Walk me through how you organise your own week.
2. Tell me about a time you found a mistake before anyone else did.
3. How do you handle two urgent requests at once?
4. What would you do if you didn't understand an instruction?
5. Which tools do you use daily, and for what?
6. Tell me about a process you improved.
7. How do you keep track of tasks with deadlines?
8. What does good communication with a remote manager look like to you?
9. What kind of work do you enjoy least?
10. What questions do you have for me?

## Step 6: The first week
- [ ] Day 1: welcome call, tools access via a password manager (never send passwords by email or chat)
- [ ] Day 1: share a one-page "how I work" note: hours, priorities, how to reach you
- [ ] Day 2: first task with written instructions (an SOP)
- [ ] Day 3: review together; adjust the instructions
- [ ] Day 5: 15-minute check-in: what's working, what's not
- [ ] End of week 2: agree the weekly routine and a regular check-in time

## Security basics
- Share access through a password manager, never in messages.
- Give access only to what's needed for the tasks.
- Turn on two-factor authentication on every shared account.
- Remove access the same day someone leaves.`;

const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";

const PILLARS = ["Teach", "Show", "Sell"];
const FORMATS = ["Tip post", "Photo", "Short video", "Carousel", "Question", "Story", "Offer"];
const socialCalendar = csv([
  ["Day", "Pillar", "Format", "Hook idea", "Caption formula #", "Call to action", "Hashtags", "Status"],
  ...Array.from({ length: 30 }, (_, i) => [i + 1, PILLARS[i % 3], FORMATS[i % FORMATS.length], "", (i % 3) * 10 + Math.floor(i / 3) + 1, "", "", "Idea"]),
]);
const invoiceTracker = csv([
  ["Invoice #", "Client", "Description", "Issue date", "Due date", "Amount", "Currency", "Status", "Reminder: 3 days before", "Reminder: due date", "Reminder: 7 days late", "Reminder: 14 days late", "Paid date", "Notes"],
  ["2026-001", "Example Client Ltd", "Website updates, October", "2026-10-01", "2026-10-08", "450", "USD", "Paid", "2026-10-05", "", "", "", "2026-10-07", "Deposit received"],
  ...Array.from({ length: 20 }, (_, i) => [`2026-${String(i + 2).padStart(3, "0")}`, "", "", "", "", "", "", "Draft", "", "", "", "", "", ""]),
]);
const leadSheet = csv([
  ["#", "Name", "Role", "Company", "Website", "Where found", "Email or profile link", "Specific reason to contact", "Email 1 sent", "Email 2 sent", "Email 3 sent", "Replied", "Booked", "Notes"],
  ...Array.from({ length: 25 }, (_, i) => [i + 1, "", "", "", "", "", "", "", "", "", "", "", "", ""]),
]);
const scorecard = csv([
  ["Candidate", "Included keyword (Y/N)", "Written communication (1-5)", "Relevant experience (1-5)", "Tools (1-5)", "Availability fit (1-5)", "Attention to detail (1-5)", "Total", "Trial task score (1-10)", "Interview notes", "Decision"],
  ...Array.from({ length: 15 }, () => ["", "", "", "", "", "", "", "", "", "", ""]),
]);

export const KITS = [
  {
    id: "inbox", title: "Inbox Zero in 60 Minutes", pillar: "admin",
    struggle: "Starting every day buried in email",
    promise: "Clear your inbox in one hour and keep it clear in 15 minutes a day.",
    inside: ["A 60-minute clean-up plan for Gmail and Outlook", "The three-label system", "Five filters that sort mail for you", "12 reply templates", "Daily and weekly routines"],
    files: [{ name: "inbox-zero-in-60-minutes.pdf", type: "pdf", md: INBOX }],
    done: ["q-inbox-cleanup", "inbox-calendar"],
    nurture: [
      { day: 2, subject: "The one inbox habit that sticks", text: "Most people clear their inbox once and lose it again within a week. The fix is in step 5 of the kit: the five filters. Set them up and roughly half your new mail never reaches the inbox.\n\nStuck halfway? Do it together: add us as a delegate on your inbox (never share your password) and we'll finish the clean-up and filters with you." },
      { day: 5, subject: "Want it done by tonight?", text: "If the 60 minutes hasn't happened yet, that's normal. Hand it over: we'll archive the backlog, unsubscribe the noise, set up the labels and filters, and flag what needs you, done the same day." },
      { day: 10, subject: "Never sort email again", text: "Some people would rather not touch the inbox at all. Our inbox and calendar management handles it every day: sorting, drafting replies for your OK, and keeping your calendar clean." },
    ],
  },
  {
    id: "social", title: "30-Day Social Media Content Kit", pillar: "social",
    struggle: "Never knowing what to post",
    promise: "Plan a month of posts in one afternoon.",
    inside: ["The three-pillar method", "A ready-made 30-day calendar (spreadsheet)", "30 caption formulas", "How to batch-write and schedule for free", "A monthly review to see what works"],
    files: [{ name: "30-day-social-media-kit.pdf", type: "pdf", md: SOCIAL }, { name: "30-day-content-calendar.csv", type: "csv", body: socialCalendar }],
    done: ["q-captions", "q-schedule", "social-management"],
    nurture: [
      { day: 2, subject: "The fastest way to fill your calendar", text: "Don't write captions one day at a time. Fill the hook column in the calendar first (one line each), then batch-write all 30 captions in one sitting using the formulas. It takes about a third of the time.\n\nWant help? Do it together: you pick the pillars, we write and polish the month with you." },
      { day: 5, subject: "10 captions, done today", text: "If writing is the part you dread, we'll write 10 captions in your voice, ready to post, the same day. Want them scheduled too? We'll schedule a week of your posts." },
      { day: 10, subject: "Show up every week without thinking about it", text: "Social media management takes the whole thing off your plate: planning, writing, scheduling and replying, every week." },
    ],
  },
  {
    id: "invoices", title: "Get Paid on Time Kit", pillar: "admin",
    struggle: "Chasing late payments",
    promise: "Invoice properly, chase politely, and close your books in 45 minutes a month.",
    inside: ["Invoice must-haves and payment terms that work", "Four reminder emails, from friendly to final", "How to prevent late payments", "A monthly bookkeeping checklist", "An invoice tracker spreadsheet"],
    files: [{ name: "get-paid-on-time-kit.pdf", type: "pdf", md: INVOICES }, { name: "invoice-tracker.csv", type: "csv", body: invoiceTracker }],
    done: ["q-invoices", "q-receipts", "bookkeeping-prep"],
    nurture: [
      { day: 2, subject: "The reminder schedule that gets you paid", text: "The four reminders work because they're predictable: 3 days before, on the due date, 7 days late, 14 days late. Put the dates in the tracker the day you send the invoice, and you'll never have to remember to chase.\n\nWant help setting it up? Do it together: we'll build your invoice template and tracker with you." },
      { day: 5, subject: "10 invoices out by tonight", text: "Behind on invoicing? We'll make your invoice template and send your next 10 invoices the same day. Receipts piling up? We'll match 50 to your bank statement." },
      { day: 10, subject: "Close your books without opening a spreadsheet", text: "Invoicing and bookkeeping prep handles it every month: invoices out on time, reminders sent, receipts matched, and a tidy summary for your accountant." },
    ],
  },
  {
    id: "replies", title: "Customer Reply Playbook", pillar: "growth",
    struggle: "Awkward complaints and slow replies",
    promise: "Reply to anything in under a minute, even when things go wrong.",
    inside: ["The three-part reply that works every time", "Response-time standards", "20 ready-to-send replies, from price questions to angry customers", "How to save them in Gmail, Outlook, WhatsApp and Meta"],
    files: [{ name: "customer-reply-playbook.pdf", type: "pdf", md: REPLIES }],
    done: ["q-reply-templates", "q-reviews", "customer-support"],
    nurture: [
      { day: 2, subject: "Acknowledge first, answer second", text: "The single biggest win in the playbook: reply within 4 working hours even if you don't have the full answer yet. A quick \"got it, I'll come back by Thursday\" stops most complaints before they start.\n\nWant help? Do it together: we'll adapt the 20 replies to your business and set them up in your inbox and WhatsApp with you." },
      { day: 5, subject: "Your own reply templates, written today", text: "We'll write 10 customer reply templates in your voice, specific to your business, the same day. Reviews waiting? We'll reply to 20 of them." },
      { day: 10, subject: "Never miss a customer message", text: "A customer support desk answers your customers for you every day, by email, chat and social, in your voice, and flags anything that needs you." },
    ],
  },
  {
    id: "outreach", title: "Cold Outreach Starter Kit", pillar: "growth",
    struggle: "Not knowing how to find new customers",
    promise: "Find 25 good leads and send messages people actually answer.",
    inside: ["An ideal-customer worksheet", "Where to find leads for free", "A 2-minute research method per lead", "A three-email sequence and a LinkedIn note", "A lead research spreadsheet"],
    files: [{ name: "cold-outreach-starter-kit.pdf", type: "pdf", md: OUTREACH }, { name: "lead-research-sheet.csv", type: "csv", body: leadSheet }],
    done: ["q-leads", "q-cold-email", "lead-generation"],
    nurture: [
      { day: 2, subject: "Why most cold emails get ignored", text: "Almost always, there's no real reason to contact that person. Step 3 of the kit fixes it: one specific observation per lead. It takes 2 minutes and roughly doubles replies.\n\nWant help? Do it together: you define the ideal customer, we research the list and write the emails with you." },
      { day: 5, subject: "25 researched leads by tonight", text: "Skip the research: we'll find 25 leads that fit your ideal customer, each with a reason to contact them, the same day. Need the emails too? We'll write your 3-email outreach sequence." },
      { day: 10, subject: "A full pipeline, done for you", text: "Our lead generation service delivers 100 researched leads with personalised outreach messages, ready to send." },
    ],
  },
  {
    id: "hiring", title: "Hire Your First Assistant Kit", pillar: "admin",
    struggle: "Hiring help without wasting weeks",
    promise: "Write the ad, screen fast, test properly and onboard in one week.",
    inside: ["How to decide what to hand over", "A job ad template", "A candidate scorecard (spreadsheet)", "A paid trial task and 10 interview questions", "A first-week onboarding plan and security basics"],
    files: [{ name: "hire-your-first-assistant-kit.pdf", type: "pdf", md: HIRING }, { name: "candidate-scorecard.csv", type: "csv", body: scorecard }],
    done: ["q-job-post", "q-cv-screen", "hr-recruiting"],
    nurture: [
      { day: 2, subject: "The keyword trick that saves hours", text: "Step 3 of the kit asks applicants to include a keyword. Anyone who doesn't, didn't read the ad, and you can skip them. It usually removes half the applications in seconds.\n\nWant help? Do it together: we'll write the ad and set up your scorecard with you." },
      { day: 5, subject: "Your job ad, written and posted today", text: "We'll write and post your job ad the same day. Got applications? We'll screen 30 CVs and give you a shortlist of 5." },
      { day: 10, subject: "Hire without the hassle", text: "Our hiring service runs the whole process for one role: ad, screening, interviews and a shortlist you can choose from." },
    ],
  },
];

export const findKit = (id) => KITS.find((k) => k.id === id);
