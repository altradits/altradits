// Review log (/tracker): every review Stanley ran, in his own short words.
// Test facts are recorded once, when the work happens:
//
//   repo       owner/name on GitHub
//   number     pull request (or issue) number
//   kind       "review" (tested a PR) or "research" (issue research step)
//   date       Nairobi day the comment was posted (YYYY-MM-DD)
//   commit     head commit tested (reviews only)
//   title      PR or issue title, shortened
//   ran        [{ run, saw }]: exactly what ran and what was seen
//   note       one-line outcome or limit
//   comment    URL of the posted GitHub comment (proof)
//
// Merge state is NOT stored here. lib/tracker.js joins each entry with live
// GitHub search data at refresh, so open/merged/closed is always current.

export const REVIEWS = [
  {
    repo: "lightningnetwork/lnd", number: 11429, kind: "review",
    date: "2026-11-22", commit: "0a14ddd96",
    title: "build: bump neutrino to master with the block manager series",
    ran: [
      { run: "make build", saw: "ok, both binaries report 0a14ddd96" },
      { run: "go test -run TestFilteredChainView/p2p_neutrino ./routing/chainview/", saw: "PASS (4 subtests)" },
      { run: "make unit pkg=routing/chainview", saw: "only bitcoind_zmq failed (local bitcoind lacks ZMQ, unrelated)" },
    ],
    note: "Test report, plus two description nits (gateway files, btcwallet pin).",
    comment: "https://github.com/lightningnetwork/lnd/pull/11429#issuecomment-7073134328",
  },
  {
    repo: "lightningnetwork/lnd", number: 11429, kind: "review",
    date: "2026-11-26", commit: "0a14ddd96",
    title: "neutrino quarantine: signet pause/resume follow-up",
    ran: [
      { run: "signet node, single neutrino.connect peer, SIGSTOP while synced", saw: "5-min watchdog disconnect, then 25 min of silence" },
      { run: "SIGCONT", saw: "reconnected same second, 1 missed block in ~2s" },
      { run: "read neutrino 2e8b203 quarantine path", saw: "3 failures trigger 10-min quarantine; redials dropped silently; no forgive-on-success at service layer" },
    ],
    note: "No-query path recovers in ~2s; the stall needs in-flight queries.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11429#issuecomment-7179289712",
  },
  {
    repo: "lightningnetwork/lnd", number: 11591, kind: "review",
    date: "2026-11-26", commit: "0ebb59dd8",
    title: "kvdb: add db.bolt.mmap-populate option",
    ran: [
      { run: "go test -run TestBolt ./... (kvdb)", saw: "ok in 1.9s" },
      { run: "make build", saw: "clean" },
      { run: "restart signet node with db.bolt.mmap-populate", saw: "mmap_populate=true logged, synced to 332518" },
    ],
    note: "No-op on macOS, so no speedup to measure; draft waits on walletdb tag.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11591#issuecomment-7179576832",
  },
  {
    repo: "lightningnetwork/lnd", number: 11586, kind: "review",
    date: "2026-11-26", commit: "1e6d3fbe9",
    title: "feature: add simple taproot close dependencies",
    ran: [
      { run: "go test ./feature .", saw: "ok" },
      { run: "go test -tags=integration ./feature", saw: "ok" },
      { run: "make sample-conf-check", saw: "ok, 366 options" },
      { run: "make lint-native", saw: "ok, 0 issues" },
    ],
    note: "Waits on #11279 for overlay nodes.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11586#issuecomment-7180927114",
  },
  {
    repo: "lightningnetwork/lnd", number: 11605, kind: "review",
    date: "2026-11-26", commit: "42fb9a232",
    title: "sweep: update lastFeeRate when a published sweep is replaced",
    ran: [
      { run: "go test ./sweep/ -run 'TestMarkInputsPublished$' -count=1", saw: "ok in 1.2s" },
    ],
    note: "Published case and Init guard both behave.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11605#issuecomment-7181239239",
  },
  {
    repo: "lightningnetwork/lnd", number: 11593, kind: "review",
    date: "2026-11-26", commit: "5da320001",
    title: "kvdb: sync compacted bolt db only once",
    ran: [
      { run: "go test -run TestBoltAutoCompact ./... (kvdb)", saw: "ok in 1.0s" },
      { run: "make build", saw: "clean" },
      { run: "restart signet node with auto-compact forced", saw: "3 DBs compacted clean, synced to 332589" },
    ],
    note: "DBs here are tiny, so no speedup to measure.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11593#issuecomment-7193276734",
  },
  {
    repo: "lightningnetwork/lnd", number: 11446, kind: "review",
    date: "2026-11-26", commit: "5afc94ac6",
    title: "lnd: surface fixed-fee and authentication risks",
    ran: [
      { run: "go test ./contractcourt -count=1", saw: "ok in 32s" },
      { run: "go test . -count=1", saw: "ok in 1.3s" },
      { run: "start signet node with no-macaroons", saw: "new warning prints verbatim, then node restored to normal" },
    ],
    note: "Docs and help text read; warning verified live.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11446#issuecomment-7194209245",
  },
  {
    repo: "minmoto/payment-channels", number: 56, kind: "research",
    date: "2026-11-26", commit: null,
    title: "research: define one additional market's non-cash payment channel",
    ran: [
      { run: "surveyed non-cash coverage by market", saw: "KE, MW, TZ, ZA, ET covered; UG has cash only" },
    ],
    note: "Requested the research task; awaiting maintainer confirmation.",
    comment: "https://github.com/minmoto/payment-channels/issues/56#issuecomment-7181168480",
  },
  {
    repo: "lightningnetwork/lnd", number: 11470, kind: "review",
    date: "2026-11-26", commit: "32649d253",
    title: "docs: credit reviewers in release notes",
    ran: [
      { run: "go test ./scripts/release-notes/ -count=1 -v", saw: "ok, 7 tests pass" },
      { run: "fold dry-run in throwaway worktree (0.99.0)", saw: "2 fragments folded, contributors seeded, new prompt verbatim" },
    ],
    note: "Reviewer credit now includes tested verification with evidence.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11470#issuecomment-7196889179",
  },
  {
    repo: "lightningnetwork/lnd", number: 11568, kind: "review",
    date: "2026-11-26", commit: "4737885bb",
    title: "scripts: require three release signatures",
    ran: [
      { run: "bash -n scripts/verify-install.sh", saw: "clean" },
      { run: "grep MIN_REQUIRED_SIGNATURES= scripts/verify-install.sh", saw: "3" },
      { run: "make lint-native", saw: "ok, 0 issues" },
    ],
    note: "First lint run failed on a full local disk; clean rerun green.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11568#issuecomment-7201493527",
  },
  {
    repo: "lightningnetwork/lnd", number: 11643, kind: "review",
    date: "2026-11-26", commit: "479ec233d",
    title: "ci: link failed jobs from the CI result summary",
    ran: [
      { run: "actionlint .github/workflows/main.yml", saw: "9 findings; master has the same 8, all pre-existing" },
      { run: "compared findings to master", saw: "1 new info on jq escapes, correct jq, harmless" },
      { run: "make lint-native", saw: "killed locally (OOM), nothing Go changed" },
    ],
    note: "Workflow-only change; lint adds no signal here.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11643#issuecomment-7202627300",
  },
  {
    repo: "lightningnetwork/lnd", number: 11590, kind: "review",
    date: "2026-11-27", commit: "f6af0e93b",
    title: "ci: monitor nightly workflow health",
    ran: [
      { run: "actionlint both workflow files", saw: "watchdog clean, nightly 1 info" },
      { run: "actionlint master nightly.yml", saw: "zero findings, so the info is new" },
    ],
    note: "Backticks in single quotes are intentional markdown; harmless.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11590#issuecomment-7206885257",
  },
  {
    repo: "lightningnetwork/lnd", number: 11620, kind: "review",
    date: "2026-11-27", commit: "31d4a8b02",
    title: "sweep: record a replacement when the replaced tx has no record",
    ran: [
      { run: "go test ./sweep/ -run 'TestHandleBumpEventTxReplaced' -count=1", saw: "ok in 1.1s" },
      { run: "new test against master sweeper.go", saw: "fails with tx not found as described" },
    ],
    note: "Unmet CancelRebroadcast and StoreTx mocks prove the skipped calls.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11620#issuecomment-7207039803",
  },
  {
    repo: "lightningnetwork/lnd", number: 11637, kind: "review",
    date: "2026-11-27", commit: "a4288c381",
    title: "backport #11634: discovery live update horizon",
    ran: [
      { run: "go vet ./discovery/...", saw: "clean" },
      { run: "go test ./discovery/... -count=1", saw: "ok in 14.9s" },
      { run: "both named tests -count=10 -v", saw: "20 of 20 PASS" },
      { run: "compared file list to parent range", saw: "same 3 files, syncer.go identical" },
    ],
    note: "Only the documented test adaptation differs.",
    comment: "https://github.com/lightningnetwork/lnd/pull/11637#issuecomment-7208234447",
  },
];
