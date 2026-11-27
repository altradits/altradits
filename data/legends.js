// Legend Billboard (/tracker): the contributors whose work Stanley has
// reviewed, so a reader can appreciate them and see the path to join them.
// Only logins and public names are stored here. Everything countable
// (reviews, merges, titles) is computed from the review log at refresh,
// never written by hand:
//
//   login      GitHub login (profile link is derived)
//   name       public name, or null when only the login is public
//   project    "lnd" or "minmo"
//   x          verified X handle, or null (from their GitHub profile only;
//              never guessed)
//
// A legend appears because their work was reviewed here. The board grows
// with the review log.

export const LEGENDS = [
  { login: "Roasbeef", name: "Olaoluwa Osuntokun", project: "lnd", x: null },
  { login: "ziggie1984", name: null, project: "lnd", x: null },
  { login: "djkazic", name: null, project: "lnd", x: null },
  { login: "MPins", name: null, project: "lnd", x: "pins_btc" },
  { login: "yyforyongyu", name: null, project: "lnd", x: "yyforyongyu" },
  { login: "SovereignTechnology", name: null, project: "lnd", x: null },
  { login: "okjodom", name: "Jodom", project: "minmo", x: "okjodom" },
];
