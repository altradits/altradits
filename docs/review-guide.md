# How to review a change, the Bitcoin Core way
A practical guide to reviewing pull requests on Altradits, including your own, as if the project were Bitcoin Core: slowly, in order, with evidence, and with the assumption that someone will try to abuse whatever you approve. CONTRIBUTING.md has the rules; this is the craft.

> In Bitcoin Core, review is the bottleneck and the safety net: code is cheap, careful review is not. Many reviewers, each saying exactly what they checked, are why a public project holding enormous value stays safe. Alone, you are every one of those reviewers, so you review in passes, each with one question.

## The seven passes
**1. Concept: should this exist?**
- What problem does it solve, for whom? Is the problem real (is there an issue, a report, a failing payment)?
- Is this the smallest change that solves it? Could it be solved by removing something instead?
- Does it widen what strangers can do (new endpoint, new public page, new data shown)? If so, is that worth the risk?
Write down: Concept ACK or NACK, and why.

**2. Approach: is this the right way?**
- Does it follow the existing patterns (store, rate limits, recordAttack, publicFetch, the ledger lock), or invent a new one?
- Where does trust come from? Name the input, who controls it, and what checks it.
- What happens on failure, timeout, retry and duplicate (two requests at once, the same payment confirmed twice)?
Write down: Approach ACK or NACK.

**3. Read the code, commit by commit**
```
gh pr checkout 123                 # the branch, locally
git log --oneline main..HEAD       # the commits
git log -p --reverse main..HEAD    # each commit's change, in order
git diff main...HEAD --stat        # what files changed overall
```
- Read every line. "Looks fine" without reading is not a review.
- For each changed function: what are its inputs, and what happens with an empty, huge, negative, non-integer, duplicated or hostile one?
- Look at what is not in the diff: callers of a changed function, tests that should have changed and didn't, docs that now lie.
- After the author pushes again, review only what changed since your ACK:
```
git range-diff <old-base>..<old-head> <new-base>..<new-head>
```

**4. Test it, and try to break it**
```
npm test
node --test test/build-security.test.mjs
npm run dev                        # http://localhost:3000, admin token "dev"
```
- Every bug fix must have a test that fails without the fix. Check it really does: undo the fix locally, run the test, watch it fail, restore.
- Try the abuse case by hand on the local copy: the wrong token, the replayed request, the huge amount, the unconfirmed email, the internal URL.
- Never test money paths on the live site.

**5. Security checklist** (any change touching money, wallets, keys, access, outside requests, pages or deploy)
- Access: does anything unlock on a typed email, name or phone number? It must need a secret token or a confirmation link.
- Public endpoints: per-visitor and site-wide limits (hit()), and anything that costs us (node invoices, AI, email, M-Pesa) behind sign-in or a secret.
- Outside URLs: fetched only through publicFetch (lib/netsafe.js), never fetch() on an address someone else supplied.
- Pages: no inline onclick or javascript: links; visitor text escaped (esc) before innerHTML; page policy refreshed (node deploy/page-csp.mjs).
- Secrets: none in code, logs, URLs, error messages or test fixtures; compared with safeEqual.
- Money: amounts are safe integers under 21 million BTC; payments identified by payment hash, address or node record, never a txid; on-chain needs confirmations by amount; a payout is refunded only on the node's own FAILED; every balance change under the ledger lock; credits once per reference.
- Rejections recorded: anything turned away calls recordAttack, so the Security watch sees it.
- Bitcoin's history: does the change reopen any lesson in data/bitcoin-attacks.js (the attack-history PDF)?
- Run the security-reviewer agent (.claude/agents/security-reviewer.md) on the diff and read what it says; it is one more reviewer, not the last word.

**6. Write the review**
Say exactly what you did, against which commit. Examples:
```
Concept ACK. Sends failing silently is worse than refusing up front.

Approach ACK 88d9897. Counting only the sats above the channel reserve
is what LND itself does when it routes.

tested ACK 88d9897
- read every commit
- npm test: 186 pass; reverted the outboundSats change and the
  "sending power" test failed, restored
- tried a send with 0 spendable on a local copy: refused, wallet untouched
nit: "sats" vs "satoshis" in the admin note, not blocking
```
```
NACK 3f2a1c9: /api/topup creates node invoices without sign-in. That
reopens the flood the October audit closed. Would ACK if it moves
behind the admin token or reuses /api/donate's limits.
```

**7. Merge (maintainer)**
```
sh deploy/merge-pr.sh 123           # prepares, tests and verifies the signed merge
git push origin main                 # or: sh deploy/merge-pr.sh 123 --push
```
Then watch the deploy (gh run list --limit 2), open the changed page on the live site, and glance at admin → Stan → Security watch.

## Reviewing your own work
You know what you meant, so you read what you meant, not what you wrote. Ways around that:
- Put time between writing and reviewing. For money, wallet, key and deploy changes, review the next session, not the same one.
- Review in a different place: the GitHub "Files changed" view, not your editor.
- Review as a stranger: pretend the PR came from someone you've never met who wants your node's sats. What would you check first?
- Explain the change out loud (or in the PR description) in plain words. Gaps in the explanation are gaps in the code.
- Write the abuse test first, then read the code until you know why it passes.
- Ask the security-reviewer agent, and read its findings critically.
- Post your ACK comment on the PR anyway. Writing "tested ACK <hash>" with what you tested makes you actually do it, and leaves a record.

## Case studies from this project
Each of these reached main and was found later. The question that would have caught it:
1. **Portal takeover by email (fixed Oct 2026).** A new order with someone's email was merged into their account. Question: "Who proves they own this email before we hand over anything?"
2. **Refund on a tunnel error.** A gateway error page was treated as a failed payment and refunded while the node might still pay. Question: "Is this answer final, or just the absence of an answer?"
3. **Sign-in-free node invoices.** Anyone could make the node create invoices without limit. Question: "What does it cost us if a script calls this a million times?"
4. **Daily caps counting the latest 200 entries.** Many tiny payments pushed big ones out of the window. Question: "What if there are more records than the loop reads?"
5. **DNS rebinding in outside lookups.** The address was checked, then fetched again, possibly resolving elsewhere. Question: "Is what I checked exactly what I use?"
6. **Pages served without their policy.** nginx sent pages straight from disk, skipping header rules. Question: "Did I check this on the live site, or only locally?"
7. **The channel reserve counted as spendable.** The node looked able to send 20,143 sats and could send none. Question: "Is this number what the system can actually do, or just what it holds?"
8. **A single-peer claim that was wrong.** The documentation said LND had one peer; it had one preferred peer and thousands known. Question: "Did I verify this, or infer it?"

## The habits, in one list
- Concept, approach, code, test, security, write, merge: in that order, every time.
- Name the commit you reviewed.
- A fix without a failing test is not done.
- Prefer refusing up front to failing halfway.
- Turn every lesson into a test or a guard rule, so it can't come back.
