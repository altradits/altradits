// deploy/verify-sshsig.mjs: the Node check of SSH-signed commits, used on the
// server where OpenSSH is too old for `ssh-keygen -Y verify`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { verifySignedCommit, trustedKeys } from "../deploy/verify-sshsig.mjs";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });

// A throwaway repo with one commit signed by key A, and allowed-signers files for A and B.
function signedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altradits-sshsig-"));
  for (const k of ["a", "b"]) run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", k, "-f", path.join(dir, k)]);
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  const git = (...a) => run("git", ["-C", repo, "-c", "user.name=altradits", "-c", "user.email=altradits@gmail.com", "-c", "gpg.format=ssh", "-c", `user.signingkey=${path.join(dir, "a")}`, ...a]);
  git("init", "-q");
  fs.writeFileSync(path.join(repo, "f.txt"), "hello\n");
  git("add", "f.txt");
  git("commit", "-q", "-S", "-m", "signed by A");
  const allowed = (k) => { const f = path.join(dir, `allowed-${k}`); fs.writeFileSync(f, `altradits@gmail.com namespaces="git" ${fs.readFileSync(path.join(dir, `${k}.pub`), "utf8").split(" ").slice(0, 2).join(" ")}\n`); return f; };
  return { dir, repo, git, allowedA: allowed("a"), allowedB: allowed("b"), raw: git("cat-file", "commit", "HEAD") };
}

test("a commit signed by a trusted key passes; another key, an edit after signing, or no signature fails", () => {
  const r = signedRepo();
  try {
    assert.deepEqual(verifySignedCommit(r.raw, trustedKeys(r.allowedA)), { ok: true });
    assert.equal(verifySignedCommit(r.raw, trustedKeys(r.allowedB)).why, "key not trusted");
    const edited = Buffer.from(r.raw.toString().replace("signed by A", "signed by A, then changed"));
    assert.equal(verifySignedCommit(edited, trustedKeys(r.allowedA)).why, "bad signature");
    r.git("commit", "-q", "--allow-empty", "--no-gpg-sign", "-m", "unsigned");
    assert.equal(verifySignedCommit(r.git("cat-file", "commit", "HEAD"), trustedKeys(r.allowedA)).why, "no SSH signature");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test("a key listed for another namespace is not trusted for git", () => {
  const r = signedRepo();
  try {
    fs.writeFileSync(r.allowedA, fs.readFileSync(r.allowedA, "utf8").replace('namespaces="git"', 'namespaces="file"'));
    assert.equal(verifySignedCommit(r.raw, trustedKeys(r.allowedA)).why, "key not trusted");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test("main's signed merges pass the Node check with the repository's trusted keys", () => {
  const merges = run("git", ["-C", root, "rev-list", "--first-parent", "--max-count=3", "4b6c2a2f2c1e0c9efb046b4f314538d6bd9ff0d0..HEAD"]).toString().trim().split("\n").filter(Boolean)
    .filter((c) => run("git", ["-C", root, "cat-file", "commit", c]).toString().includes("BEGIN SSH SIGNATURE"));
  for (const c of merges) {
    assert.deepEqual(verifySignedCommit(run("git", ["-C", root, "cat-file", "commit", c]), trustedKeys(path.join(root, ".github/allowed_signers"))), { ok: true }, c);
  }
});

test("verify-commits.sh falls back to the Node check when git can't verify SSH signatures (old OpenSSH)", () => {
  const r = signedRepo();
  try {
    fs.mkdirSync(path.join(r.repo, "deploy"));
    for (const f of ["verify-commits.sh", "verify-sshsig.mjs"]) fs.copyFileSync(path.join(root, "deploy", f), path.join(r.repo, "deploy", f));
    const trust = r.git("rev-parse", "HEAD").toString().trim();
    const sh = fs.readFileSync(path.join(r.repo, "deploy/verify-commits.sh"), "utf8").replace(/^TRUST_ROOT=.*$/m, `TRUST_ROOT=${trust}`);
    fs.writeFileSync(path.join(r.repo, "deploy/verify-commits.sh"), sh);
    r.git("add", "deploy");
    r.git("commit", "-q", "-S", "-m", "signed by A, after the trust root");
    // Like the server: git's own SSH check always fails.
    const env = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "gpg.ssh.program", GIT_CONFIG_VALUE_0: "false" };
    const ok = run("sh", ["deploy/verify-commits.sh", "HEAD", r.allowedA], { cwd: r.repo, env }).toString();
    assert.match(ok, /1 commit\(s\) after the trust root, all signed/);
    assert.throws(() => run("sh", ["deploy/verify-commits.sh", "HEAD", r.allowedB], { cwd: r.repo, env }), "an untrusted key is still refused");
  } finally { fs.rmSync(r.dir, { recursive: true, force: true }); }
});
