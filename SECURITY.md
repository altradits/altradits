# Security policy

Altradits handles real Bitcoin: Lightning and on-chain payments for orders, and custodial Ye₿ente wallets on its own node. Security reports are welcome and taken seriously.

## Reporting a vulnerability
**Please do not open a public issue or pull request for a security problem.** Email **altradits@gmail.com** with the subject line starting "SECURITY:" and include:
- what you found and where (URL, file, endpoint);
- how to reproduce it, step by step;
- what an attacker could do with it;
- whether you have told anyone else.

You will get an acknowledgement within 48 hours and a first assessment within 7 days.

## What happens next
This follows the practice of Bitcoin Core's disclosure policy:
1. The issue is confirmed and fixed privately. A fix that would reveal the problem may land with a neutral description.
2. The fix is deployed, and any affected users are told what they need to do.
3. The issue is disclosed publicly, normally two weeks after the fix is live (sooner if it is already being exploited, later if users still need time to act), crediting the reporter unless they ask not to be named.

## Scope
- altradits.com and everything under /api/
- Ye₿ente (altradits.com/yebente) and its wallets
- The code in this repository, including its build and deploy scripts

Out of scope: denial of service by volume, social engineering of staff, physical attacks, and reports from automated scanners without a demonstrated impact.

## Testing rules (safe harbour)
Good-faith research that follows these rules will not be pursued:
- Use only your own accounts, orders and wallets. Never access, change or delete anyone else's data.
- Never move or attempt to move funds you don't own. Prove a payment issue with the smallest possible amount of your own money, or on a local copy (npm run dev).
- No denial-of-service, spam, or automated flooding; respect the rate limits.
- Stop and report as soon as you have shown the problem.

## How the project protects itself
- Every commit on main after the trust root is signed by a trusted key, and the live server refuses to deploy anything else (deploy/verify-commits.sh, .github/allowed_signers).
- A build-stage security guard and the full test suite run on every pull request (test/build-security.test.mjs).
- Secrets live only in the hosting panel's environment, never in the repository.
- Contribution and review rules: CONTRIBUTING.md and the review guide (docs/review-guide.md).
