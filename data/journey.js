// Journey (/tracker): genesis firsts and the reviewer ladder. Firsts are
// computed from the contribution chain, so they need no curation. Ranks are
// Stanley's own thresholds to tune: reviews counted are logged reviews on
// the six tracked projects (see data/reviews.js).

export const REVIEW_RANKS = [
  { at: 0, title: "Curious", text: "Reading other people's code." },
  { at: 1, title: "First review", text: "Posted the first test report." },
  { at: 5, title: "Reviewer", text: "Five reviews deep." },
  { at: 10, title: "Trusted reviewer", text: "Ten reviews; authors know the name." },
  { at: 25, title: "Review pillar", text: "Twenty-five reviews and counting." },
];
