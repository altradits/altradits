#!/usr/bin/env node
// Verifies one commit's SSH signature against a trusted-signers file, in Node,
// for servers whose OpenSSH is older than 8.2 (no `ssh-keygen -Y verify`, so
// `git verify-commit` can't check SSH signatures there). Same rules git applies:
// an SSHSIG in the git namespace, made by an ed25519 key listed in the file,
// over the commit exactly as stored minus its signature header.
//
//   node deploy/verify-sshsig.mjs <commit> <allowed-signers-file>
// Exit 0: good signature from a trusted key. Exit 1: anything else.
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

// SSH wire format: uint32 length, then that many bytes.
function reader(buf) {
  let at = 0;
  const need = (n) => { if (at + n > buf.length) throw new Error("truncated"); };
  return {
    u32() { need(4); const v = buf.readUInt32BE(at); at += 4; return v; },
    bytes(n) { need(n); const v = buf.subarray(at, at + n); at += n; return v; },
    str() { return this.bytes(this.u32()); },
    done() { return at === buf.length; },
  };
}
const sshString = (b) => { const len = Buffer.alloc(4); len.writeUInt32BE(b.length); return Buffer.concat([len, b]); };

// The commit as git signs it: every header line kept except "gpgsig" and its
// continuation lines (which start with a space).
export function splitSignedCommit(raw) {
  const text = raw.toString("utf8");
  const end = text.indexOf("\n\n");
  const head = (end === -1 ? text : text.slice(0, end)).split("\n");
  const body = end === -1 ? "" : text.slice(end);
  const kept = [], sig = [];
  let inSig = false;
  for (const line of head) {
    if (line.startsWith("gpgsig ")) { inSig = true; sig.push(line.slice(7)); continue; }
    if (inSig && line.startsWith(" ")) { sig.push(line.slice(1)); continue; }
    inSig = false;
    kept.push(line);
  }
  return { payload: Buffer.from(kept.join("\n") + body, "utf8"), armored: sig.join("\n") };
}

// Trusted keys: `<principal> [namespaces="git"] ssh-ed25519 <base64>` per line.
export function trustedKeys(file) {
  const keys = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const m = l.match(/^\S+\s+(?:(\S*namespaces="([^"]*)"\S*)\s+)?(ssh-ed25519)\s+([A-Za-z0-9+/=]+)/);
    if (!m) continue;
    if (m[2] !== undefined && !m[2].split(",").includes("git")) continue;
    keys.push(Buffer.from(m[4], "base64"));
  }
  return keys;
}

export function verifySignedCommit(raw, keys) {
  const { payload, armored } = splitSignedCommit(raw);
  const m = armored.match(/^-----BEGIN SSH SIGNATURE-----\n([\s\S]+?)\n-----END SSH SIGNATURE-----$/);
  if (!m) return { ok: false, why: "no SSH signature" };
  const r = reader(Buffer.from(m[1].replace(/\s+/g, ""), "base64"));
  if (r.bytes(6).toString() !== "SSHSIG") return { ok: false, why: "not an SSHSIG" };
  if (r.u32() !== 1) return { ok: false, why: "unknown SSHSIG version" };
  const pubBlob = r.str(), namespace = r.str().toString(), reserved = r.str(), hashAlg = r.str().toString(), sigBlob = r.str();
  if (!r.done()) return { ok: false, why: "trailing data" };
  if (namespace !== "git") return { ok: false, why: `namespace ${namespace}` };
  if (!["sha512", "sha256"].includes(hashAlg)) return { ok: false, why: `hash ${hashAlg}` };
  if (!keys.some((k) => k.equals(pubBlob))) return { ok: false, why: "key not trusted" };
  const pk = reader(pubBlob);
  if (pk.str().toString() !== "ssh-ed25519") return { ok: false, why: "not ed25519" };
  const rawKey = pk.str();
  const sg = reader(sigBlob);
  if (sg.str().toString() !== "ssh-ed25519") return { ok: false, why: "signature not ed25519" };
  const sig = sg.str();
  if (rawKey.length !== 32 || sig.length !== 64 || !pk.done() || !sg.done()) return { ok: false, why: "bad key or signature size" };
  const signed = Buffer.concat([Buffer.from("SSHSIG"), sshString(Buffer.from(namespace)), sshString(reserved), sshString(Buffer.from(hashAlg)),
    sshString(crypto.createHash(hashAlg).update(payload).digest())]);
  const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]), format: "der", type: "spki" });
  return crypto.verify(null, signed, key, sig) ? { ok: true } : { ok: false, why: "bad signature" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [commit, file] = process.argv.slice(2);
  if (!commit || !file) { console.error("usage: node deploy/verify-sshsig.mjs <commit> <allowed-signers-file>"); process.exit(1); }
  try {
    const raw = execFileSync("git", ["cat-file", "commit", commit], { maxBuffer: 16 << 20 });
    const r = verifySignedCommit(raw, trustedKeys(file));
    if (!r.ok) console.error(`verify-sshsig: ${commit.slice(0, 7)}: ${r.why}`);
    process.exit(r.ok ? 0 : 1);
  } catch (err) {
    console.error(`verify-sshsig: ${err.message}`);
    process.exit(1);
  }
}
