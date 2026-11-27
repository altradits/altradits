// Review log (/tracker): every review Stanley ran, written so a beginner can
// follow along and learn the method. Test facts are recorded once, when the
// work happens:
//
//   repo       owner/name on GitHub
//   number     pull request (or issue) number
//   kind       "review" (tested a PR) or "research" (issue research step)
//   date       Nairobi day the comment was posted (YYYY-MM-DD)
//   commit     head commit tested (reviews only)
//   title      PR or issue title, shortened
//   claim      the PR claim under test, in one line
//   author     GitHub login of the human whose idea the change is
//   pain       the pain point solved, in plain words
//   before     what happens today without the change
//   after      what changes if it merges
//   ran        [{ run, saw, why }]: the exact command, what it showed, and
//              why that command was the one to run
//   note       one-line outcome or limit
//   lesson     one sentence: what this review taught
//   followup   what happened since, or null (updated in the review loop)
//   mergedBy   GitHub login that merged it, or null
//   comment    URL of the posted GitHub comment (proof)
//
// Merge state is NOT stored here. lib/tracker.js joins each entry with live
// GitHub search data at refresh, so open/merged/closed is always current.

export const REVIEWS = [
  {
    repo: "lightningnetwork/lnd", number: 11429, kind: "review",
    date: "2026-11-22", commit: "0a14ddd96",
    title: "build: bump neutrino to master with the block manager series",
    claim: "The bump builds and the neutrino tests pass.",
    author: "Roasbeef",
    pain: "lnd pins an old neutrino without the new sync pipeline.",
    before: "Sync runs on the old stack.",
    after: "lnd tests against the merged neutrino stack.",
    ran: [
      { run: "make build", saw: "ok, both binaries report 0a14ddd96", why: "Prove the tree compiles on this toolchain before testing anything." },
      { run: "go test -run TestFilteredChainView/p2p_neutrino ./routing/chainview/", saw: "PASS (4 subtests)", why: "The PR touches neutrino sync, so run the neutrino chainview test." },
      { run: "make unit pkg=routing/chainview", saw: "only bitcoind_zmq failed (local bitcoind lacks ZMQ, unrelated)", why: "Run the whole area package to catch what the narrow test misses." },
    ],
    note: "Test report, plus two description nits (gateway files, btcwallet pin).",
    lesson: "Run the PR's own steps first, and read the diff before posting.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11429#issuecomment-7073134328",
  },
  {
    repo: "lightningnetwork/lnd", number: 11429, kind: "review",
    date: "2026-11-26", commit: "0a14ddd96",
    title: "neutrino quarantine: signet pause/resume follow-up",
    claim: "A paused peer gets quarantined and stalls reconnects for 10 minutes.",
    author: "Roasbeef",
    pain: "A single paused peer could stall a node for 10 minutes.",
    before: "Quarantine behavior unmeasured on signet.",
    after: "Field data plus a forgive-on-success proposal on record.",
    ran: [
      { run: "signet node, single neutrino.connect peer, SIGSTOP while synced", saw: "5-min watchdog disconnect, then 25 min of silence", why: "Pause the peer exactly like the reported repro to see the same path." },
      { run: "SIGCONT", saw: "reconnected same second, 1 missed block in ~2s", why: "Measure recovery time; a quarantine would show as a ~10 min stall." },
      { run: "read neutrino 2e8b203 quarantine path", saw: "3 failures trigger 10-min quarantine; redials dropped silently; no forgive-on-success at service layer", why: "No queries timed out, so answer the exemption question from the code instead." },
    ],
    note: "No-query path recovers in ~2s; the stall needs in-flight queries.",
    lesson: "A rigorous negative result beats a forced repro.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11429#issuecomment-7179289712",
  },
  {
    repo: "lightningnetwork/lnd", number: 11591, kind: "review",
    date: "2026-11-26", commit: "0ebb59dd8",
    title: "kvdb: add db.bolt.mmap-populate option",
    claim: "Tests pass and the option plumbs through to the open call.",
    author: "djkazic",
    pain: "Opening a big channel.db takes tens of minutes on slow storage.",
    before: "bbolt walks pages one by one from disk.",
    after: "This approach was set aside for a pre-read instead (see followup).",
    ran: [
      { run: "go test -run TestBolt ./... (kvdb)", saw: "ok in 1.9s", why: "Run the PR's documented test step first." },
      { run: "make build", saw: "clean", why: "A live check needs a binary built from this branch." },
      { run: "restart signet node with db.bolt.mmap-populate", saw: "mmap_populate=true logged, synced to 332518", why: "Prove the option parses and reaches the database open." },
    ],
    note: "No-op on macOS, so no speedup to measure; draft waits on walletdb tag.",
    lesson: "No-op platforms still verify plumbing end to end.",
    followup: "Closed unmerged: review discussion moved to a pre-read approach.",
    mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11591#issuecomment-7179576832",
  },
  {
    repo: "lightningnetwork/lnd", number: 11586, kind: "review",
    date: "2026-11-26", commit: "1e6d3fbe9",
    title: "feature: add simple taproot close dependencies",
    claim: "All four documented steps pass.",
    author: "ziggie1984",
    pain: "Taproot channels could enable without their required close features.",
    before: "Missing deps slip through startup and connect.",
    after: "Invalid vectors rejected, per the BOLT spec.",
    ran: [
      { run: "go test ./feature .", saw: "ok", why: "Unit tests plus the root package, as the PR lists." },
      { run: "go test -tags=integration ./feature", saw: "ok", why: "The integration tag covers paths plain tests skip." },
      { run: "make sample-conf-check", saw: "ok, 366 options", why: "The PR edits sample-lnd.conf, so its checker must pass." },
      { run: "make lint-native", saw: "ok, 0 issues", why: "The PR lists lint; run the repo's own gate, not a substitute." },
    ],
    note: "Waits on #11279 for overlay nodes.",
    lesson: "Run every listed step; checklists exist to be run in full.",
    followup: "Merged Nov 27. First reviewed PR to land.",
    mergedBy: "ziggie1984",
    comment: "https://github.com/lightningnetwork/lnd/pull/11586#issuecomment-7180927114",
  },
  {
    repo: "lightningnetwork/lnd", number: 11605, kind: "review",
    date: "2026-11-26", commit: "42fb9a232",
    title: "sweep: update lastFeeRate when a published sweep is replaced",
    claim: "The sweep test passes on the fix.",
    author: "MPins",
    pain: "PendingSweeps shows a stale fee after RBF replaces the sweep.",
    before: "Users see the first broadcast fee.",
    after: "Users see the mempool fee.",
    ran: [
      { run: "go test ./sweep/ -run 'TestMarkInputsPublished$' -count=1", saw: "ok in 1.2s", why: "The PR names one exact command; run it verbatim." },
    ],
    note: "Published case and Init guard both behave.",
    lesson: "Small PRs get the same rigor as big ones.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11605#issuecomment-7181239239",
  },
  {
    repo: "lightningnetwork/lnd", number: 11593, kind: "review",
    date: "2026-11-26", commit: "5da320001",
    title: "kvdb: sync compacted bolt db only once",
    claim: "Compaction stays correct with a single final sync.",
    author: "djkazic",
    pain: "Auto-compact syncs every 64 KiB commit to disk.",
    before: "Thousands of wasted syncs per open.",
    after: "One sync at the end.",
    ran: [
      { run: "go test -run TestBoltAutoCompact ./... (kvdb)", saw: "ok in 1.0s", why: "The PR's new test guards the changed compaction path." },
      { run: "make build", saw: "clean", why: "A live check needs a binary built from this branch." },
      { run: "restart signet node with auto-compact forced", saw: "3 DBs compacted clean, synced to 332589", why: "Force the changed code to run on a real node, not just in tests." },
    ],
    note: "DBs here are tiny, so no speedup to measure.",
    lesson: "Force the code path; green tests alone are not the whole story.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11593#issuecomment-7193276734",
  },
  {
    repo: "lightningnetwork/lnd", number: 11446, kind: "review",
    date: "2026-11-26", commit: "5afc94ac6",
    title: "lnd: surface fixed-fee and authentication risks",
    claim: "Tests pass and the new warning prints live.",
    author: "Roasbeef",
    pain: "Risky operator setups fail silently.",
    before: "No warning on fixed-fee rejection or open RPC.",
    after: "Warnings at startup and in docs.",
    ran: [
      { run: "go test ./contractcourt -count=1", saw: "ok in 32s", why: "The nursery warning lives in this package." },
      { run: "go test . -count=1", saw: "ok in 1.3s", why: "The PR lists the root package too." },
      { run: "start signet node with no-macaroons", saw: "new warning prints verbatim, then node restored to normal", why: "A startup log line can only be verified by starting up." },
    ],
    note: "Docs and help text read; warning verified live.",
    lesson: "Read the diff to find what only runs live, then run it.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11446#issuecomment-7194209245",
  },
  {
    repo: "minmoto/payment-channels", number: 56, kind: "research",
    date: "2026-11-26", commit: null,
    title: "research: define one additional market's non-cash payment channel",
    claim: "One uncovered market is worth proposing.",
    author: "okjodom",
    pain: "Most markets have cash channels only.",
    before: "No-cash coverage in 5 markets.",
    after: "One more market defined, if confirmed.",
    ran: [
      { run: "surveyed non-cash coverage by market", saw: "KE, MW, TZ, ZA, ET covered; UG has cash only", why: "Propose only what is missing, backed by the repo itself." },
    ],
    note: "Requested the research task; awaiting maintainer confirmation.",
    lesson: "Check what exists before proposing anything new.",
    followup: null, mergedBy: null,
    comment: "https://github.com/minmoto/payment-channels/issues/56#issuecomment-7181168480",
  },
  {
    repo: "lightningnetwork/lnd", number: 11568, kind: "review",
    date: "2026-11-26", commit: "4737885bb",
    title: "scripts: require three release signatures",
    claim: "Script is valid, threshold reads 3, lint is clean.",
    author: "ziggie1984",
    pain: "Releases stall when 5 signers cannot all show up.",
    before: "Quorum of 5.",
    after: "Quorum of 3, same 1-or-2-key safety.",
    ran: [
      { run: "bash -n scripts/verify-install.sh", saw: "clean", why: "Syntax-check the changed script without running it." },
      { run: "grep MIN_REQUIRED_SIGNATURES= scripts/verify-install.sh", saw: "3", why: "Verify the value itself, not just a green exit code." },
      { run: "make lint-native", saw: "ok, 0 issues", why: "The PR lists the repo lint gate." },
    ],
    note: "First lint run failed on a full local disk; clean rerun green.",
    lesson: "Verify values, not just exit codes.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11568#issuecomment-7201493527",
  },
  {
    repo: "lightningnetwork/lnd", number: 11643, kind: "review",
    date: "2026-11-26", commit: "479ec233d",
    title: "ci: link failed jobs from the CI result summary",
    claim: "The workflow change adds no new findings.",
    author: "ziggie1984",
    pain: "Failed CI jobs hide behind one red check.",
    before: "Dig through logs to find failures.",
    after: "Summary links each failed job.",
    ran: [
      { run: "actionlint .github/workflows/main.yml", saw: "9 findings", why: "actionlint is the one linter that reads workflows." },
      { run: "actionlint master copy for comparison", saw: "same 8, all pre-existing; 1 new info on jq escapes, correct jq", why: "Separate the PR's findings from old ones before judging." },
      { run: "make lint-native", saw: "killed locally (OOM), nothing Go changed", why: "Attempted per the PR; reported honestly instead of hiding it." },
    ],
    note: "Workflow-only change; lint adds no signal here.",
    lesson: "Always diff findings against the base.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11643#issuecomment-7202627300",
  },
  {
    repo: "lightningnetwork/lnd", number: 11590, kind: "review",
    date: "2026-11-27", commit: "f6af0e93b",
    title: "ci: monitor nightly workflow health",
    claim: "Both workflows are valid with no new findings.",
    author: "ziggie1984",
    pain: "Silent nightly failures go unnoticed.",
    before: "Retired runners hide behind CI result.",
    after: "Watchdog reports missing or stale runs.",
    ran: [
      { run: "actionlint both workflow files", saw: "watchdog clean, nightly 1 info", why: "Same workflow method as the previous review." },
      { run: "actionlint master nightly.yml", saw: "zero findings, so the info is new", why: "Confirm against the base instead of assuming." },
    ],
    note: "Backticks in single quotes are intentional markdown; harmless.",
    lesson: "Same method, second time faster: repetition builds speed.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11590#issuecomment-7206885257",
  },
  {
    repo: "lightningnetwork/lnd", number: 11620, kind: "review",
    date: "2026-11-27", commit: "31d4a8b02",
    title: "sweep: record a replacement when the replaced tx has no record",
    claim: "The new test passes with the fix and fails without it.",
    author: "SovereignTechnology",
    pain: "A missed record leaves a tx rebroadcast forever.",
    before: "Replaced tx spams every block.",
    after: "Record kept, rebroadcast cancelled.",
    ran: [
      { run: "go test ./sweep/ -run 'TestHandleBumpEventTxReplaced' -count=1", saw: "ok in 1.1s", why: "Run the PR's exact step first." },
      { run: "new test against master sweeper.go", saw: "fails with tx not found as described", why: "Prove the test guards the fix by watching it fail." },
    ],
    note: "Unmet CancelRebroadcast and StoreTx mocks prove the skipped calls.",
    lesson: "A test that cannot fail proves nothing.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11620#issuecomment-7207039803",
  },
  {
    repo: "lightningnetwork/lnd", number: 11637, kind: "review",
    date: "2026-11-27", commit: "a4288c381",
    title: "backport #11634: discovery live update horizon",
    claim: "The backport matches the parent and its tests pass.",
    author: "ziggie1984",
    pain: "Syncers miss in-flight updates and lose routes.",
    before: "Horizon starts at now, in-flight updates filtered.",
    after: "Horizon starts 5 min back on the release branch.",
    ran: [
      { run: "go vet ./discovery/...", saw: "clean", why: "The PR lists vet before tests." },
      { run: "go test ./discovery/... -count=1", saw: "ok in 14.9s", why: "Full package run catches what narrow tests miss." },
      { run: "both named tests -count=10 -v", saw: "20 of 20 PASS", why: "Repeat flaky-prone sync tests; count the passes, don't trust one ok." },
      { run: "compared file list to parent range", saw: "same 3 files, syncer.go identical", why: "A backport review starts by proving it matches its parent." },
    ],
    note: "Only the documented test adaptation differs.",
    lesson: "Backports are verified against their parent, not just against green.",
    followup: null, mergedBy: null,
    comment: "https://github.com/lightningnetwork/lnd/pull/11637#issuecomment-7208234447",
  },
];
