// Requests to addresses other people give us (job pages, Lightning addresses):
// public internet hosts only. The address is checked when the connection is
// made, on the very IP it connects to, so a name can't answer with a public IP
// for the check and a private one for the request (DNS rebinding).
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";

// Addresses that aren't the public internet: loopback, private networks,
// link-local (cloud metadata), CGNAT, benchmarking, multicast, reserved, and
// the IPv6 forms that carry an IPv4 address (mapped, NAT64, 6to4, Teredo).
export function privateIp(raw) {
  const ip = String(raw || "").trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || (a === 192 && b === 88 && c === 99);
  }
  if (!net.isIPv6(ip)) return true; // not an address we can judge: refuse
  const g = expand6(ip);
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true; // :: and ::1
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return privateIp(v4(g[6], g[7])); // ::ffff:a.b.c.d, ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateIp(v4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return privateIp(v4(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00 || g[0] === 0x100;
}
function expand6(ip) {
  if (ip.includes(".")) { // a trailing dotted IPv4 part
    const i = ip.lastIndexOf(":"), [a, b, c, d] = ip.slice(i + 1).split(".").map(Number);
    ip = `${ip.slice(0, i + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return groups.map((x) => parseInt(x || "0", 16));
}

// Tests run fake servers on this machine. Never on the live server, whatever the environment says.
export const localAllowed = () => process.env.JOBS_ALLOW_LOCAL === "1" && process.env.NODE_ENV !== "production" && !process.env.PASSENGER_APP_ENV;
const REFUSED = "That address isn't a public website.";

function guardedLookup(host, opts, cb) {
  dns.lookup(host, { ...opts, all: true }, (e, addrs) => {
    if (e) return cb(e);
    if (!addrs.length || (!localAllowed() && addrs.some((a) => privateIp(a.address)))) return cb(Object.assign(new Error(REFUSED), { code: "EPUBLICONLY" }));
    return opts.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
  });
}

// fetch() for outside addresses: no redirects followed (the caller checks each
// hop), at most maxBytes read, and only public IPs ever connected to.
export function publicFetch(raw, { method = "GET", headers = {}, signal, timeout = 15000, maxBytes = 2_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(String(raw)); } catch { return reject(new Error("That isn't a valid link.")); }
    if (!["http:", "https:"].includes(u.protocol)) return reject(new Error("Only http(s) links."));
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && privateIp(host) && !localAllowed()) return reject(new Error(REFUSED));
    const req = (u.protocol === "https:" ? https : http).request(u, { method, headers, signal, timeout, lookup: guardedLookup }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => { size += c.length; if (size > maxBytes) req.destroy(new Error("That page is too large.")); else chunks.push(c); });
      res.on("end", () => {
        const status = res.statusCode >= 200 && res.statusCode <= 599 ? res.statusCode : 502;
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) h.set(k, Array.isArray(v) ? v.join(", ") : String(v));
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: h }));
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("The website took too long to answer.")));
    req.on("error", (e) => reject(e.code === "EPUBLICONLY" || e.cause?.code === "EPUBLICONLY" ? new Error(REFUSED) : e));
    req.end();
  });
}
