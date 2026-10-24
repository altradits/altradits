// The in-house marketing team: AI agents distilled from
// github.com/altradits/agency-agents/tree/main/marketing. Every day they plan,
// write, review and publish Altradits' posts on its own social accounts.

export const MARKETING_TEAM = [
  { id: "strategist", name: "Social Media Strategist", role: "Leads the team and plans the day",
    source: "marketing/marketing-social-media-strategist.md",
    rules: "Owns the daily plan: one theme per day, adapted per platform, never the same text twice. Balances value posts with offers so the feed never reads like an ad wall." },
  { id: "growth", name: "Growth Hacker", role: "Picks what to push, measures what sells",
    source: "marketing/marketing-growth-hacker.md",
    rules: "Reads the last 14 days of results per channel (posts, visits that became orders, revenue) and decides which offer, angle and channel gets more weight. Tests one new hook angle per day and keeps what works." },
  { id: "writer", name: "Content Creator", role: "Brand voice and storytelling",
    source: "marketing/marketing-content-creator.md",
    rules: "Writes in Altradits' voice: plain, warm, specific, confident. Concrete tasks and real prices over hype. Tells Stanley's real story: a founder who built the whole system and leads a freelancer team." },
  { id: "x", name: "Twitter Engager", role: "X posts",
    source: "marketing/marketing-twitter-engager.md",
    rules: "Value first: tips, observations and stories, with offers in at most 1 of 3 posts. Under 260 characters, no links (the bio carries the link), at most 1 hashtag, a natural voice that invites replies." },
  { id: "linkedin", name: "LinkedIn Content Creator", role: "Stanley's profile and the company page",
    source: "marketing/marketing-linkedin-content-creator.md",
    rules: "The first line is a hook that earns the 'see more' click. Every post has a clear point of view and specifics. Short paragraphs, 3 to 5 specific hashtags, no link in the body (the link goes in the first comment). Stanley's profile speaks in first person as the founder; the company page speaks as Altradits." },
  { id: "tiktok", name: "TikTok Strategist", role: "Short video scripts",
    source: "marketing/marketing-tiktok-strategist.md",
    rules: "A 20 to 40 second vertical video script: a 3-second hook, on-screen text, what to film (screen recording of the site, a hand on a phone paying, a desk timelapse), voiceover lines, caption and 3 to 5 hashtags. Mostly educational or entertaining; promotional at most 1 in 4." },
  { id: "guardian", name: "Brand Guardian", role: "Checks every post before it goes out",
    source: "marketing (QA, as in the department agents' Quality Reviewer)",
    rules: "Blocks anything that invents clients, reviews, testimonials, results or statistics; quotes a price that is not in the catalog; promises what the site doesn't offer; reveals a phone number; is spammy, clickbait or off-brand; or breaks the platform's length rules." },
];

// Where the team posts. mode "api" publishes automatically once its keys are
// set; until then (and for channels with no posting API) the posts arrive in
// Stanley's daily "ready to post" email. ref tags links so the Growth Hacker
// can see which channel brought each order (?ref= is stored on the order).
export const CHANNELS = [
  { id: "x", name: "X · @altradits", url: "https://x.com/altradits", agent: "x", mode: "api",
    env: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"], slots: ["07:00", "12:30", "18:00"], max: 260, link: false, ref: "mkxpost" },
  { id: "li_stan", name: "LinkedIn · Stanley", url: "https://www.linkedin.com/in/stanmobitech/", agent: "linkedin", mode: "api",
    env: ["LINKEDIN_TOKEN"], slots: ["08:00"], max: 2800, link: "comment", ref: "mklistan" },
  { id: "li_co", name: "LinkedIn · Altradits page", url: "https://www.linkedin.com/company/altradits", agent: "linkedin", mode: "api",
    env: ["LINKEDIN_ORG_ID"], slots: ["11:00"], max: 2800, link: "comment", ref: "mklico" },
  { id: "fb_page", name: "Facebook · Altradits page", url: "https://www.facebook.com/profile.php?id=61579168157529", agent: "writer", mode: "api",
    env: ["FB_PAGE_TOKEN"], slots: ["15:00"], max: 1500, link: "body", ref: "mkfbpage" },
  // Meta's API cannot post to personal profiles, and TikTok's needs a video
  // file: these two always come as ready-to-post drafts.
  { id: "fb_stan", name: "Facebook · Stanley", url: "https://www.facebook.com/profile.php?id=61579237182379", agent: "writer", mode: "manual",
    env: [], slots: ["16:00"], max: 1200, link: "body", ref: "mkfbstan" },
  { id: "tiktok", name: "TikTok · @altradits", url: "https://www.tiktok.com/@altradits", agent: "tiktok", mode: "manual",
    env: [], slots: ["17:00"], max: 2200, link: false, ref: "mktiktok" },
];

// Profiles the posts may point people to (the GitHub link is for developer audiences).
export const PROFILES = { github: "https://github.com/altradits" };

// One theme a day keeps the feed varied; the Growth Hacker can override it.
export const THEMES = [
  "Offer spotlight: one same-day quick job, what you get and the price",
  "Founder story: why Stanley built Altradits and how the team works",
  "Free value: a practical time-saving tip for busy founders",
  "Test us: the $5 fifteen-minute task as a no-risk first step",
  "Behind the scenes: AI department agents plus human freelancers, checked before delivery",
  "Pay with Bitcoin: one QR, any wallet, fees shown up front",
  "Community: freelancers from weVenture Hub (Addis Ababa) and Zone01 (Kisumu), 100+ on standby",
];

// The weekly treasure hunt (lib/hunt.js): one word a week, a letter in every post.
// The coupon is earned by sharing a personal link that someone else opens, and
// works for one order.
export const HUNT = {
  site: "https://altradits.com",
  hashtag: "#AltraditsHunt", // the same tag on every post, every week: it markets the brand and marks the clue
  couponPct: 10,   // % off one order
  couponDays: 30,  // unused codes expire after this
  words: ["DELEGATE", "SAMEDAY", "FOUNDERS", "QUICKJOB", "SPEEDRUN", "SATOSHI", "HANDOVER", "FREEDOM", "BITCOIN", "FASTLANE"],
};

// How far ahead the scheduler keeps every slot filled.
export const HORIZON_DAYS = 7;

export const POSTS_PER_DAY = CHANNELS.reduce((n, c) => n + c.slots.length, 0);
