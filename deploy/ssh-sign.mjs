// Minimal `ssh-keygen -Y sign` replacement for git SSH commit signing.
// Git calls: <program> -Y sign -f <keyfile> -n git   (commit bytes on stdin)
// Reads an unencrypted OpenSSH ed25519 private key, emits SSHSIG armor (PROTOCOL.sshsig).
// Key never leaves this machine; signature is identical in kind to ssh-keygen's.
import fs from "node:fs";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const keyFile = args[args.indexOf("-f") + 1];
const namespace = args[args.indexOf("-n") + 1] || "git";
if (!keyFile) { console.error("usage: ssh-sign -Y sign -f <keyfile> -n <namespace>"); process.exit(1); }
// Git passes user.signingkey, which points at the .pub; the private half sits beside it.
const privPath = keyFile.endsWith(".pub") ? keyFile.slice(0, -4) : keyFile;
const privText = fs.readFileSync(privPath, "utf8");

// Parse openssh-key-v1 (unencrypted only): magic + cipher/kdf + keys.
const body = privText.split("\n").filter((l) => l && !l.startsWith("---")).join("");
const buf = Buffer.from(body, "base64");
let o = 0;
const take = (n) => { const s = buf.subarray(o, o + n); o += n; return s; };
const takeStr = () => take(take(4).readUInt32BE(0));
if (take(15).toString() !== "openssh-key-v1\0") throw new Error("not an openssh-key-v1 file");
if (takeStr().toString() !== "none") throw new Error("encrypted keys are not supported here");
takeStr(); takeStr(); // kdfname, kdfoptions
if (take(4).readUInt32BE(0) !== 1) throw new Error("expected exactly one key");
const pubRaw = takeStr(); // 51-byte ssh-ed25519 public blob (also in the .pub file)
const priv = takeStr();
let p = 0;
const pStr = () => { const n = priv.readUInt32BE(p); p += 4; const s = priv.subarray(p, p + n); p += n; return s; };
p += 8; // checkints
pStr(); // key type
const pubInside = pStr(); // 32 raw public bytes
const keypair = pStr().subarray(0, 64); // 32 seed + 32 pub (rest of field is comment + padding)
const seed = keypair.subarray(0, 32);
if (!keypair.subarray(32).equals(pubInside)) throw new Error("keypair mismatch");
if (!pubInside.equals(pubRaw.subarray(19))) throw new Error("public key mismatch");

// Cross-check against the .pub file git was configured with.
const pubLine = fs.readFileSync(keyFile.endsWith(".pub") ? keyFile : keyFile + ".pub", "utf8").trim().split(/\s+/);
if (Buffer.from(pubLine[1], "base64").compare(pubRaw) !== 0) throw new Error("private key does not match .pub file");

// ed25519 key objects from raw bytes (fixed PKCS8/SPKI DER prefixes).
const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pubRaw.subarray(19)]);
const privKey = crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
const pubKey = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });

// The message git wants signed (commit content without the gpgsig header).
// Like ssh-keygen: with file operands, sign each and write <file>.sig;
// otherwise read stdin and write the armor to stdout.
const files = args.filter((a) => !a.startsWith("-") && a !== "sign" && a !== keyFile && a !== namespace);
const inputs = files.length ? files.map((f) => [fs.readFileSync(f), `${f}.sig`]) : [[fs.readFileSync(0), null]];
const [msg, outPath] = inputs[0];
const str = (b) => { const s = Buffer.isBuffer(b) ? b : Buffer.from(b); const l = Buffer.alloc(4); l.writeUInt32BE(s.length); return Buffer.concat([l, s]); };
const toSign = Buffer.concat([Buffer.from("SSHSIG"), str(namespace), str(""), str("sha512"), str(crypto.createHash("sha512").update(msg).digest())]);
const rawSig = crypto.sign(null, toSign, privKey); // 64 bytes for ed25519
if (!crypto.verify(null, toSign, pubKey, rawSig)) throw new Error("self-check failed: signature did not verify");

const sigBlob = Buffer.concat([str("ssh-ed25519"), str(rawSig)]);
const out = Buffer.concat([Buffer.from("SSHSIG"), Buffer.from([0, 0, 0, 1]), str(pubRaw), str(namespace), str(""), str("sha512"), str(sigBlob)]);
const b64 = out.toString("base64").replace(/.{70}/g, "$&\n");
const armor = `-----BEGIN SSH SIGNATURE-----\n${b64}\n-----END SSH SIGNATURE-----\n`;
if (outPath) fs.writeFileSync(outPath, armor);
else process.stdout.write(armor);
