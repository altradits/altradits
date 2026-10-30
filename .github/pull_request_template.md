<!--
Read CONTRIBUTING.md first. One topic per pull request; refactors separate from behaviour changes.
Never include secrets, personal data or real customer information.
-->

### Why
<!-- The problem, and why this is the right change. -->

### Issue
<!-- Every PR belongs to an issue. Partial work: "Part of #N" (the issue stays open).
     The PR that finishes it: "Closes #N" (the issue closes when this PR is merged). -->
Part of #

### What changes
<!-- In plain words, per area. -->

### Security and money
<!-- Does this touch payments, wallets, keys, access, outside requests or public endpoints?
     How could it be abused, and what stops that? "None" is an answer, but say why. -->

### How it was tested
<!-- Commands run and their results; a test that fails without this change, for every bug fixed. -->

### Review checklist (reviewer)
- [ ] Concept ACK: the problem is real and worth solving
- [ ] Approach ACK: this is the right way to solve it
- [ ] Read every line of the diff, commit by commit
- [ ] Ran `npm test` and tried to break it
- [ ] Looked at the change in a browser (desktop and phone) where it shows on a page
- [ ] Security checklist in docs/review-guide.md
- [ ] Docs in docs/ updated if behaviour changed
- [ ] ACK comment posted with the head commit hash
