// Opcode Circuit puzzle views: briefing, widgets, inputs, verdict, debrief.
// Widgets are small teaching tools: hash pads, a miner, a script debugger.
import { hexToBytes, bytesToHex, sha256, doubleSha256, segwitDecode, base58CheckDecode, concat, bytesToBig, bigToBytes, pointMult, ecdsaSign, derEncode, SECP_N, schnorrVerify, convertBits } from "../sim/primitives.js";
import { parseAsm, execute, disassemble } from "../sim/interpreter.js";
import { blockHashOf, hashMeetsBits, packageRate, checkRBF, vulnerableSum, patchedSum, taprootOutputKey, verifyControlPath } from "../sim/toychain.js";
import { fundingWitnessScript, p2wshScript, paymentHash, htlcClaim, htlcRefund, invoiceDecode, toyOnionPeel } from "../sim/lightning.js";
import { starsFor, formatCost } from "../engine/score.js";
import { recordSolve, saveState, unlockAchievement, resetState, blankState } from "../engine/store.js";
import { ACHIEVEMENTS, checkAchievements } from "../engine/achieve.js";
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hexOk(s) { return /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0 && s.length > 0; }
// Each widget renders tools above the answer box. root is a div to fill.
export function renderWidget(kind, puzzle, root) {
  if (kind === "hashpad") {
    root.innerHTML = `<label for="w-a">Input A (text)</label><input type="text" id="w-a" value="abc" autocomplete="off">`
      + `<label for="w-b">Input B (text)</label><input type="text" id="w-b" value="abd" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const a = root.querySelector("#w-a").value, b = root.querySelector("#w-b").value;
      const ha = bytesToHex(sha256(new TextEncoder().encode(a))), hb = bytesToHex(sha256(new TextEncoder().encode(b)));
      const diff = [...ha].filter((c, i) => c !== hb[i]).length;
      root.querySelector("#w-out").textContent = `SHA(A) ${ha} | SHA(B) ${hb} | differ: ${diff} of 64`;
    };
    root.querySelector("#w-a").addEventListener("input", upd);
    root.querySelector("#w-b").addEventListener("input", upd);
    upd();
  } else if (kind === "addrcheck") {
    root.innerHTML = `<label for="w-a">Address A</label><input type="text" id="w-a" value="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb" autocomplete="off">`
      + `<label for="w-b">Address B</label><input type="text" id="w-b" value="bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const one = (s) => {
      try { base58CheckDecode(s); return "base58 valid"; } catch { /* try bech32 */ }
      try { segwitDecode(s); return "segwit valid"; } catch (e) { return `broken: ${e.message}`; }
    };
    const upd = () => {
      root.querySelector("#w-out").textContent = `A: ${one(root.querySelector("#w-a").value.trim())} | B: ${one(root.querySelector("#w-b").value.trim())}`;
    };
    root.querySelector("#w-a").addEventListener("input", upd);
    root.querySelector("#w-b").addEventListener("input", upd);
    upd();
  } else if (kind === "mine") {
    root.innerHTML = `<p class="brief">Header: version 1, prev ${"00".repeat(4)}..., merkle ${"22".repeat(4)}..., time 1700000000, bits 1f00ffff.</p>`
      + `<div class="btnrow"><button type="button" class="btn" id="w-go">Mine</button></div><p class="verdict" id="w-out">Press Mine.</p>`;
    root.querySelector("#w-go").addEventListener("click", () => {
      const out = root.querySelector("#w-out");
      const base = { version: 1, prevHash: "00".repeat(32), merkleRoot: "22".repeat(32), time: 1700000000, bits: 0x1f00ffff, nonce: 0 };
      let start = 0;
      out.textContent = "Mining from nonce 0...";
      const step = () => {
        for (let n = start; n < start + 20000; n++) {
          const h = { ...base, nonce: n >>> 0 };
          if (hashMeetsBits(blockHashOf(h), h.bits)) {
            out.textContent = `Won at nonce ${n} after ${n + 1} tries. Type it in the answer box.`;
            return;
          }
        }
        start += 20000;
        out.textContent = `Trying nonce ${start}, still over target...`;
        setTimeout(step, 0);
      };
      setTimeout(step, 0);
    });
  } else if (kind === "pairhash") {
    root.innerHTML = `<label for="w-l">Left (64 hex)</label><input type="text" id="w-l" autocomplete="off" spellcheck="false">`
      + `<label for="w-r">Right (64 hex)</label><input type="text" id="w-r" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out">Double SHA-256 of left plus right appears here.</p>`;
    const upd = () => {
      const l = root.querySelector("#w-l").value.trim(), r = root.querySelector("#w-r").value.trim();
      const out = root.querySelector("#w-out");
      if (!hexOk(l) || !hexOk(r)) { out.textContent = "Both sides need even length hex."; return; }
      out.textContent = `H(H(left + right)) = ${bytesToHex(doubleSha256(concat(hexToBytes(l.toLowerCase()), hexToBytes(r.toLowerCase()))))}`;
    };
    root.querySelector("#w-l").addEventListener("input", upd);
    root.querySelector("#w-r").addEventListener("input", upd);
  } else if (kind === "debugger") {
    renderDebugger(puzzle, root);
  } else if (kind === "cltv") {
    root.innerHTML = `<label for="w-h">Spending height</label><input type="text" id="w-h" value="999" autocomplete="off">`
      + `<div class="btnrow"><button type="button" class="btn" id="w-go">Run lock</button></div><p class="verdict" id="w-out"></p>`;
    root.querySelector("#w-go").addEventListener("click", () => {
      const h = Number(root.querySelector("#w-h").value.trim());
      const out = root.querySelector("#w-out");
      if (!Number.isInteger(h) || h < 0) { out.textContent = "Type a whole height."; return; }
      const r = execute(parseAsm(puzzle.lock), [], { txLocktime: h, inputSequence: 0xfffffffe });
      out.textContent = r.ok ? `Height ${h}: spends.` : `Height ${h}: fails (${r.error})`;
    });
  } else if (kind === "signer") {
    const msg = puzzle.ctx.msgHash;
    root.innerHTML = `<p class="brief">Toy signer. Fixed nonce per key. Real wallets never do this. Toy hash ${esc(msg)}.</p>`
      + `<div class="btnrow"><button type="button" class="btn" data-k="1">Sign key 1</button>`
      + `<button type="button" class="btn" data-k="2">Sign key 2</button>`
      + `<button type="button" class="btn" data-k="3">Sign key 3</button></div><p class="verdict" id="w-out">Sigs appear here.</p>`;
    root.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => {
      const k = BigInt(b.getAttribute("data-k"));
      const priv = bigToBytes(k, 32);
      let { r, s } = ecdsaSign(priv, hexToBytes(msg), 100n + k);
      if (s > SECP_N / 2n) s = SECP_N - s;
      root.querySelector("#w-out").textContent = `Sig key ${k}: ${bytesToHex(concat(derEncode(r, s), Uint8Array.of(0x01)))}`;
    }));
  } else if (kind === "hexpad") {
    root.innerHTML = `<label for="w-t">Text</label><input type="text" id="w-t" value="bravo-seven-secret" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const t = root.querySelector("#w-t").value;
      const b = new TextEncoder().encode(t);
      root.querySelector("#w-out").textContent = `hex ${bytesToHex(b)} (${b.length} bytes) | sha256 ${bytesToHex(sha256(b))}`;
    };
    root.querySelector("#w-t").addEventListener("input", upd);
    upd();
  } else if (kind === "segwit") {
    root.innerHTML = `<label for="w-a">Address</label><input type="text" id="w-a" value="bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const d = segwitDecode(root.querySelector("#w-a").value.trim());
        out.textContent = `version ${d.version}, ${d.encoding}, program ${bytesToHex(d.program)}`;
      } catch (e) { out.textContent = `broken: ${e.message}`; }
    };
    root.querySelector("#w-a").addEventListener("input", upd);
    upd();
  } else if (kind === "schnorr") {
    root.innerHTML = `<label for="w-p">Pubkey x (64 hex)</label><input type="text" id="w-p" value="F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9" autocomplete="off" spellcheck="false">`
      + `<label for="w-m">Message (64 hex)</label><input type="text" id="w-m" value="${"00".repeat(32)}" autocomplete="off" spellcheck="false">`
      + `<label for="w-s">Signature (128 hex)</label><input type="text" id="w-s" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out">Paste a candidate sig.</p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const ok = schnorrVerify(hexToBytes(root.querySelector("#w-p").value.trim().toLowerCase()), hexToBytes(root.querySelector("#w-m").value.trim().toLowerCase()), hexToBytes(root.querySelector("#w-s").value.trim().toLowerCase()));
        out.textContent = ok ? "VALID signature." : "INVALID signature.";
      } catch (e) { out.textContent = `Need full hex: ${e.message}`; }
    };
    root.querySelector("#w-s").addEventListener("input", upd);
  } else if (kind === "taptweak") {
    root.innerHTML = `<label for="w-p">Internal key x (64 hex)</label><input type="text" id="w-p" value="F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9" autocomplete="off" spellcheck="false">`
      + `<label for="w-m">Merkle root hex (empty for key path only)</label><input type="text" id="w-m" value="" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const px = hexToBytes(root.querySelector("#w-p").value.trim().toLowerCase());
        const m = root.querySelector("#w-m").value.trim();
        const Q = taprootOutputKey(px, m ? hexToBytes(m.toLowerCase()) : null);
        out.textContent = `Output x: ${bytesToHex(bigToBytes(Q.x, 32))}`;
      } catch (e) { out.textContent = `Need hex: ${e.message}`; }
    };
    root.querySelector("#w-p").addEventListener("input", upd);
    root.querySelector("#w-m").addEventListener("input", upd);
    upd();
  } else if (kind === "controlblock") {
    root.innerHTML = `<label for="w-i">Internal key x</label><input type="text" id="w-i" value="f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9" autocomplete="off" spellcheck="false">`
      + `<label for="w-l">Leaf hash</label><input type="text" id="w-l" value="a85b2107f791b26a84e7586c28cec7cb61202ed3d01944d832500f363782d675" autocomplete="off" spellcheck="false">`
      + `<label for="w-s">Sibling</label><input type="text" id="w-s" autocomplete="off" spellcheck="false">`
      + `<label for="w-o">Output x</label><input type="text" id="w-o" value="679489af0cbf6c97bc15fc3ca5f6b4f264cc0a903715bbdf3fabadaece3405c8" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out">Paste a sibling.</p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const g = (id) => hexToBytes(root.querySelector(id).value.trim().toLowerCase());
        const ok = verifyControlPath(g("#w-i"), g("#w-l"), [g("#w-s")], g("#w-o"));
        out.textContent = ok ? "VALID path: leaf sits under the output key." : "INVALID path.";
      } catch (e) { out.textContent = `Need full hex: ${e.message}`; }
    };
    root.querySelector("#w-s").addEventListener("input", upd);
  } else if (kind === "feerate") {
    root.innerHTML = `<label for="w-f">Fee sats</label><input type="text" id="w-f" value="2000" autocomplete="off">`
      + `<label for="w-v">Vsize</label><input type="text" id="w-v" value="200" autocomplete="off">`
      + `<label for="w-af">Ancestor fees (comma, blank for none)</label><input type="text" id="w-af" value="" autocomplete="off">`
      + `<label for="w-av">Ancestor vsizes (comma)</label><input type="text" id="w-av" value="" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const fee = Number(root.querySelector("#w-f").value), vsize = Number(root.querySelector("#w-v").value);
        const af = root.querySelector("#w-af").value.split(",").filter((x) => x.trim() !== "").map(Number);
        const av = root.querySelector("#w-av").value.split(",").filter((x) => x.trim() !== "").map(Number);
        if (![fee, vsize, ...af, ...av].every(Number.isFinite)) throw new Error("numbers only");
        const pkg = packageRate({ fee, vsize }, af.map((f, i) => ({ fee: f, vsize: av[i] || 0 })));
        out.textContent = `Rate ${(fee / vsize).toFixed(2)} sat/vB. Package ${pkg.fee} over ${pkg.vsize}: ${pkg.rate.toFixed(2)} sat/vB.`;
      } catch (e) { out.textContent = e.message; }
    };
    ["#w-f", "#w-v", "#w-af", "#w-av"].forEach((id) => root.querySelector(id).addEventListener("input", upd));
    upd();
  } else if (kind === "rbf") {
    root.innerHTML = `<p class="brief">Mempool M: fee 1000, vsize 200, signals BIP125. Incremental relay 1 sat/vB.</p>`
      + `<label for="w-f">Replacement fee</label><input type="text" id="w-f" value="1200" autocomplete="off">`
      + `<label for="w-v">Replacement vsize</label><input type="text" id="w-v" value="200" autocomplete="off">`
      + `<p><label><input type="checkbox" id="w-p"> Spends a new unconfirmed parent</label></p>`
      + `<p class="verdict" id="w-out"></p>`;
    const mempool = { M: { fee: 1000, vsize: 200, signalled: true, parents: [] }, X: { fee: 500, vsize: 200, signalled: false, parents: [] } };
    const upd = () => {
      const out = root.querySelector("#w-out");
      const r = checkRBF({ fee: Number(root.querySelector("#w-f").value), vsize: Number(root.querySelector("#w-v").value), parents: root.querySelector("#w-p").checked ? ["X"] : [] }, ["M"], mempool, 1);
      out.textContent = r.ok ? "PASSES BIP125." : `FAILS: ${r.reason}`;
    };
    ["#w-f", "#w-v"].forEach((id) => root.querySelector(id).addEventListener("input", upd));
    root.querySelector("#w-p").addEventListener("change", upd);
    upd();
  } else if (kind === "moneyrange") {
    root.innerHTML = `<label for="w-a">Output A sats</label><input type="text" id="w-a" value="9222000000000000000" autocomplete="off">`
      + `<label for="w-b">Output B sats</label><input type="text" id="w-b" value="9222000000000000000" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const vs = [root.querySelector("#w-a").value.trim(), root.querySelector("#w-b").value.trim()].map(BigInt);
        const wrap = vulnerableSum(vs);
        const fix = patchedSum(vs);
        out.textContent = `Old code sum: ${wrap}. Patched: ${fix.ok ? `ok, ${fix.sum}` : fix.reason}`;
      } catch { out.textContent = "Type whole sats numbers."; }
    };
    root.querySelector("#w-a").addEventListener("input", upd);
    root.querySelector("#w-b").addEventListener("input", upd);
    upd();
  } else if (kind === "funding") {
    root.innerHTML = `<label for="w-a">Key A (66 hex)</label><input type="text" id="w-a" value="022f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4" autocomplete="off" spellcheck="false">`
      + `<label for="w-b">Key B (66 hex)</label><input type="text" id="w-b" value="03acd484e2f0c7f65309ad178a9f559abde09796974c57e714c35f110dfc27ccbe" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const ws = fundingWitnessScript(hexToBytes(root.querySelector("#w-a").value.trim().toLowerCase()), hexToBytes(root.querySelector("#w-b").value.trim().toLowerCase()));
        out.textContent = `Witness: ${bytesToHex(ws)} | P2WSH: ${bytesToHex(p2wshScript(ws))}`;
      } catch (e) { out.textContent = `Need hex keys: ${e.message}`; }
    };
    root.querySelector("#w-a").addEventListener("input", upd);
    root.querySelector("#w-b").addEventListener("input", upd);
    upd();
  } else if (kind === "htlc") {
    root.innerHTML = `<label for="w-r">Preimage R (64 hex)</label><input type="text" id="w-r" value="b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfee" autocomplete="off" spellcheck="false">`
      + `<label for="w-h">Height</label><input type="text" id="w-h" value="799000" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const R = hexToBytes(root.querySelector("#w-r").value.trim().toLowerCase());
        const H = paymentHash(R);
        const h = Number(root.querySelector("#w-h").value);
        const claim = htlcClaim(R, H, h, 800000), refund = htlcRefund(h, 800000);
        out.textContent = `H: ${bytesToHex(H)} | Claim at ${h}: ${claim.ok ? "wins" : claim.reason} | Refund at ${h}: ${refund.ok ? "wins" : refund.reason}`;
      } catch (e) { out.textContent = `Need hex R: ${e.message}`; }
    };
    root.querySelector("#w-r").addEventListener("input", upd);
    root.querySelector("#w-h").addEventListener("input", upd);
    upd();
  } else if (kind === "onion") {
    root.innerHTML = `<p class="brief">Toy cipher, NOT Sphinx. Blob for route B, C, D.</p>`
      + `<label for="w-b">Blob hex</label><input type="text" id="w-b" value="dbbe29528a24169d0a8ac586f72f8f7e53e71818c6" autocomplete="off" spellcheck="false">`
      + `<div class="btnrow"><button type="button" class="btn" id="w-p1">Peel as hop 1</button><button type="button" class="btn ghost" id="w-p2">Peel remainder as hop 2</button></div>`
      + `<p class="verdict" id="w-out">Peel twice.</p>`;
    let remainder = null;
    root.querySelector("#w-p1").addEventListener("click", () => {
      try {
        const r = toyOnionPeel(hexToBytes(root.querySelector("#w-b").value.trim().toLowerCase()), 0);
        remainder = r.remainder;
        root.querySelector("#w-out").textContent = `Hop 1 sees next: ${r.nextHop}. Remainder: ${bytesToHex(remainder)}`;
      } catch (e) { root.querySelector("#w-out").textContent = `Need hex blob: ${e.message}`; }
    });
    root.querySelector("#w-p2").addEventListener("click", () => {
      try {
        if (!remainder) { root.querySelector("#w-out").textContent = "Peel as hop 1 first."; return; }
        const r = toyOnionPeel(remainder, 1);
        root.querySelector("#w-out").textContent = `Hop 2 sees next: ${r.nextHop}.`;
      } catch (e) { root.querySelector("#w-out").textContent = e.message; }
    });
  } else if (kind === "routecalc") {
    const EDGES = { "A>B": [1000, 500, 40, 1000, 1000000], "A>C": [5000, 100, 144, 1000, 1000000], "A>D": [1000, 100, 40, 500000, 1000000], "B>E": [1000, 500, 40, 1000, 1000000], "C>E": [1000, 100, 40, 1000, 1000000], "D>E": [500, 50, 18, 1000, 1000000] };
    root.innerHTML = `<label for="w-p">Path like A,B,E</label><input type="text" id="w-p" value="A,B,E" autocomplete="off">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      const hops = root.querySelector("#w-p").value.replace(/\s+/g, "").toUpperCase().split(",");
      let fee = 0, cltv = 0;
      for (let i = 0; i + 1 < hops.length; i++) {
        const e = EDGES[`${hops[i]}>${hops[i + 1]}`];
        if (!e) { out.textContent = `No edge ${hops[i]} to ${hops[i + 1]}.`; return; }
        if (100000 < e[3] || 100000 > e[4]) { out.textContent = `Edge ${hops[i]} to ${hops[i + 1]} rejects 100000 msat (min ${e[3]}, cap ${e[4]}).`; return; }
        fee += e[0] + Math.floor((100000 * e[1]) / 1000000);
        cltv += e[2];
      }
      out.textContent = `Fee ${fee} msat, cltv ${cltv}. Valid.`;
    };
    root.querySelector("#w-p").addEventListener("input", upd);
    upd();
  } else if (kind === "invoice") {
    root.innerHTML = `<label for="w-i">Invoice</label><input type="text" id="w-i" value="lnbc10n1pj48ugqpp55vghu0pys4k7dvftwuv8u76zre3f6kmz6kkdrq60ztenrd7p4p3qdqsw3hhjgrrdanxvet9l6x3avdukdpjk8d4svlltu3zdkwttejuaeps2kxp3mf68jrvuxhng7at4za978yvgtex7ywjv4dzntkq0aarddzgqeng90pthhav4wqxh6z2g" autocomplete="off" spellcheck="false">`
      + `<label for="w-k">Node key (66 hex)</label><input type="text" id="w-k" value="02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27" autocomplete="off" spellcheck="false">`
      + `<p class="verdict" id="w-out"></p>`;
    const upd = () => {
      const out = root.querySelector("#w-out");
      try {
        const d = invoiceDecode(root.querySelector("#w-i").value.trim().toLowerCase(), hexToBytes(root.querySelector("#w-k").value.trim().toLowerCase()));
        const tags = d.tags.map((t) => `${t.tag === 1 ? "p" : t.tag === 13 ? "d" : `tag${t.tag}`}:${bytesToHex(Uint8Array.from(convertBits(t.data, 5, 8, false)))}`).join(" ");
        out.textContent = `${d.hrp}, time ${d.timestamp}, sig ${d.sigOk ? "valid" : "INVALID"}. Tags ${tags}`;
      } catch (e) { out.textContent = `broken: ${e.message}`; }
    };
    root.querySelector("#w-i").addEventListener("input", upd);
    root.querySelector("#w-k").addEventListener("input", upd);
    upd();
  }
}
function renderDebugger(puzzle, root) {
  root.innerHTML = `<p class="brief">Lock: <code>${esc(puzzle.lock)}</code></p>`
    + `<label for="w-asm">Unlock script (this box is your answer)</label>`
    + `<textarea id="w-asm" spellcheck="false">${esc(puzzle.preset || "")}</textarea>`
    + `<div class="btnrow"><button type="button" class="btn" id="w-run">Run</button>`
    + `<button type="button" class="btn ghost" id="w-step">Step</button>`
    + `<button type="button" class="btn ghost" id="w-reset">Reset</button></div>`
    + `<p class="verdict" id="w-status" hidden></p>`
    + `<div id="w-trace"></div>`;
  let trace = [], idx = -1, done = null;
  const show = () => {
    const status = root.querySelector("#w-status");
    if (!done) { status.hidden = true; }
    else if (idx < trace.length - 1) {
      status.hidden = false;
      status.className = "verdict";
      status.textContent = `Step ${idx + 1} of ${trace.length}.`;
    } else {
      status.hidden = false;
      status.className = `verdict ${done.ok ? "ok" : "bad"}`;
      status.textContent = done.ok ? `PASS in ${done.ops} ops.` : `FAIL: ${done.error}`;
    }
    const box = root.querySelector("#w-trace");
    if (!trace.length) { box.innerHTML = ""; return; }
    const rows = trace.map((t, i) => `<tr${i === idx ? ' style="background:color-mix(in srgb,var(--acc) 18%,transparent)"' : ""}><td>${i}</td><td>${esc(t.op)}</td><td>${t.stack.map(esc).join("<br>") || "(empty)"}</td></tr>`).join("");
    box.innerHTML = `<table class="trace"><tr><th>#</th><th>op</th><th>stack</th></tr>${rows}</table>`
      + (done ? `<p class="verdict ${done.ok ? "ok" : "bad"}">${esc(done.ok ? "PASS" : `FAIL: ${done.error}`)}</p>` : "");
  };
  const compile = () => {
    const raw = parseAsm(root.querySelector("#w-asm").value);
    return disassemble(raw).map((o) => o.push || new Uint8Array(0));
  };
  const ctxFor = () => {
    const c = {};
    if (puzzle.ctx?.msgHash) c.msgHash = hexToBytes(puzzle.ctx.msgHash);
    if (puzzle.ctx?.tapMsg) c.tapMsg = hexToBytes(puzzle.ctx.tapMsg);
    return c;
  };
  root.querySelector("#w-run").addEventListener("click", () => {
    try {
      const r = execute(parseAsm(puzzle.lock), compile(), ctxFor());
      trace = r.trace; idx = trace.length - 1; done = r;
    } catch (e) { trace = []; idx = -1; done = { ok: false, error: e.message }; }
    show();
  });
  root.querySelector("#w-step").addEventListener("click", () => {
    try {
      if (!trace.length) {
        const r = execute(parseAsm(puzzle.lock), compile(), ctxFor());
        trace = r.trace; done = r; idx = -1;
      }
      if (idx < trace.length - 1) idx++;
    } catch (e) { trace = []; idx = -1; done = { ok: false, error: e.message }; }
    show();
  });
  root.querySelector("#w-reset").addEventListener("click", () => { trace = []; idx = -1; done = null; show(); });
}
// Render one puzzle into app. Stores progress and achievements. nextId links onward.
export function renderPuzzle(app, puzzle, state, nextId, allPuzzles = []) {
  const simp = puzzle.simplified ? `<span class="badge">Simplified</span>` : "";
  let inputHtml = "";
  if (puzzle.input === "choice") {
    inputHtml = puzzle.choices.map((c) => `<button type="button" class="btn ghost pick" data-v="${esc(c)}">${esc(c)}</button>`).join("");
    inputHtml = `<div class="btnrow" id="answer-row">${inputHtml}</div>`;
  } else if (puzzle.input === "script" && puzzle.widget === "debugger") {
    inputHtml = ""; // the debugger box above is the answer box
  } else if (puzzle.input === "script") {
    inputHtml = `<label for="answer">Unlock script</label><textarea id="answer" spellcheck="false">${esc(puzzle.preset || "")}</textarea>`;
  } else {
    inputHtml = `<label for="answer">Answer</label><input type="text" id="answer" autocomplete="off" spellcheck="false">`;
  }
  app.innerHTML = `<section class="puz"><p><a href="#/chapter/${puzzle.ch}">&lt; Chapter</a></p>`
    + `<h2>${esc(puzzle.id)} ${esc(puzzle.title)}${simp}</h2><p class="brief">${esc(puzzle.briefing)}</p>`
    + `<div id="widget"></div>`
    + `<p><b>${esc(puzzle.prompt)}</b></p>${puzzle.code ? `<p class="verdict">${esc(puzzle.code)}</p>` : ""}${puzzle.ask ? `<p>${esc(puzzle.ask)}</p>` : ""}`
    + `${inputHtml}`
    + (puzzle.input !== "choice" ? `<div class="btnrow"><button type="button" class="btn" id="check">Check</button><button type="button" class="btn ghost" id="hint">Hint</button></div>` : `<div class="btnrow"><button type="button" class="btn ghost" id="hint">Hint</button></div>`)
    + `<p class="verdict" id="verdict" hidden></p><div id="hintbox"></div><div id="debrief"></div></section>`;
  renderWidget(puzzle.widget || "none", puzzle, app.querySelector("#widget"));
  let hintsShown = 0;
  app.querySelector("#hint").addEventListener("click", () => {
    const box = app.querySelector("#hintbox");
    if (hintsShown < puzzle.hints.length) {
      box.innerHTML += `<p class="verdict">${esc(puzzle.hints[hintsShown])}</p>`;
      hintsShown++;
    }
  });
  const grade = (answer) => {
    const r = puzzle.check(answer);
    const v = app.querySelector("#verdict");
    v.hidden = false;
    v.className = `verdict ${r.ok ? "ok" : "bad"}`;
    if (!r.ok) { v.textContent = r.message; return; }
    const stars = starsFor({ bytes: r.bytes, ops: r.ops, sats: r.sats }, puzzle.par, puzzle.scored);
    let next = recordSolve(state, puzzle.id, { bytes: r.bytes, ops: r.ops, sats: r.sats }, stars);
    const fresh = allPuzzles.length ? checkAchievements(next, allPuzzles) : [];
    for (const id of fresh) next = unlockAchievement(next, id);
    Object.assign(state, next);
    saveState(state);
    const medals = fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.title).filter(Boolean);
    v.textContent = `${r.message} Cost ${formatCost({ bytes: r.bytes, ops: r.ops, sats: r.sats })}. ${stars} of 3 stars.${medals.length ? ` Achievement: ${medals.join(", ")}.` : ""}`;
    const src = puzzle.debrief.map((s) => `<li>${esc(s)}</li>`).join("");
    app.querySelector("#debrief").innerHTML = `<div class="debrief"><h3>Debrief: ${esc(puzzle.idea)}</h3>`
      + (puzzle.simplified ? `<p><span class="badge">Simplified</span> ${esc(puzzle.simplified)}</p>` : "")
      + `<ul>${src}</ul>${nextId ? `<p><a href="#/puzzle/${nextId}">Next puzzle&gt;</a></p>` : `<p><a href="#/">Back to campaign.</a></p>`}</div>`;
  };
  if (puzzle.input === "choice") {
    app.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => grade(b.getAttribute("data-v"))));
  } else if (puzzle.input === "script" && puzzle.widget === "debugger") {
    app.querySelector("#check").addEventListener("click", () => grade(app.querySelector("#w-asm").value));
  } else {
    const box = app.querySelector("#answer");
    app.querySelector("#check").addEventListener("click", () => grade(box.value));
    box.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); grade(box.value); }
    });
  }
}
// Sandbox: a free interpreter playground. Nothing here is scored.
export function renderSandbox(app) {
  app.innerHTML = `<section class="puz"><h2>Sandbox</h2><p class="brief">Free stack machine. Write any lock and unlock, set toy context, step through. Nothing here is scored. Toy hashes only.</p>`
    + `<label for="sb-lock">Lock script</label><textarea id="sb-lock" spellcheck="false">OP_DUP OP_HASH160 &lt;5dedfbf9ea599dd4e3ca6a80b333c472fd0b3f69&gt; OP_EQUALVERIFY OP_CHECKSIG</textarea>`
    + `<label for="sb-unlock">Unlock script</label><textarea id="sb-unlock" spellcheck="false"></textarea>`
    + `<label for="sb-msg">Message hash hex (for CHECKSIG, blank to skip sigs)</label><input type="text" id="sb-msg" value="" autocomplete="off" spellcheck="false">`
    + `<label for="sb-locktime">Tx locktime (for CLTV, blank when unused)</label><input type="text" id="sb-locktime" value="" autocomplete="off">`
    + `<div class="btnrow"><button type="button" class="btn" id="sb-run">Run</button><button type="button" class="btn ghost" id="sb-step">Step</button><button type="button" class="btn ghost" id="sb-reset">Reset</button></div>`
    + `<div id="sb-trace"></div></section>`;
  let trace = [], idx = -1, done = null;
  const show = () => {
    const box = app.querySelector("#sb-trace");
    if (!trace.length && !done) { box.innerHTML = ""; return; }
    const rows = trace.map((t, i) => `<tr${i === idx ? ' style="background:color-mix(in srgb,var(--acc) 18%,transparent)"' : ""}><td>${i}</td><td>${esc(t.op)}</td><td>${t.stack.map(esc).join("<br>") || "(empty)"}</td></tr>`).join("");
    box.innerHTML = (trace.length ? `<table class="trace"><tr><th>#</th><th>op</th><th>stack</th></tr>${rows}</table>` : "")
      + (done ? `<p class="verdict ${done.ok ? "ok" : "bad"}">${esc(done.ok ? `PASS in ${done.ops} ops` : `FAIL: ${done.error}`)}</p>` : "");
  };
  const compileAll = () => {
    const unlock = disassemble(parseAsm(app.querySelector("#sb-unlock").value)).map((o) => o.push || new Uint8Array(0));
    const lock = parseAsm(app.querySelector("#sb-lock").value);
    const ctx = {};
    const mh = app.querySelector("#sb-msg").value.trim();
    if (mh) ctx.msgHash = hexToBytes(mh.toLowerCase());
    const lt = app.querySelector("#sb-locktime").value.trim();
    if (lt !== "") { ctx.txLocktime = Number(lt); ctx.inputSequence = 0xfffffffe; }
    return { lock, unlock, ctx };
  };
  app.querySelector("#sb-run").addEventListener("click", () => {
    try {
      const { lock, unlock, ctx } = compileAll();
      const r = execute(lock, unlock, ctx);
      trace = r.trace; idx = trace.length - 1; done = r;
    } catch (e) { trace = []; idx = -1; done = { ok: false, error: e.message }; }
    show();
  });
  app.querySelector("#sb-step").addEventListener("click", () => {
    try {
      if (!trace.length && !done) {
        const { lock, unlock, ctx } = compileAll();
        const r = execute(lock, unlock, ctx);
        trace = r.trace; done = r; idx = -1;
      }
      if (idx < trace.length - 1) idx++;
    } catch (e) { trace = []; idx = -1; done = { ok: false, error: e.message }; }
    show();
  });
  app.querySelector("#sb-reset").addEventListener("click", () => { trace = []; idx = -1; done = null; show(); });
}
// Achievements board: locked and unlocked side by side.
export function renderAchievements(app, state) {
  const items = ACHIEVEMENTS.map((a) => {
    const got = state.achievements.includes(a.id);
    return `<li class="card${got ? " done" : ""}"><h2>${got ? "★" : "☆"} ${esc(a.title)}</h2><p>${esc(a.desc)}</p></li>`;
  }).join("");
  app.innerHTML = `<section class="puz"><h2>Achievements</h2><p class="brief">${state.achievements.length} of ${ACHIEVEMENTS.length} unlocked.</p><div class="btnrow"><button type="button" class="btn ghost" id="reset">Reset progress</button></div></section><ul class="grid">${items}</ul>`;
  app.querySelector("#reset").addEventListener("click", () => {
    if (!window.confirm("Erase all progress and achievements on this device?")) return;
    resetState();
    Object.assign(state, blankState());
    renderAchievements(app, state);
  });
}
