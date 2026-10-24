// The Bitcoin community page (/bitcoin). Only real moments and real stories:
// add a friend's story to STORIES with their permission, newest first.
//
//   { name: "First name", place: "Town, Country", role: "What they do",
//     story: "How they use Bitcoin at work or in daily life, in their words.",
//     photo: "/assets/community/<file>.jpg" (optional) }

export const MOMENTS = [
  { title: "Co-founded BitDevs Kisumu", text: "A Bitcoin developer community in Western Kenya. Our first Socratic Seminar at LakeHub Kisumu covered Bitcoin Core pull requests, BIPs and Layer 2 design." },
  { title: "Lightning Developer Bootcamp, Addis Ababa", text: "Sponsored by Btrust Builders, Africa Free Routing and the Human Rights Foundation: Lightning internals, routing and channel management." },
  { title: "A Bitcoin node by Lake Victoria", text: "Wrote the BitDevs Kisumu guide to syncing a node offline over Blockstream Satellite, for places where the internet is expensive or unreliable." },
  { title: "My own Lightning node, in daily use", text: "Every Altradits payment lands on it: one QR any wallet can pay, fees shown before you pay, settled in seconds." },
  { title: "Open source for African payments", text: "Contributed East African, Southern African and Western Sahara cash-corridor schemas and the Ethiopian Telebirr channel to an open payment-channels registry." },
];

export const STORIES = [];

// Practical first steps, shown as free value on the page.
export const FIRST_STEPS = [
  { title: "Get a wallet you control", text: "Install a self-custodial Lightning wallet on your phone and write the recovery words on paper. Never share them, never type them into a website." },
  { title: "Receive your first sats", text: "Ask a friend to send you a small amount, or sell one thing for Bitcoin. Small, real payments teach more than any article." },
  { title: "Let customers pay you", text: "A Lightning address works like an email address for payments. Put it on your invoices and your shop counter." },
];
