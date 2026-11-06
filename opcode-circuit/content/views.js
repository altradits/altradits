// Opcode Circuit puzzle views: briefing, widgets, inputs, verdict, debrief.
// Widgets are small teaching tools: hash pads, a miner, a script debugger.
import { hexToBytes, bytesToHex, sha256, doubleSha256, segwitDecode, base58CheckDecode, concat, bytesToBig, bigToBytes, pointMult, ecdsaSign, derEncode, SECP_N } from "../sim/primitives.js";
import { parseAsm, execute, disassemble } from "../sim/interpreter.js";
import { blockHashOf, hashMeetsBits } from "../sim/toychain.js";
import { starsFor, formatCost } from "../engine/score.js";
import { recordSolve, saveState } from "../engine/store.js";
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
            out.textContent = `Won at nonce ${n} after ${n + 1} tries. Type it below.`;
            const ans = document.getElementById("answer");
            if (ans) ans.value = String(n);
            return;
          }
        }
        start += 20000;
        out.textContent = `Tried ${start} nonces, still over target...`;
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
  }
}
function renderDebugger(puzzle, root) {
  root.innerHTML = `<p class="brief">Lock: <code>${esc(puzzle.lock)}</code></p>`
    + `<label for="w-asm">Unlock script (also the answer box below stays in sync)</label>`
    + `<textarea id="w-asm" spellcheck="false">${esc(puzzle.preset || "")}</textarea>`
    + `<div class="btnrow"><button type="button" class="btn" id="w-run">Run</button>`
    + `<button type="button" class="btn ghost" id="w-step">Step</button>`
    + `<button type="button" class="btn ghost" id="w-reset">Reset</button></div>`
    + `<div id="w-trace"></div>`;
  let trace = [], idx = -1, done = null;
  const show = () => {
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
    const ans = document.getElementById("answer");
    if (ans && ans.tagName === "TEXTAREA") ans.value = root.querySelector("#w-asm").value;
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
// Render one puzzle into app. onSolved stores progress. nextId links onward.
export function renderPuzzle(app, puzzle, state, nextId) {
  const simp = puzzle.simplified ? `<span class="badge">Simplified</span>` : "";
  let inputHtml = "";
  if (puzzle.input === "choice") {
    inputHtml = puzzle.choices.map((c) => `<button type="button" class="btn ghost pick" data-v="${esc(c)}">${esc(c)}</button>`).join("");
    inputHtml = `<div class="btnrow" id="answer-row">${inputHtml}</div>`;
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
    const next = recordSolve(state, puzzle.id, { bytes: r.bytes, ops: r.ops, sats: r.sats }, stars);
    Object.assign(state, next);
    saveState(state);
    v.textContent = `${r.message} Cost ${formatCost({ bytes: r.bytes, ops: r.ops, sats: r.sats })}. ${stars} of 3 stars.`;
    const src = puzzle.debrief.map((s) => `<li>${esc(s)}</li>`).join("");
    app.querySelector("#debrief").innerHTML = `<div class="debrief"><h3>Debrief: ${esc(puzzle.idea)}</h3>`
      + (puzzle.simplified ? `<p><span class="badge">Simplified</span> ${esc(puzzle.simplified)}</p>` : "")
      + `<ul>${src}</ul>${nextId ? `<p><a href="#/puzzle/${nextId}">Next puzzle&gt;</a></p>` : `<p><a href="#/">Back to campaign.</a></p>`}</div>`;
  };
  if (puzzle.input === "choice") {
    app.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => grade(b.getAttribute("data-v"))));
  } else {
    app.querySelector("#check").addEventListener("click", () => grade(app.querySelector("#answer").value));
  }
}
