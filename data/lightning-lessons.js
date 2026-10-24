// What running the Altradits node has taught us. Stanley adds new lessons
// from the admin (Finance tab); these are the first ones, newest first.
// Only real experience goes in LESSONS.
export const LESSONS = [
  { at: "2026-10", text: "Inbound liquidity was bought from Magma (Amboss) so the new node could receive its first payments. A fresh node has no inbound until someone opens a channel to it or it buys one." },
  { at: "2026-10", text: "The node runs on a Mac. When the Mac sleeps or LND stops, the website can't create Lightning invoices on the node and falls back to the Lightning address, so keep the Mac awake and plugged in while selling." },
];

// Standard practice for a node that mainly receives payments.
export const AVOID = [
  "Force closes, unless the peer has been offline for days: funds are locked for about two weeks and fees are higher. Close cooperatively.",
  "Opening or closing when on-chain fees are high, unless payments are failing.",
  "Tiny channels (under about 500,000 sats): opening and closing fees become a large share of what they can carry.",
  "Peers that are often offline: an offline peer means a channel that can't receive.",
  "Letting the node go offline while invoices are open: payers see failures.",
  "Skipping the channel backup: export channel.backup after every open and keep it with the seed backup, offline.",
  "Ever typing the seed words into a website or sharing them: no service needs them to open a channel.",
];
