# The Builder Path: from beginner to a Btrust-ready contributor

A daily program from Monday 2026-11-09 to 2027-06-30. One verified deliverable a day.
Review comes first. Bitcoin has few reviewers, so reading, testing and
reviewing other people's pull requests is the most valued contribution and the
fastest way to learn.

Hard rule: we build the program and the tracking, never his work. Stanley
reads, writes, builds and tests everything himself. Every deliverable is proven
only by his own public GitHub activity. No day is ever ticked by hand.

Tracking issue: "Tracker: the Builder Path, a verified daily deliverable to a
Btrust grant". All Builder Path pull requests say "Part of" that issue.

## 1. The target: what Btrust asks (with sources)

Btrust funds Bitcoin open-source developers in the Global Majority. Founded in
2021 through a 500 BTC donation from Jack Dorsey and Jay-Z. Sources below were
read on 2026-11-05. Anything not confirmed on a Btrust page is marked
"to confirm".

### Starter Grant (the target)

The Starter Grant is for software engineers beginning their contribution to
open-source Bitcoin projects. It gives six months of full-time funding, paid in
BTC, plus technical and social support and help writing a proposal for
longer-term support.

Source: [Developer grants](https://www.btrust.tech/grants/developer) and the
[Starter Grant listing](https://btrust.homerun.co/starter-grants/en).

The listing asks the ideal applicant to show, all at once:

1. One specific Bitcoin open-source project, with several non-trivial code
   contributions:
   - Reviews: multiple helpful insights on others' work, moving code that is
     not your own forward.
   - Pull requests: at least five merged code-based PRs, excluding docs, and
     none of them labelled a good first issue. This confirms the tracker's
     "five merged PRs" starter bar, with qualifiers the tracker now shows.
   - Community: multiple helpful responses on issues, input on discussions,
     and participation in the project or in groups like BitDevs.
2. A clear plan for the next six months.
3. Full-time commitment for the six months.
4. Positive reviews from at least two mentors or contributors on the project.

Status on 2026-11-05: the listing says "Applications closed".

### Open-Source Cohort (later, not this program's target)

For established contributors. Beyond the starter criteria: a non-trivial
portfolio, two years of proof of work, a one-year vision, a supporting mentor,
and readiness to mentor a starter grantee.

Source: [Open Source Cohort listing](https://btrust.homerun.co/open-source-cohort/en).
Status on 2026-11-05: "Applications closed".

### Btrust Builders (the ramp)

Structured pathways for African software developers moving into Bitcoin open
source: Mastering Bitcoin (8 weeks), Learn Bitcoin from the CLI, Rust for
Bitcoiners, and Language Clubs. Live cohorts are application-based with fixed
dates. Self-paced study is open year round. Builders fit: at least one year of
production experience, an active GitHub or GitLab account, and consistent time
each week.

The Open Source Fellowship invites the strongest contributors: ten weeks,
full-time, on real projects, with mentors and a monthly stipend. It is
selective. Live pathway participation is required for consideration.

The BOSS challenge ("Start Your Career in BOSS") is a one-month entry run with
Chaincode Labs. Top performers continue with Chaincode. Others move into a
Builders pathway. The 2026 calendar starts it in January.

Sources: [Builders](https://builders.btrust.tech/),
[Apply and pathways](https://builders.btrust.tech/apply),
[2025 pipeline reflections](https://blog.btrust.tech/strengthening-africas-bitcoin-developer-pipeline-reflections-from-2025/).

### What funders look for (the funding guide)

Btrust's guide for applicants (9 Sep 2026) gives a seven-item checklist. Answer
each with specifics, not intentions: a clear area of work, concrete proof of
technical ability, previous work on the record, real understanding of the
problem, a plan and timeline that survives scrutiny, what funding changes, and
how the work serves the wider ecosystem. Start with precision. Explain the
problem before the solution.

Source: [How Bitcoin developers can get funding for open-source work](https://blog.btrust.tech/how-bitcoin-developers-can-get-funding-for-open-source-work/).

The guide also says plainly: the Starter Grant and the Cohort are not entry
points for someone with no Bitcoin background. Builders is the ramp. Of seven
developers awarded grants in Q2 2026, all but one came through Builders first.

### Other programs

- Bitcoin Core PR Review Club: a monthly club, first Wednesday and Thursday of
  the month at 17:00 UTC, on IRC (#bitcoin-core-pr-reviews on Libera). For
  learning the codebase and the review process. Source:
  [bitcoincore.reviews](https://bitcoincore.reviews/). Note: the task brief
  said weekly. The site says monthly. Meeting recency: to confirm. Check the
  site for the next meeting before going.
- Summer of Bitcoin: a remote mentored internship for university students
  (developer and designer tracks), about 12 weeks, stipend in BTC. Not
  Stanley's path, since he is not a student. 2026 dates are past. 2027 dates:
  to confirm. Source: [summerofbitcoin.org](https://www.summerofbitcoin.org/).
- Chaincode BOSS challenge: free, open worldwide, run by Chaincode Labs. A
  series of technical exercises through the Bitcoin protocol. Source:
  [bosschallenge.xyz](https://bosschallenge.xyz). 2027 dates: to confirm.

### To confirm (never stated as fact)

- 2027 Starter Grant application dates. Both grant listings say "Applications
  closed" today, with no 2027 dates published.
- The program end date 2027-06-30 is a planning guess. Move it when Btrust
  publishes 2027 dates.
- PR Review Club meeting recency and 2027 schedule.
- Summer of Bitcoin and BOSS 2027 dates.
- Whether data or schema pull requests (like the payment-channels registry)
  count toward the "five merged code-based PRs" bar. Assume they do not. The
  bar needs code.

## 2. The phase plan

All dates inclusive. Rest day: every Sunday. Reflection day: every Saturday
(a dated log file with that week's prompt answered). Weeks run Monday to
Sunday.

Every Saturday reflection also names one lab drill from the practice plan
(assets/learn-5-practice-drills.pdf), in turn, so the Mac test lab is used
every week. Seven Saturdays carry a dated grant milestone (MILESTONES in
data/builder-path.js): checking and applying to the BOSS challenge or a
Btrust Builders pathway (the funding guide says most Starter grantees came
through Builders), and lining up the two endorsements the Starter Grant
asks for. Program dates stay "to confirm": each milestone says to check the
page first. The Watchtower section at the top of the tracker page is the
one-screen summary of this plan.

| Phase | Dates | Goal | Exit test |
| :--- | :--- | :--- | :--- |
| 0, Foundations | 2026-11-09 to 2026-12-31 | Git, GitHub and the terminal. Go well enough to read LND. Enough C++ to build and test Bitcoin Core. Mastering Bitcoin 1 to 7. Regtest bitcoind and lnd running. | Build bitcoind and lnd from source. Show both running on regtest. Show the Go tour finished and the dated log complete. |
| 1, Reading and reviewing | 2027-01-01 to 2027-02-25 | Read LND every week. Build and test open pull requests. Post careful tested reviews. Join the PR Review Club when it meets. | At least 6 posted reviews that say exactly what was run, on tracked projects. |
| 2, Issues and small PRs | 2027-02-26 to 2027-04-22 | Reproduce bugs. Open precise issues. Fix docs and tests. Take good first issues. Keep reviewing weekly. | At least 2 issues opened and at least 2 pull requests opened on tracked projects. |
| 3, A body of work | 2027-04-23 to 2027-06-30 | Merged pull requests toward the bar of five. A sustained review record. A written proposal for one clear area. The application. | A proposal written in the log. The application submitted. Review record unbroken. |

The full dated curriculum is data/builder-path.js. Each day has one
deliverable: what to do, resource links, and exactly how code verifies it.

## 3. How a day is verified (code only)

Checks, one per deliverable type:

- log: the learning repo holds days/&lt;date&gt;.md, and Stanley committed to
  it on that date (Africa/Nairobi). Both must hold. The file alone, or commits
  alone, prove nothing.
- review: a review or a comment he posted on someone else's pull request in a
  tracked repository, on that date.
- issue: an issue he opened in a tracked repository, on that date.
- pr: a pull request he opened in a tracked repository, on that date.
- merged: a pull request of his merged in a tracked repository, on that date.
  Merges are never scheduled, since maintainers decide them. A merge counts on
  whatever day it lands.

Rules:

- A day is done, missed or rest. Code decides. Nothing is tickable by hand.
- Evidence counts for the Nairobi date it happened on, not the date it was
  due. Late work never reopens a missed day. It counts for the day it
  happened on.
- Real upstream work is never punished. Any upstream evidence satisfies a log
  day. Stronger upstream evidence satisfies a weaker day (merged beats pr,
  pr beats issue, issue beats review). The weekly review count still counts
  only real reviews.
- Rest days (Sundays) need no proof. They keep the streak alive but never
  extend it.
- The Btrust bar counts merged pull requests on the focus project
  (lightningnetwork/lnd) only. Past work and practice repositories never
  move it.
- The streak counts back from today over done and rest days. A missed day
  ends it. Today, while still open, never ends it.
- Tracked repositories are the six projects plus past work in
  data/tracker.js. Private repositories never show and never prove a day.
- Review dates come from each pull request's own reviews and comments, not
  from the search index. The search index dates the pull request, not the
  review.
- If GitHub cannot be reached, the page keeps the last good result and says
  so. Cold start with no cache answers 503.

## 4. What Stanley must do once

1. Create a public repository named builder-log on his own GitHub account.
   Public, not private. Add no code yet. Steps: github.com, New repository,
   name builder-log, Public, no README needed (or add one), Create.
   Day 1 of the program walks him through it. Nobody creates it for him.
2. Write one dated file per learning day: days/YYYY-MM-DD.md, in his own
   words, committed on that day in Nairobi time. Exercise code goes in the
   same repo beside the log.
3. Optional but advised: set GITHUB_TOKEN on the server (a token with no
   scopes, read-only public data). The tracker works without it inside the
   public rate limit, but the margin is thin (see below). The token value is
   never displayed, logged or committed. Setting name only.

## 5. GitHub load and rate limits

One cached computation feeds the page, the API and the morning report. It
refreshes in the morning before the report and at most every 30 minutes on
demand. Concurrent page views share one refresh.

Per refresh, unauthenticated: 4 searches (up to 3 pages each if a category
passes 100 items), the public events (up to 3 pages), one repository check per
distinct repository, plus the learning repo (one check, one file tree, up to 3
commit pages) and two calls per reviewed or commented pull request for exact
review dates. Today that is about 20 calls per refresh.

Public limits without a token: search 10 requests per minute, core 60 per
hour. The refresh fits, but barely, and every new repository or reviewed pull
request adds calls. With GITHUB_TOKEN (no scopes): search 30 per minute, core
5000 per hour. Advised.

## 6. What was wrong in the tracker, and fixed

Found by reading the code and checking the live API against read-only GitHub
calls on 2026-11-05:

1. Two merged counts disagreed. The stats row showed 24 (tracked projects plus
   past work). The chain showed 28 (everywhere else too: two practice
   repositories and one more). The plan page says 28. Now the total counts
   merged pull requests everywhere outside his own repositories, and the page
   labels each count with what it covers.
2. "0 of 24 steps done" sat next to "24 pull requests merged" with no
   explanation. The steps cover the six projects only. The merged count
   included past work. Now each label says what it covers.
3. Active days and the streak read only the first 100 public events. His own
   repository floods that list, so tracked activity could hide. Now the
   refresh reads up to 300 events and also counts the authored dates the
   search already returns.
4. The starter bar label said only "five merged pull requests". Btrust asks
   for five merged code-based PRs, excluding docs, none a good first issue,
   plus reviews and community work. The page now says the full ask, with a
   link to the listing, and the bar counts the focus project only.

Kept as found, verified working: the 24 h cache became a 30 min cache with a
single shared refresh. The morning refresh before the report. The stale cache
on GitHub failure. Private repositories excluded and fail-closed. No hand
ticking anywhere.
