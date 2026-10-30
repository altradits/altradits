# Contributing to Altradits

This project handles real money, so it is run the way Bitcoin Core is run: anyone may propose a change, every change is reviewed in the open before it is merged, and only signed merges by a maintainer ever reach the live site. Today there is one maintainer (Stanley, @altradits), who reviews his own work by the same rules a stranger's would face. The detailed, step-by-step way to review is in docs/review-guide.md (also in admin → Stan → Library).

## The roles
- **Contributor:** anyone who opens an issue or a pull request (PR).
- **Reviewer:** anyone who reads a PR and says what they think, with the terms below. Reviews from anyone count; reasoning counts more than rank.
- **Maintainer:** decides when there is enough review to merge, and signs the merge. The only person whose key is in .github/allowed_signers.

## Before you write code
1. Look for an existing issue. If there is none, open one: describe the problem, not the solution. One issue per feature; it closes when the work is finished, not on the first PR.
2. For anything that touches money, wallets, keys, access or public endpoints, get a Concept ACK on the issue first. Big changes without agreement on the idea waste everyone's time.
3. Security problems never go in issues or PRs: see SECURITY.md.

## Making the change
- **One topic per PR.** A PR does one thing. Refactors and moves never mix with behaviour changes; whitespace never mixes with anything.
- **Small, atomic commits** that each build and pass the tests on their own, so the history can be read, reviewed, bisected and reverted.
- **Commit messages:** a short subject that starts with the area, then a blank line and a body that says *why*:
```
ywallet: refuse sends the node can't make before taking anything

The node's side of its channel was below the channel reserve, so every
send failed after the wallet had been debited and refunded...
```
  Areas: site, admin, api, pay, ywallet, yebente, lightning, security, agents, marketing, docs, deploy, test.
- **Tests:** every bug fix comes with a test that fails without the fix. Every new behaviour has a test. Run npm test before pushing.
- **The security guard:** test/build-security.test.mjs encodes the rules learned from this project's audits and from Bitcoin's history. If it blocks you, change your code; if a rule is genuinely wrong, change it in its own PR and explain why.
- **Docs:** when behaviour changes, update the matching document in docs/ in the same PR (the Library PDFs are built from them).
- **Dependencies:** as few as possible, exact versions only, released at least two weeks ago, installed with --ignore-scripts. A new dependency needs its own justification in the PR.
- **Never commit** secrets, keys, passwords, real customer data, phone numbers or anything from the server's environment. The guard scans for common secrets, but you are the first line.

## The pull request
- Fill in the template: why, what changes, security and money, how it was tested.
- Keep it updated: answer every review comment, by changing the code or by explaining why not.
- Rebase on main if it falls behind; don't merge main into your branch.
- A PR that changes after review needs the changed parts reviewed again.

## Review terms (the same as Bitcoin Core's)
- **Concept ACK**: I agree with the goal; I haven't reviewed the code.
- **Concept NACK**: I disagree with the goal (always with reasons).
- **Approach ACK** / **Approach NACK**: about how it is done, not whether.
- **utACK <commit>**: I reviewed the code, but didn't test it.
- **tested ACK <commit>** (or ACK <commit> with what you tested): I reviewed the code and tested it; I'm confident it should be merged as it is at <commit>.
- **NACK**: this should not be merged (always with reasons, and ideally what would change your mind).
- **nit**: a trivial, non-blocking remark (naming, typos). Fix it if you're changing the code anyway.
Always name the commit you reviewed (the first 7+ characters of its hash): an ACK for an old commit doesn't cover new pushes.

## When something is merged
The maintainer merges when:
- the CI checks pass (tests, security guard, dependency audit);
- there is at least one substantive ACK on the latest commit, with the review checklist done;
- every NACK has been answered (by changes, or a clear explanation of why the concern doesn't apply);
- for money, wallets, keys, access and deploy changes: the review guide's security checklist is done. While there is only one maintainer, give these a fresh-eyes pass: ideally the final review happens hours after the work was finished, not straight after.
Merges are made with sh deploy/merge-pr.sh <number>: it fetches exactly the reviewed commit, makes a signed merge commit with a one-line message, runs the tests on the merged result, verifies every signature, and only then pushes. Never squash, never force-push, never merge through the GitHub button.

## Signing and trust
> Current mode: signatures optional and silent. Stanley's Mac signs its commits and merges; other machines (the school laptop) work unsigned, and nothing checks or warns. sh deploy/verify-commits.sh shows which commits are signed, by hand. To make it strict later: add each machine's key to .github/allowed_signers, add the check back to .githooks/pre-push, deploy/merge-pr.sh and the deploy workflow, and create ~/.altradits-allowed-signers on the server.

- Every commit on main after the trust root (deploy/verify-commits.sh) is signed by a key in .github/allowed_signers, like Bitcoin Core's verify-commits.
- The live server checks signatures with its own copy of the trusted keys and refuses to deploy anything else.
- A key is added or removed only in a commit signed by an existing trusted key, and the server's copy is updated by hand.
- Contributors don't need signing keys: the maintainer's signed merge vouches for reviewed work.

## Releases
Releases are signed tags (git tag -s vYYYY.MM.DD) on main, with a short changelog of what users will notice. The Ye₿ente build that ships (yebente/app) is committed with the source that produced it.

## License
By contributing you agree that your work is released under the MIT license in LICENSE.
