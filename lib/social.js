// Publishing to Altradits' own social accounts. Each publisher returns
// { id, url } or throws with the platform's error. Keys live only in the
// hosting panel's environment variables, never in the repo.
import crypto from "node:crypto";

const env = (k) => process.env[k] || "";
let http = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
export function setSocialFetch(f) { http = f; } // tests

async function read(res, platform) {
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body.detail || body.title || body.message || body.error?.message || body.errors?.[0]?.message || body.raw || res.statusText;
    throw new Error(`${platform} ${res.status}: ${msg}`);
  }
  return body;
}

// ---------------------------------------------------------------- X
// OAuth 1.0a user context (the app's keys + @altradits' access token).
// A JSON body is not part of the signature.
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export function oauthHeader(method, url, { nonce = crypto.randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const params = {
    oauth_consumer_key: env("X_API_KEY"), oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp), oauth_token: env("X_ACCESS_TOKEN"), oauth_version: "1.0",
  };
  const u = new URL(url);
  const all = [...Object.entries(params), ...u.searchParams.entries()].map(([k, v]) => [pct(k), pct(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const paramStr = all.map(([k, v]) => `${k}=${v}`).join("&");
  const base = [method.toUpperCase(), pct(`${u.origin}${u.pathname}`), pct(paramStr)].join("&");
  const key = `${pct(env("X_API_SECRET"))}&${pct(env("X_ACCESS_SECRET"))}`;
  params.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(params).sort().map((k) => `${pct(k)}="${pct(params[k])}"`).join(", ");
}

async function postX({ text }) {
  const url = "https://api.x.com/2/tweets";
  const res = await http(url, { method: "POST", headers: { Authorization: oauthHeader("POST", url), "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  const { data } = await read(res, "X");
  return { id: data.id, url: `https://x.com/altradits/status/${data.id}` };
}

// ---------------------------------------------------------------- LinkedIn
// Posts API. Stanley's profile needs a member token with w_member_social
// ("Share on LinkedIn" product); the company page needs w_organization_social
// (Community Management API). Tokens last about 60 days.
const LI_VERSION = () => env("LINKEDIN_VERSION") || "202608";
const liHeaders = (token) => ({
  Authorization: `Bearer ${token}`, "Content-Type": "application/json",
  "LinkedIn-Version": LI_VERSION(), "X-Restli-Protocol-Version": "2.0.0",
});

let personUrn = "";
async function linkedinPerson() {
  if (env("LINKEDIN_PERSON_URN")) return env("LINKEDIN_PERSON_URN");
  if (personUrn) return personUrn;
  const res = await http("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${env("LINKEDIN_TOKEN")}` } });
  const { sub } = await read(res, "LinkedIn");
  if (!sub) throw new Error("LinkedIn: set LINKEDIN_PERSON_URN (urn:li:person:…); the token can't read your profile id.");
  return (personUrn = `urn:li:person:${sub}`);
}

async function postLinkedIn({ text, link }, { org }) {
  const token = org ? env("LINKEDIN_ORG_TOKEN") || env("LINKEDIN_TOKEN") : env("LINKEDIN_TOKEN");
  const author = org ? `urn:li:organization:${env("LINKEDIN_ORG_ID")}` : await linkedinPerson();
  const res = await http("https://api.linkedin.com/rest/posts", {
    method: "POST", headers: liHeaders(token),
    body: JSON.stringify({
      author, commentary: text, visibility: "PUBLIC", lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    }),
  });
  await read(res, "LinkedIn");
  const urn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
  if (!urn) throw new Error("LinkedIn: posted, but no post id came back.");
  // The link goes in the first comment (LinkedIn holds back posts with links).
  // Comments come from Stanley's personal account, never the brand: Altradits
  // only replies to people (lib/responder.js).
  if (link && env("LINKEDIN_TOKEN")) {
    const actor = await linkedinPerson().catch(() => null);
    if (actor) {
      await http(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(urn)}/comments`, {
        method: "POST", headers: liHeaders(env("LINKEDIN_TOKEN")), body: JSON.stringify({ actor, object: urn, message: { text: link } }),
      }).catch(() => {});
    }
  }
  return { id: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

// ---------------------------------------------------------------- Facebook
// Page feed with a Page access token (pages_manage_posts). Meta's API has no
// way to post to a personal profile.
async function postFacebook({ text, link }) {
  const page = env("FB_PAGE_ID") || "61579168157529";
  const form = new URLSearchParams({ message: text, access_token: env("FB_PAGE_TOKEN") });
  if (link) form.set("link", link);
  const res = await http(`https://graph.facebook.com/${env("FB_GRAPH_VERSION") || "v25.0"}/${page}/feed`, { method: "POST", body: form });
  const { id } = await read(res, "Facebook");
  return { id, url: `https://www.facebook.com/${id}` };
}

const PUBLISHERS = {
  x: postX,
  li_stan: (p) => postLinkedIn(p, { org: false }),
  li_co: (p) => postLinkedIn(p, { org: true }),
  fb_page: postFacebook,
};

// ---------------------------------------------------------------- replies
// Altradits answers people who comment on its posts or mention it. It never
// starts conversations, comments elsewhere or likes: that's Stanley, personally.
let xUser = null;
async function xMe() {
  if (xUser) return xUser;
  const url = "https://api.x.com/2/users/me";
  const { data } = await read(await http(url, { headers: { Authorization: oauthHeader("GET", url) } }), "X");
  return (xUser = data);
}

export const REPLIERS = {
  // Mentions of @altradits, including replies to our posts.
  x: {
    async comments({ sinceId }) {
      const me = await xMe();
      const url = `https://api.x.com/2/users/${me.id}/mentions?max_results=50&expansions=author_id&tweet.fields=author_id,created_at,conversation_id&user.fields=username${sinceId ? `&since_id=${sinceId}` : ""}`;
      const body = await read(await http(url, { headers: { Authorization: oauthHeader("GET", url) } }), "X");
      const users = Object.fromEntries((body.includes?.users || []).map((u) => [u.id, u.username]));
      return {
        sinceId: body.meta?.newest_id || sinceId,
        items: (body.data || []).filter((t) => t.author_id !== me.id).map((t) => ({
          id: t.id, text: t.text, author: users[t.author_id] ? `@${users[t.author_id]}` : t.author_id, at: t.created_at, url: `https://x.com/i/status/${t.id}`,
        })),
      };
    },
    async reply(item, text) {
      const url = "https://api.x.com/2/tweets";
      const { data } = await read(await http(url, { method: "POST", headers: { Authorization: oauthHeader("POST", url), "Content-Type": "application/json" }, body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: item.id } }) }), "X");
      return `https://x.com/altradits/status/${data.id}`;
    },
  },
  // Comments on the Altradits Facebook Page's own posts.
  fb_page: {
    async comments({ post }) {
      const v = env("FB_GRAPH_VERSION") || "v25.0", page = env("FB_PAGE_ID") || "61579168157529";
      const url = `https://graph.facebook.com/${v}/${post.platformId}/comments?fields=id,message,from{id,name},created_time,permalink_url&filter=stream&limit=50&access_token=${encodeURIComponent(env("FB_PAGE_TOKEN"))}`;
      const body = await read(await http(url, {}), "Facebook");
      return { items: (body.data || []).filter((c) => c.from?.id !== page && c.message).map((c) => ({ id: c.id, text: c.message, author: c.from?.name || "someone", at: c.created_time, url: c.permalink_url || post.url })) };
    },
    async reply(item, text) {
      const v = env("FB_GRAPH_VERSION") || "v25.0";
      const res = await http(`https://graph.facebook.com/${v}/${item.id}/comments`, { method: "POST", body: new URLSearchParams({ message: text, access_token: env("FB_PAGE_TOKEN") }) });
      const { id } = await read(res, "Facebook");
      return `https://www.facebook.com/${id}`;
    },
  },
  // Comments on the Altradits company page's own posts (Community Management API).
  li_co: {
    async comments({ post }) {
      const token = env("LINKEDIN_ORG_TOKEN") || env("LINKEDIN_TOKEN");
      const org = `urn:li:organization:${env("LINKEDIN_ORG_ID")}`;
      const stan = env("LINKEDIN_TOKEN") ? await linkedinPerson().catch(() => null) : null;
      const body = await read(await http(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(post.platformId)}/comments`, { headers: liHeaders(token) }), "LinkedIn");
      return { items: (body.elements || []).filter((c) => c.actor !== org && c.actor !== stan && c.message?.text).map((c) => ({
        id: c.commentUrn || c.$URN || c.id, text: c.message.text, author: "a LinkedIn member", at: c.created?.time ? new Date(c.created.time).toISOString() : null, url: post.url, postUrn: post.platformId,
      })) };
    },
    async reply(item, text) {
      const token = env("LINKEDIN_ORG_TOKEN") || env("LINKEDIN_TOKEN");
      const actor = `urn:li:organization:${env("LINKEDIN_ORG_ID")}`;
      await read(await http(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(item.postUrn)}/comments`, {
        method: "POST", headers: liHeaders(token), body: JSON.stringify({ actor, object: item.postUrn, parentComment: item.id, message: { text } }),
      }), "LinkedIn");
      return item.url;
    },
  },
};

export function connected(channel) {
  if (channel.mode !== "api" || !PUBLISHERS[channel.id]) return false;
  if (channel.id === "li_co" && !(env("LINKEDIN_ORG_TOKEN") || env("LINKEDIN_TOKEN"))) return false;
  return channel.env.every((k) => env(k));
}

export async function publish(channel, post) {
  if (!connected(channel)) throw new Error(`${channel.name} is not connected.`);
  return PUBLISHERS[channel.id](post);
}
