// The Builder Path: a dated daily program from beginner to a Btrust-ready
// Bitcoin open-source contributor. One deliverable a day, each proven only by
// Stanley's own public GitHub activity. Code decides every verdict. Nothing
// here is ticked by hand, and nothing here is his work: the curriculum and the
// checks are ours, every log file, review, issue and pull request is his.
//
// Types: log (a dated file in the learning repo), review (a review or comment
// on someone else's pull request), issue, pr, merged, rest (Sundays, no proof
// needed). See docs/builder-path.md for the full rules and the sources.

export const START = "2026-11-06";
export const END = "2027-06-30"; // to confirm: move when Btrust publishes 2027 dates
export const LEARNING_REPO = "altradits/builder-log";
export const LOG_DIR = "days";

// The Btrust starter bar, from the Starter Grant listing
// (https://btrust.homerun.co/starter-grants/en): at least five merged
// code-based pull requests, excluding docs, none a good first issue, plus
// reviews and community work. The tracker counts merges; it cannot judge code
// against docs, so the page says the full ask next to the count.
export const BTRUST_BAR = { merged: 5, listing: "https://btrust.homerun.co/starter-grants/en" };

export const PHASES = [
  { id: 0, name: "Foundations", start: "2026-11-06", end: "2026-12-31",
    goal: "Git, GitHub and the terminal. Go well enough to read LND. Enough C++ to build and test Bitcoin Core. Mastering Bitcoin chapters 1 to 7. Regtest bitcoind and lnd running.",
    exit: "Build bitcoind and lnd from source, with both running on regtest. Finish the Go tour. Keep the dated log complete." },
  { id: 1, name: "Reading and reviewing", start: "2027-01-01", end: "2027-02-25",
    goal: "Read LND every week. Build and test open pull requests. Post careful tested reviews. Join the PR Review Club when it meets.",
    exit: "At least 6 posted reviews that say exactly what was run, on tracked projects." },
  { id: 2, name: "Issues and small PRs", start: "2027-02-26", end: "2027-04-22",
    goal: "Reproduce bugs. Open precise issues. Fix docs and tests. Take good first issues. Keep reviewing every week.",
    exit: "At least 2 issues opened and at least 2 pull requests opened on tracked projects." },
  { id: 3, name: "A body of work", start: "2027-04-23", end: "2027-06-30",
    goal: "Merged pull requests toward the bar of five. A sustained review record. A written proposal for one clear area. The application.",
    exit: "A proposal written in the log. The application submitted. The review record unbroken." },
];

const L = (label, url) => ({ label, url });
const R = {
  gitHow: L("Git tutorial", "https://git-scm.com/docs/gittutorial"),
  proGit: L("Pro Git book", "https://git-scm.com/book/en/v2"),
  ghStart: L("Get started with GitHub", "https://docs.github.com/en/get-started"),
  goTour: L("A Tour of Go", "https://go.dev/tour/"),
  goTourStart: L("Start the tour", "https://go.dev/tour/welcome/1"),
  goDocs: L("Go documentation", "https://go.dev/doc/"),
  mbBook: L("Mastering Bitcoin", "https://github.com/bitcoinbook/bitcoinbook"),
  lnBook: L("Mastering the Lightning Network", "https://github.com/lnbook/lnbook"),
  lndRepo: L("LND source", "https://github.com/lightningnetwork/lnd"),
  lndGuide: L("LND code contribution guidelines", "https://github.com/lightningnetwork/lnd/blob/master/docs/code_contribution_guidelines.md"),
  lndDocs: L("LND developer docs", "https://docs.lightning.engineering/"),
  lndGoodFirst: L("LND good first issues", "https://github.com/lightningnetwork/lnd/labels/good%20first%20issue"),
  lndPulls: L("Open LND pull requests", "https://github.com/lightningnetwork/lnd/pulls"),
  coreRepo: L("Bitcoin Core source", "https://github.com/bitcoin/bitcoin"),
  coreContrib: L("Bitcoin Core CONTRIBUTING", "https://github.com/bitcoin/bitcoin/blob/master/CONTRIBUTING.md"),
  coreDevNotes: L("Bitcoin Core developer notes", "https://github.com/bitcoin/bitcoin/blob/master/doc/developer-notes.md"),
  corePulls: L("Open Bitcoin Core pull requests", "https://github.com/bitcoin/bitcoin/pulls"),
  reviewClub: L("PR Review Club", "https://bitcoincore.reviews/"),
  reviewMeetings: L("Past review meetings", "https://bitcoincore.reviews/meetings/"),
  savingSatoshi: L("Saving Satoshi", "https://savingsatoshi.com"),
  progBitcoin: L("Programming Bitcoin code", "https://github.com/jimmysong/programmingbitcoin"),
  starterGrant: L("Starter Grant listing", "https://btrust.homerun.co/starter-grants/en"),
  devGrants: L("Btrust developer grants", "https://www.btrust.tech/grants/developer"),
  fundingGuide: L("What funders look for", "https://blog.btrust.tech/how-bitcoin-developers-can-get-funding-for-open-source-work/"),
  builders: L("Btrust Builders", "https://builders.btrust.tech/"),
  buildersApply: L("Builders pathways", "https://builders.btrust.tech/apply"),
  boss: L("BOSS challenge", "https://bosschallenge.xyz"),
  tracker: L("My tracker", "https://altradits.com/tracker"),
  plan: L("My six-month plan", "https://altradits.com/plan"),
};

const verifyFor = (type, date) => ({
  log: `Proven by ${LOG_DIR}/${date}.md in ${LEARNING_REPO}, plus a commit by altradits on ${date}.`,
  review: `Proven by a review or comment you posted on someone else's pull request in a tracked repo on ${date}.`,
  issue: `Proven by an issue you opened in a tracked repo on ${date}.`,
  pr: `Proven by a pull request you opened in a tracked repo on ${date}.`,
  merged: `Proven by a pull request of yours merged in a tracked repo on ${date}.`,
  rest: "Rest. No proof needed.",
}[type]);

const day = (date, phase, type, title, what, resources) =>
  ({ date, phase, type, title, what, resources, verify: verifyFor(type, date) });

// Saturday reflections, in turn through the program.
const REFLECTIONS = [
  "What did you learn this week, in your own words? What took longest, and what unblocked you?",
  "Which day's work are you proudest of? Link the proof and say why it mattered.",
  "What confused you this week? Write the question as you would ask a maintainer: short, precise, with what you tried.",
  "Read one review or comment by an experienced contributor. What makes it good? Copy nothing. Say what you will copy in style.",
  "What would you teach a friend from this week in ten minutes? Write that lesson.",
  "Where is your streak? If you missed a day, say honestly why, and what changes next week.",
  "What is the hardest part of the current phase for you? Name one small step to make it easier.",
  "Look back at your first log files. What can you do now that you could not do then?",
];

const reflection = (date, phase, n) => day(date, phase, "log", `Week ${n} reflection`,
  `Write ${LOG_DIR}/${date}.md answering this: ${REFLECTIONS[(n - 1) % REFLECTIONS.length]} Commit it today.`,
  [R.tracker]);

const rest = (date, phase) => day(date, phase, "rest", "Rest",
  "No deliverable. Rest keeps the streak alive. Come back tomorrow.",
  [R.tracker]);

// Phase 0, week by week. Five weekday entries each; Saturday reflects,
// Sunday rests. Week 0 starts Friday 2026-11-06, so only Friday runs.
const P0 = [
  [ // week 0: begin
    { t: "log", title: "Create the learning repo", what: "Create a public repository named builder-log on your GitHub account. Public, not private. Then write days/2026-11-06.md: why you started, in your own words. Commit it today.", r: ["ghStart", "tracker"] },
  ],
  [ // week 1: the terminal and git
    { t: "log", title: "The terminal, first steps", what: "Learn to move, list, read and search from the terminal: pwd, ls, cd, cat, grep. Log every command you ran and what each printed.", r: ["gitHow"] },
    { t: "log", title: "Git: your first commits", what: "Configure git with your name and email. In builder-log, practice status, diff, add and commit. Log what each command showed.", r: ["gitHow", "proGit"] },
    { t: "log", title: "Git: branches", what: "Create a branch, change one line, commit, switch back, merge. Break it once on purpose, then fix it. Log each step and what you saw.", r: ["gitHow", "proGit"] },
    { t: "log", title: "GitHub: push and pull", what: "Push your branch to GitHub and open a pull request against your own repo. Merge it. Log the pull request link and what each button did.", r: ["ghStart"] },
    { t: "log", title: "Mastering Bitcoin 1: introduction", what: "Read chapter 1 (ch01_intro.adoc) of Mastering Bitcoin. Log three things you learned and two questions you still have.", r: ["mbBook"] },
  ],
  [ // week 2: git deeper
    { t: "log", title: "Git: history and undo", what: "Learn log, show and revert. Make a bad commit, read it in the log, revert it cleanly. Log the commands and the result.", r: ["proGit"] },
    { t: "log", title: "GitHub: issues and markdown", what: "Open an issue on your own repo describing one thing to improve in your log. Write it in markdown with a checklist. Close it when done. Log the link.", r: ["ghStart"] },
    { t: "log", title: "Mastering Bitcoin 2: how it works", what: "Read chapter 2 (ch02_overview.adoc). Run no code. Log a plain-words explanation of a transaction, as you would tell a friend.", r: ["mbBook"] },
    { t: "log", title: "Sign in safely: SSH keys", what: "Create an SSH key on your machine, add it to GitHub, and clone over SSH. Log that it worked. Never share the private key.", r: ["ghStart"] },
    { t: "log", title: "Week review: git fluency", what: "Without looking at notes: clone, branch, commit, push, open a pull request, merge. Log every command from memory, then mark what you had to look up.", r: ["proGit"] },
  ],
  [ // week 3: Go begins
    { t: "log", title: "Install Go, first program", what: "Install Go from the docs. Write, build and run hello. Log the version, the program and its output.", r: ["goDocs"] },
    { t: "log", title: "Tour of Go: basics", what: "Work the Basics part of the tour to the end. Log one example you changed and what changed in the output.", r: ["goTourStart", "goTour"] },
    { t: "log", title: "Tour of Go: flow control", what: "Work the flow control part: for, if, switch, defer. Log a small loop you wrote yourself and what it prints.", r: ["goTour"] },
    { t: "log", title: "Tour of Go: more types", what: "Work the structs, slices and maps part. Log a struct you defined and a map you filled, with the output.", r: ["goTour"] },
    { t: "log", title: "Mastering Bitcoin 3: the client", what: "Read chapter 3 (ch03_bitcoin-core.adoc). Log what Bitcoin Core does and which of its parts you want to run first.", r: ["mbBook"] },
  ],
  [ // week 4: Go deeper
    { t: "log", title: "Tour of Go: methods", what: "Work the methods and interfaces part. Log an interface you defined and two types that satisfy it.", r: ["goTour"] },
    { t: "log", title: "Tour of Go: generics", what: "Work the generics part. Log one generic function you wrote and two types you called it with.", r: ["goTour"] },
    { t: "log", title: "Tour of Go: concurrency", what: "Work the concurrency part: goroutines and channels. Log a program where two goroutines talk through a channel.", r: ["goTour"] },
    { t: "log", title: "Go: build a small tool", what: "Write a small command-line tool: read a file, count its words, print the count. Log the code and a test run.", r: ["goDocs"] },
    { t: "log", title: "Mastering Bitcoin 4: keys", what: "Read chapter 4 (ch04_keys.adoc). Log what a private key, a public key and an address are, each in one sentence.", r: ["mbBook"] },
  ],
  [ // week 5: Go tests and LND layout
    { t: "log", title: "Go: tests", what: "Write a Go test for your word counter with go test. Make it fail once, then pass. Log the failing and passing output.", r: ["goDocs"] },
    { t: "log", title: "Read LND: the layout", what: "Clone LND and read its top-level layout. Log what five directories hold, in your own words.", r: ["lndRepo"] },
    { t: "log", title: "Read LND: the guidelines", what: "Read the LND code contribution guidelines end to end. Log the five rules that matter most for your first review.", r: ["lndGuide"] },
    { t: "log", title: "Go: fmt, vet and modules", what: "Learn gofmt, go vet and go mod. Run all three on your tool and fix what they flag. Log what each found.", r: ["goDocs"] },
    { t: "log", title: "Mastering Bitcoin 5: wallets", what: "Read chapter 5 (ch05_wallets.adoc). Log what a seed phrase protects and what it does not.", r: ["mbBook"] },
  ],
  [ // week 6: C++ and building Core
    { t: "log", title: "Read Core: developer notes", what: "Read the Bitcoin Core developer notes. Log the build steps for your machine and the test commands.", r: ["coreDevNotes", "coreContrib"] },
    { t: "log", title: "Build Core: depends", what: "Build the dependency set for your machine. Log each command and how long each step took.", r: ["coreDevNotes"] },
    { t: "log", title: "Build Core: bitcoind", what: "Build bitcoind from source. Log the exact commands and the final version string it prints.", r: ["coreRepo"] },
    { t: "log", title: "Test Core: unit tests", what: "Run the unit tests. Log how many passed and the first failure if any, with what you did about it.", r: ["coreRepo"] },
    { t: "log", title: "Mastering Bitcoin 6: transactions", what: "Read chapter 6 (ch06_transactions.adoc). Log the parts of a transaction, each in one plain sentence.", r: ["mbBook"] },
  ],
  [ // week 7: regtest bitcoind
    { t: "log", title: "Regtest: bitcoind wallet", what: "Start bitcoind on regtest. Create a wallet, a new address, and mine blocks to it. Log every command and the balance.", r: ["mbBook"] },
    { t: "log", title: "Regtest: send coins", what: "Send regtest coins between two addresses in your wallet. Log the transaction id and how you checked it arrived.", r: ["mbBook"] },
    { t: "log", title: "Test Core: a functional test", what: "Run one functional test from the test suite. Log which test, what it checks, and that it passed.", r: ["coreRepo"] },
    { t: "log", title: "Mastering Bitcoin 7: authorization", what: "Read chapter 7 (ch07_authorization-authentication.adoc). Log how a transaction proves it may spend, in plain words.", r: ["mbBook"] },
    { t: "log", title: "Lightning 1: introduction", what: "Read chapter 1 of Mastering the Lightning Network (01_introduction.asciidoc). Log what the Lightning Network is for.", r: ["lnBook"] },
  ],
  [ // week 8: regtest lnd and the exit test
    { t: "log", title: "Build lnd", what: "Build lnd from source following its docs. Log the exact commands and the version it prints.", r: ["lndDocs", "lndRepo"] },
    { t: "log", title: "Regtest: lnd running", what: "Run lnd on regtest next to bitcoind. Create the wallet and check the balance. Log each step.", r: ["lndDocs"] },
    { t: "log", title: "Regtest: open a channel", what: "Open a Lightning channel to yourself on regtest. Log each step and the channel point.", r: ["lndDocs"] },
    { t: "log", title: "Regtest: an invoice and a payment", what: "Create an invoice and pay it on regtest. Log the invoice, the payment hash, and that it settled.", r: ["lndDocs"] },
    { t: "log", title: "Phase exit: prove it all", what: "Show the exit test in your log: bitcoind and lnd built from source, both on regtest, the Go tour finished. Link the proof files.", r: ["tracker"] },
  ],
];

// Phase 1 and later: weekly rhythm. Monday reads, Tuesday tests, Wednesday
// reviews, Thursday digs deeper, Friday reviews again (Phase 1), opens issues
// and pull requests (Phase 2), or builds the body of work (Phase 3).
const AREAS = [
  "invoices: how lnd creates, stores and settles an invoice",
  "payments: how a payment finds a route and what can fail",
  "channels: how a channel opens, updates and closes",
  "macaroons: how lnd checks permission for each call",
  "the channel graph: how lnd learns the network",
  "onion routing: how a payment packet is built and read",
  "peer messages: how two nodes talk to each other",
  "the wallet: how lnd holds keys and signs",
];

const monday = (date, phase, w) => day(date, phase, "log", `Read LND: ${AREAS[w % AREAS.length].split(":")[0]}`,
  `Read the LND code for ${AREAS[w % AREAS.length]}. Log the three files that matter most and what each does.`,
  [R.lndRepo, R.lndDocs]);
const tuesday = (date, phase, _w) => day(date, phase, "log", "Test an open pull request",
  "Pick one open pull request on a tracked project. Build it, run its tests, take notes in your log. Post nothing yet. Tomorrow you post the review.",
  [R.lndPulls, R.corePulls]);
const wednesday = (date, phase, _w, club) => day(date, phase, "review", club ? "Review Club week: post a tested review" : "Post a tested review",
  club
    ? "The PR Review Club meets this week. Prepare its pull request, test it, and post your review on GitHub saying exactly what you ran. Then join the meeting if you can."
    : "Post your review of yesterday's pull request on GitHub: what you ran, what you saw, and your questions. Tested ACK style, careful and short.",
  club ? [R.reviewClub, R.lndPulls] : [R.lndPulls, R.corePulls]);

const P1_THURSDAYS = [
  "Read the review comments on the pull request you reviewed. Log what the experienced reviewers saw that you missed.",
  "Read one more open pull request in the same area. Log how it connects to yesterday's review.",
  "Reproduce one test failure from the test suite on purpose. Log the failing output and the fix.",
  "Read the Lightning Network chapter on the area you reviewed. Log one thing the code does that the book does not say.",
  "Follow one function from an RPC call down to storage. Log each layer it passes through.",
  "Read a merged pull request from last month in your area. Log why it was safe to merge.",
  "Compare two open pull requests that touch the same file. Log which is safer and why.",
  "Write down five questions you would ask the maintainer of your area. Keep them precise, with file names and line numbers.",
];
const thursday1 = (date, w) => day(date, 1, "log", "Dig deeper", `${P1_THURSDAYS[w % P1_THURSDAYS.length]} Commit the log today.`, [R.lndRepo, R.lnBook]);
const friday1 = (date, _w) => day(date, 1, "review", "Second review of the week",
  "Test and review one more pull request on a tracked project. Post the review on GitHub with exactly what you ran.",
  [R.lndPulls, R.corePulls]);

// Phase 2: Thursday prepares, Friday ships. Issue weeks and PR weeks alternate.
const thursday2 = (date, w) => (w % 2 === 0
  ? day(date, 2, "log", "Reproduce a bug", "Pick one open issue or odd behavior on a tracked project. Reproduce it on regtest. Log every step so anyone can repeat it. Tomorrow you file the issue.", [R.lndRepo, R.coreRepo])
  : day(date, 2, "log", "Prepare a small fix", "Pick a docs fix, a test gap, or a good first issue. Write the fix locally and run the tests. Log what you changed and what passed. Tomorrow you open the pull request.", [R.lndGoodFirst, R.lndGuide]));
const friday2 = (date, w) => (w % 2 === 0
  ? day(date, 2, "issue", "File a precise issue", "Open the issue on GitHub: what you did, what you expected, what happened, versions, logs. Short and precise. Link it in your log.", [R.lndRepo])
  : day(date, 2, "pr", "Open a small pull request", "Open the pull request on GitHub following the project's guidelines. Small, tested, with what you ran. Answer review when it comes.", [R.lndGuide, R.coreContrib]));

// Phase 3: Thursday builds (or drafts the proposal late in the phase),
// Friday ships a pull request.
const PROPOSAL = [
  "Draft the problem: which part of LND hurts users or developers, with evidence from your reviews and issues.",
  "Draft the plan: what you will build or fix in six months, in dated steps with review time built in.",
  "Draft the proof: your reviews, issues and pull requests so far, each linked, each in one line.",
  "Draft what funding changes: what full-time work makes possible that evenings cannot. Read the funder checklist first.",
];
const thursday3 = (date, w, weeksLeft) => (weeksLeft <= 4
  ? day(date, 3, "log", "Draft the proposal", `${PROPOSAL[(4 - weeksLeft) % PROPOSAL.length]} Commit the draft in your log today.`, [R.fundingGuide, R.plan])
  : day(date, 3, "log", "Build toward the next PR",
      "Work your current contribution: code, tests, or review replies. Log what moved today and what is next. Tomorrow you open or update the pull request.",
      [R.lndRepo, R.lndGuide]));
const friday3 = (date, _w, lastWeek) => (lastWeek
  ? day(date, 3, "log", "Submit the application", "Submit the grant application with your proposal and your record. Log the date, the program, and the links you sent. Then keep reviewing: the record never stops.", [R.starterGrant, R.fundingGuide])
  : day(date, 3, "pr", "Open or advance a pull request", "Open a new pull request or push a tested update to an open one. Small, tested, with what you ran. Reply to every review comment.", [R.lndGuide, R.coreContrib]));

// First Wednesday of the month: the PR Review Club meets that week.
const clubWeek = (date) => {
  const d = new Date(`${date}T12:00:00Z`), dow = d.getUTCDay();
  const monday = new Date(d.getTime() - ((dow + 6) % 7) * 864e5);
  const firstWed = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while (firstWed.getUTCDay() !== 3) firstWed.setUTCDate(firstWed.getUTCDate() + 1);
  const firstMonday = new Date(firstWed.getTime() - 2 * 864e5).toISOString().slice(0, 10);
  return monday.toISOString().slice(0, 10) === firstMonday;
};

const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const mondayOf = (date) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
const phaseOf = (date) => PHASES.find((p) => date >= p.start && date <= p.end);
// Monday-anchored weeks. Week 0 holds the phase's first Friday to Sunday.
const weekInPhase = (date) => { const p = phaseOf(date); return Math.round(diffDays(mondayOf(p.start), mondayOf(date)) / 7); };
const weeksLeft = (date) => { const p = phaseOf(date); return Math.floor(diffDays(date, p.end) / 7); };

export function dayAt(date) {
  const p = phaseOf(date);
  if (!date || date < START || date > END || !p) return null;
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (dow === 0) return rest(date, p.id);
  const weekNo = Math.floor(diffDays(START, date) / 7) + 1;
  if (dow === 6) return reflection(date, p.id, weekNo);
  const w = weekInPhase(date);
  if (p.id === 0) {
    // Week 0 starts Friday, so Monday to Thursday entries are empty.
    const entries = P0[w] || [];
    const firstDow = new Date(`${p.start}T12:00:00Z`).getUTCDay();
    const idx = w === 0 ? dow - firstDow : dow - 1;
    const e = entries[idx];
    if (!e) return null;
    return day(date, 0, e.t, e.title, e.what, e.r.map((k) => R[k]));
  }
  if (dow === 1) return monday(date, p.id, w);
  if (dow === 2) return tuesday(date, p.id, w);
  if (dow === 3) return wednesday(date, p.id, w, clubWeek(date));
  if (dow === 4) return p.id === 1 ? thursday1(date, w) : p.id === 2 ? thursday2(date, w) : thursday3(date, w, weeksLeft(date));
  const lastWeek = date > addDays(p.end, -7);
  return p.id === 1 ? friday1(date, w) : p.id === 2 ? friday2(date, w) : friday3(date, w, p.id === 3 && lastWeek);
}

export function buildDays() {
  const out = [];
  for (let d = START; d <= END; d = addDays(d, 1)) {
    const d0 = dayAt(d);
    if (d0) out.push(d0);
  }
  return out;
}

export const DAYS = buildDays();
export const dayMap = () => new Map(DAYS.map((d) => [d.date, d]));
export const phaseAt = (date) => PHASES.find((p) => date >= p.start && date <= p.end) || null;
