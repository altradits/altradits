// The open-source tracker (/tracker): projects Stanley doesn't own, each with
// a challenge to solve without AI, following that project's own guide.
// Progress is read from GitHub: nothing here is ticked by hand.
//
//   repo       owner/name on GitHub
//   logo       /assets/players/<logo>.png
//   guide      the project's contributing guide (followed to the letter)
//   start      where to find a first task
//   challenge  the first task to solve, in plain words
//   steps      the same four steps everywhere; each completes from GitHub:
//              review (a review or comment on someone else's PR), issue (an
//              issue opened), pr (a pull request opened), merged (one merged)

export const GITHUB_USER = "altradits";

// One clear area of work, as funders ask (blog.btrust.tech: "be precise").
// The day's task comes from this project until its four steps are done.
export const FOCUS = "lightningnetwork/lnd";

export const RULES = [
  "No AI: I read, write, build and test everything myself.",
  "Follow each project's contributing guide to the letter.",
  "Review before I write: understand the code others are changing first.",
  "Small, tested changes. Say what I ran and what I saw.",
];

export const TRACK = [
  { repo: "bitcoin/bitcoin", name: "Bitcoin Core", logo: "bitcoin-core",
    guide: "https://github.com/bitcoin/bitcoin/blob/master/CONTRIBUTING.md", start: "https://bitcoincore.reviews/",
    challenge: "Pick a pull request from the PR Review Club. Build it, run the unit and functional tests, and post a review saying exactly what you tested." },
  { repo: "lightningnetwork/lnd", name: "LND", logo: "lnd",
    guide: "https://github.com/lightningnetwork/lnd/blob/master/docs/code_contribution_guidelines.md", start: "https://github.com/lightningnetwork/lnd/labels/good%20first%20issue",
    challenge: "Take a good first issue. Build lnd, run the unit tests, and fix it the way the code contribution guidelines ask." },
  { repo: "bitcoindevkit/bdk", name: "Bitcoin Dev Kit", logo: "bdk",
    guide: "https://github.com/bitcoindevkit/bdk/blob/master/CONTRIBUTING.md", start: "https://github.com/bitcoindevkit/bdk/issues",
    challenge: "Run the examples on regtest. Find one thing that is unclear or untested, and make it clear or tested." },
  { repo: "lightning/bolts", name: "BOLTs", logo: "bolts",
    guide: "https://github.com/lightning/bolts/blob/master/CONTRIBUTING.md", start: "https://github.com/lightning/bolts/blob/master/11-payment-encoding.md",
    challenge: "Read BOLT 11 next to invoices from your own node. Ask one precise question, or fix one unclear sentence." },
  { repo: "bitcoinops/bitcoinops.github.io", name: "Bitcoin Optech", logo: "optech",
    guide: "https://github.com/bitcoinops/bitcoinops.github.io/blob/master/CONTRIBUTING.md", start: "https://bitcoinops.org/en/topics/",
    challenge: "Read the topic pages you use. Fix a broken link, an outdated fact or an unclear explanation, with sources." },
  { repo: "BitcoinDesign/Guide", name: "Bitcoin Design Guide", logo: "bitcoin-design",
    guide: "https://github.com/BitcoinDesign/Guide/blob/master/CONTRIBUTING.md", start: "https://github.com/BitcoinDesign/Guide/pulls",
    challenge: "Review an open change from the view of a first-time wallet user in Kenya, and suggest one clear improvement." },
];

// Where Stanley has already contributed: shown as proof of where the ladder leads.
export const DONE = [
  { repo: "minmoto/payment-channels", name: "Minmo: payment-channels", logo: "minmo", note: "Ethiopia's Telebirr channel and African cash-corridor schemas, for Minmo (led by Jodom)." },
];

export const STEPS = [
  { key: "review", title: "Review", text: "Review or comment on someone else's pull request." },
  { key: "issue", title: "Issue", text: "Open an issue: a bug you reproduced, or a precise question." },
  { key: "pr", title: "Pull request", text: "Open a pull request, small and tested." },
  { key: "merged", title: "Merged", text: "Get a pull request merged." },
];

// Milestones on the chain, by merged pull requests (blocks that won the mempool).
export const MILESTONES = [
  { merged: 0, title: "Genesis", text: "Where the chain starts." },
  { merged: 1, title: "Block 1 won", text: "The first pull request merged." },
  { merged: 5, title: "Block 5 won: the Btrust starter bar", text: "Five merged pull requests: one of the starter grant's asks." },
  { merged: 21, title: "Block 21 won", text: "A block for every million bitcoin." },
  { merged: 50, title: "Block 50 won", text: "A regular contributor." },
  { merged: 100, title: "Block 100 won", text: "A hundred merged pull requests." },
];

// The 21M day: accepted as a full-time open-source contributor. Set by hand,
// with a link anyone can check, e.g. { date: "2027-06-01", title: "Btrust grant", url: "https://…" }.
export const FULL_TIME = null;
